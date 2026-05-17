import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/session';
import { sendInviteTemplateEmail } from '$lib/server/emailTemplates';
import { getPublicAppOrigin } from '$lib/server/publicAppUrl';
import { generateInviteCode, hashInviteCode } from '$lib/server/inviteCode';

const REQUIRED_PERMISSION = 'auth.manage';

type CreateInvitePayload = {
	action: 'create';
	email: string;
	initialAppId?: string | null;
};

type ResendInvitePayload = {
	action: 'resend';
	inviteId: string;
};

type RevokeInvitePayload = {
	action: 'revoke';
	inviteId: string;
};

type InvitePayload = CreateInvitePayload | ResendInvitePayload | RevokeInvitePayload;

function hasManageAccess(session: Awaited<ReturnType<typeof validateSessionToken>>) {
	if (!session.authenticated) return false;
	return session.user.isAdmin || (session.user.permissions ?? []).includes(REQUIRED_PERMISSION);
}

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
	return Boolean(value) && value.includes('@') && value.includes('.') && !value.includes(' ');
}

function sanitizeRedirectTarget(value: string): string {
	const raw = value.trim();
	if (!raw.startsWith('/')) return '/';
	if (raw.startsWith('//')) return '/';
	return raw;
}

function getInviteRedirect(appEndpoint: string | null): string {
	if (!appEndpoint) return '/';
	return sanitizeRedirectTarget(appEndpoint);
}

function getLoginInviteUrl(origin: string, redirectTo: string): string {
	return `${origin}/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`;
}

async function grantInitialAccessByEmail(
	email: string,
	appId: string,
	permission: string,
	grantedBy: string
) {
	const db = getDb();
	const userResult = await db.query(
		`
		select id
		from users
		where lower(email) = lower($1)
		limit 1
		`,
		[email]
	);
	const user = userResult.rows[0];
	if (!user?.id) return;

	await db.query(
		`
		insert into user_app_permissions (
			user_id,
			app_id,
			permission,
			granted_by,
			granted_at,
			revoked_at
		)
		values ($1, $2, $3, $4, now(), null)
		on conflict (user_id, app_id, permission)
		do update set
			granted_by = excluded.granted_by,
			granted_at = now(),
			revoked_at = null
		`,
		[user.id, appId, permission, grantedBy]
	);
}

export const POST: RequestHandler = async ({ cookies, request }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	const session = await validateSessionToken(token);
	if (!hasManageAccess(session)) {
		throw error(403, 'You do not have permission to manage invites.');
	}

	let payload: InvitePayload;
	try {
		payload = (await request.json()) as InvitePayload;
	} catch {
		throw error(400, 'Invalid JSON payload.');
	}

	const db = getDb();
	const publicOrigin = getPublicAppOrigin();

	await db.query(
		`
		delete from invites
		where used_at is not null
			or revoked_at is not null
		`
	);

	if (payload.action === 'create') {
		const email = normalizeEmail(payload.email ?? '');
		if (!isValidEmail(email)) {
			throw error(400, 'A valid email is required.');
		}

		const appId = payload.initialAppId?.trim() || null;
		let appEndpoint: string | null = null;
		let permission: string | null = null;

		if (appId) {
			const appResult = await db.query(
				`
				select id, endpoint, required_permission
				from app_registry
				where id = $1
					and enabled = true
				limit 1
				`,
				[appId]
			);
			const app = appResult.rows[0];
			if (!app) throw error(400, 'Selected app was not found.');
			appEndpoint = app.endpoint;
			permission = app.required_permission || `${app.id}.access`;
		}

		const redirectTo = getInviteRedirect(appEndpoint);
		const inviteUrl = getLoginInviteUrl(publicOrigin, redirectTo);

		const inviteCode = generateInviteCode();
		const codeHash = hashInviteCode(inviteCode);

		try {
			await sendInviteTemplateEmail(email, inviteUrl, inviteCode);
		} catch (err) {
			throw error(502, 'Unable to send invite email right now.');
		}

		await db.query(
			`
			insert into invites (
				email,
				code_hash,
				initial_app_id,
				redirect_to,
				created_by,
				expires_at,
				sent_at,
				email_error
			)
			values (
				$1,
				$2,
				$3,
				$4,
				$5,
				now() + interval '14 days',
				now(),
				null
			)
			`,
			[email, codeHash, appId, redirectTo, session.user.id]
		);

		if (appId && permission) {
			await grantInitialAccessByEmail(email, appId, permission, session.user.id);
		}

		return json({
			success: true,
			email,
			redirectTo,
			initialAppId: appId
		});
	}

	if (payload.action === 'resend') {
		const inviteId = payload.inviteId?.trim();
		if (!inviteId) throw error(400, 'Invite id is required.');

		const result = await db.query(
			`
			select i.id, i.email, i.revoked_at, i.used_at, i.redirect_to
			from invites i
			where i.id = $1
			limit 1
			`,
			[inviteId]
		);
		const invite = result.rows[0];
		if (!invite) throw error(404, 'Invite not found.');
		if (invite.revoked_at || invite.used_at) throw error(400, 'Only pending invites can be resent.');

		const redirectTo = getInviteRedirect(invite.redirect_to ?? null);
		const inviteUrl = getLoginInviteUrl(publicOrigin, redirectTo);
		const inviteCode = generateInviteCode();
		const codeHash = hashInviteCode(inviteCode);

		try {
			await sendInviteTemplateEmail(invite.email, inviteUrl, inviteCode);
			await db.query(
				`
				update invites
				set sent_at = now(), email_error = null, code_hash = $2
				where id = $1
				`,
				[inviteId, codeHash]
			);
		} catch (err) {
			await db.query(
				`
				update invites
				set email_error = $2
				where id = $1
				`,
				[inviteId, err instanceof Error ? err.message.slice(0, 500) : 'Send failed']
			);
			throw error(502, 'Unable to resend invite right now.');
		}

		return json({ success: true });
	}

	if (payload.action === 'revoke') {
		const inviteId = payload.inviteId?.trim();
		if (!inviteId) throw error(400, 'Invite id is required.');

		const result = await db.query(
			`
			delete from invites
			where id = $1
				and used_at is null
			`,
			[inviteId]
		);
		if (!result.rowCount) {
			throw error(404, 'Invite not found.');
		}
		return json({ success: true });
	}

	throw error(400, 'Unsupported action.');
};
