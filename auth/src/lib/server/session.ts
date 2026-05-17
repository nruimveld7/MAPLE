import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	SESSION_COOKIE_NAME,
	SESSION_COOKIE_OPTIONS,
	SESSION_DAYS
} from '$lib/server/authConstants';

export { SESSION_COOKIE_NAME };

export type AuthenticatedSession = {
	authenticated: true;
	user: {
		id: string;
		email: string;
		firstName: string;
		lastName: string;
		isAdmin: boolean;
		permissions: string[];
		themeMode: 'light' | 'dark' | 'system';
		primaryColor: string;
		secondaryColor: string;
		signedInWithTempPassword: boolean;
	};
};

export type AnonymousSession = {
	authenticated: false;
};

export type SessionValidationResult = AuthenticatedSession | AnonymousSession;

export function createSessionToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(
	userId: string,
	cookies: Cookies,
	options?: { usedTempPassword?: boolean }
): Promise<void> {
	const db = getDb();

	const token = createSessionToken();
	const tokenHash = hashToken(token);

	await db.query(
		`
		insert into sessions (
			user_id,
			token_hash,
			used_temp_password,
			expires_at,
			last_seen_at
		)
		values (
			$1,
			$2,
			$3,
			now() + ($4 || ' days')::interval,
			now()
		)
		`,
		[userId, tokenHash, Boolean(options?.usedTempPassword), SESSION_DAYS]
	);

	cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export async function revokeSessionToken(token: string | undefined): Promise<void> {
	if (!token) {
		return;
	}

	const db = getDb();
	const tokenHash = hashToken(token);

	await db.query(
		`
		update sessions
		set revoked_at = now()
		where token_hash = $1
			and revoked_at is null
		`,
		[tokenHash]
	);
}

export async function validateSessionToken(
	token: string | undefined
): Promise<SessionValidationResult> {
	if (!token) {
		return {
			authenticated: false
		};
	}

	const db = getDb();
	const tokenHash = hashToken(token);

	const result = await db.query(
		`
		select
			u.id,
			u.email,
			u.first_name,
			u.last_name,
			u.is_admin,
			u.theme_mode,
			u.primary_color,
			u.secondary_color,
			s.used_temp_password
		from sessions s
		inner join users u on u.id = s.user_id
		where s.token_hash = $1
			and s.revoked_at is null
			and s.expires_at > now()
			and u.is_active = true
		limit 1
		`,
		[tokenHash]
	);

	const user = result.rows[0];

	if (!user) {
		return {
			authenticated: false
		};
	}

	await db.query(
		`
		update sessions
		set last_seen_at = now()
		where token_hash = $1
		`,
		[tokenHash]
	);

	const permissionsResult = await db.query(
		`
		select permission
		from user_app_permissions
		where user_id = $1
			and revoked_at is null
		order by permission asc
		`,
		[user.id]
	);

	const permissions: string[] = permissionsResult.rows.map((row) => row.permission);

	if (user.is_admin) {
		for (const permission of ['auth.manage', 'platform.manage']) {
			if (!permissions.includes(permission)) {
				permissions.push(permission);
			}
		}
	}

	return {
		authenticated: true,
		user: {
			id: user.id,
			email: user.email,
			firstName: user.first_name,
			lastName: user.last_name,
			isAdmin: user.is_admin,
			permissions,
			themeMode: user.theme_mode,
			primaryColor: user.primary_color,
			secondaryColor: user.secondary_color,
			signedInWithTempPassword: user.used_temp_password === true
		}
	};
}
