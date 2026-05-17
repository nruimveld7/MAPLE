import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/session';

type ManageUserPayload =
	| {
			action: 'set-admin';
			isAdmin: boolean;
	  }
	| {
			action: 'set-app-access';
			appId: string;
			granted: boolean;
			permission?: string | null;
	  };

const REQUIRED_PERMISSION = 'auth.manage';

function hasManageAccess(session: Awaited<ReturnType<typeof validateSessionToken>>) {
	if (!session.authenticated) {
		return false;
	}

	return session.user.isAdmin || (session.user.permissions ?? []).includes(REQUIRED_PERMISSION);
}

export const PATCH: RequestHandler = async ({ cookies, params, request }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	const session = await validateSessionToken(token);

	if (!hasManageAccess(session)) {
		throw error(403, 'You do not have permission to manage users.');
	}

	const userId = params.userId;
	if (!userId) {
		throw error(400, 'Missing user id.');
	}

	let payload: ManageUserPayload;
	try {
		payload = (await request.json()) as ManageUserPayload;
	} catch {
		throw error(400, 'Invalid JSON payload.');
	}

	const db = getDb();

	if (payload.action === 'set-admin') {
		const result = await db.query(
			`
			update users
			set
				is_admin = $2,
				updated_at = now()
			where id = $1
			returning id, is_admin
			`,
			[userId, payload.isAdmin]
		);

		if (!result.rowCount) {
			throw error(404, 'User not found.');
		}

		return json({ success: true, userId, isAdmin: result.rows[0].is_admin });
	}

	if (payload.action === 'set-app-access') {
		const appId = payload.appId?.trim();
		if (!appId) {
			throw error(400, 'App id is required.');
		}
		const permission = payload.permission?.trim() || `${appId}.access`;

		if (payload.granted) {
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
				values (
					$1,
					$2,
					$3,
					$4,
					now(),
					null
				)
				on conflict (user_id, app_id, permission)
				do update set
					granted_by = excluded.granted_by,
					granted_at = now(),
					revoked_at = null
				`,
				[userId, appId, permission, session.authenticated ? session.user.id : null]
			);
		} else {
			await db.query(
				`
				update user_app_permissions
				set revoked_at = now()
				where user_id = $1
					and app_id = $2
					and revoked_at is null
				`,
				[userId, appId]
			);
		}

		return json({
			success: true,
			userId,
			appId,
			granted: payload.granted
		});
	}

	throw error(400, 'Unsupported action.');
};
