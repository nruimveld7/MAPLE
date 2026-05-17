import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/session';
import type { PageServerLoad } from './$types';

const REQUIRED_PERMISSION = 'auth.manage';

function getPlatformOrigin() {
	return env.PLATFORM_ORIGIN ?? 'http://platform:3000';
}

function getPlatformBasePath() {
	return env.PLATFORM_BASE_PATH ?? '/platform';
}

function getPlatformCatalogUrl() {
	return `${getPlatformOrigin()}${getPlatformBasePath()}/api/catalog`;
}

function getPlatformCatalogFallbackUrl() {
	return `${getPlatformOrigin()}/api/catalog`;
}

async function fetchPlatformApps(cookieHeader: string) {
	const urls = [getPlatformCatalogUrl(), getPlatformCatalogFallbackUrl()];
	let lastError: unknown;

	for (const url of urls) {
		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					cookie: cookieHeader,
					'Cache-Control': 'no-store'
				}
			});
			const contentType = response.headers.get('content-type');
			const rawBody = await response.text();
			if (!response.ok) {
				lastError = `status ${response.status} from ${url}`;
				continue;
			}

			let payload: Record<string, unknown>;
			try {
				payload = rawBody ? JSON.parse(rawBody) : {};
			} catch (err) {
				lastError = err;
				continue;
			}
			return payload.apps ?? [];
		} catch (err) {
			lastError = err;
		}
	}
	throw error(503, 'Unable to load app catalog from Platform.');
}

function formatDate(value: Date | string | null | undefined): string {
	if (!value) {
		return '';
	}

	const date = value instanceof Date ? value : new Date(value);

	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	}).format(date);
}

function getInviteStatus(invite: {
	used_at: Date | string | null;
	revoked_at: Date | string | null;
	expires_at: Date | string | null;
}): 'pending' | 'used' | 'revoked' | 'expired' {
	if (invite.revoked_at) {
		return 'revoked';
	}

	if (invite.used_at) {
		return 'used';
	}

	if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
		return 'expired';
	}

	return 'pending';
}

function getInviteExpiresLabel(invite: {
	used_at: Date | string | null;
	revoked_at: Date | string | null;
	expires_at: Date | string | null;
}) {
	if (invite.used_at) {
		return `Used ${formatDate(invite.used_at)}`;
	}

	if (invite.revoked_at) {
		return `Revoked ${formatDate(invite.revoked_at)}`;
	}

	if (invite.expires_at) {
		return `Expires ${formatDate(invite.expires_at)}`;
	}

	return '';
}

function getInviteDelivery(invite: {
	sent_at: Date | string | null;
	email_error: string | null;
}): 'sent' | 'email_error' | 'not_sent' {
	if (invite.email_error) {
		return 'email_error';
	}

	if (invite.sent_at) {
		return 'sent';
	}

	return 'not_sent';
}

export const load: PageServerLoad = async (event) => {
	const token = event.cookies.get(SESSION_COOKIE_NAME);
	const session = await validateSessionToken(token);

	if (!session.authenticated) {
		throw redirect(
			303,
			`/auth/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}

	const permissions = session.user.permissions ?? [];
	const isAdmin = Boolean(session.user.isAdmin);

	if (!isAdmin && !permissions.includes(REQUIRED_PERMISSION)) {
		throw error(403, 'You do not have access to the Auth Portal.');
	}

	const db = getDb();
	await db.query(
		`
		delete from invites
		where used_at is not null
			or revoked_at is not null
		`
	);

	const apps = await fetchPlatformApps(event.request.headers.get('cookie') ?? '');
	const appTitleById = new Map<string, string>(
		apps
			.filter((app): app is { id: string; title: string } => Boolean(app?.id && app?.title))
			.map((app) => [app.id, app.title])
	);

	const usersResult = await db.query(`
		select
			u.id,
			u.email,
			u.first_name,
			u.last_name,
			u.is_active,
			u.is_admin,
			coalesce(
				array_remove(array_agg(distinct uap.app_id order by uap.app_id), null),
				array[]::text[]
			) as app_access_ids
		from users u
		left join user_app_permissions uap
			on uap.user_id = u.id
			and uap.revoked_at is null
		group by
			u.id,
			u.email,
			u.first_name,
			u.last_name,
			u.is_active,
			u.is_admin
		order by
			u.created_at desc
	`);

	const users = usersResult.rows.map((user) => {
		const accessIds = user.is_admin
			? Array.from(new Set(['auth', ...(user.app_access_ids ?? [])]))
			: user.app_access_ids ?? [];
		const accessTitles = accessIds.map((id: string) => appTitleById.get(id) ?? id);
		return {
			id: user.id,
			firstName: user.first_name,
			lastName: user.last_name,
			email: user.email,
			status: user.is_active ? 'active' : 'inactive',
			isAdmin: user.is_admin,
			appAccessIds: accessIds,
			appAccess: accessTitles
		};
	});

	const invitesResult = await db.query(`
		select
			id,
			email,
			expires_at,
			sent_at,
			used_at,
			revoked_at,
			email_error
		from invites
		order by
			created_at desc
	`);

	const invites = invitesResult.rows.map((invite) => ({
		id: invite.id,
		email: invite.email,
		status: getInviteStatus(invite),
		expiresLabel: getInviteExpiresLabel(invite),
		delivery: getInviteDelivery(invite)
	}));

	return {
		session,
		user: {
			...session.user,
			permissions
		},
		users,
		invites,
		apps
	};
};
