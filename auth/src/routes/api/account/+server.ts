import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE_NAME, hashToken, validateSessionToken } from '$lib/server/session';
import { hash, verify } from '@node-rs/argon2';

type ThemeMode = 'light' | 'dark' | 'system';

type AccountPatchPayload = {
	action: 'appearance';
	themeMode: ThemeMode;
	primaryColor: string;
	secondaryColor: string;
} | {
	action: 'name';
	firstName: string;
	lastName: string;
} | {
	action: 'email';
	email: string;
} | {
	action: 'password';
	currentPassword?: string;
	newPassword: string;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(value: string): string | null {
	const raw = String(value).trim();
	const withHash = raw.startsWith('#') ? raw : `#${raw}`;
	return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : null;
}

function isThemeMode(value: unknown): value is ThemeMode {
	return value === 'light' || value === 'dark' || value === 'system';
}

export const PATCH: RequestHandler = async ({ cookies, request }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	const session = await validateSessionToken(token);

	if (!session.authenticated) {
		throw error(401, 'Unauthorized.');
	}

	let payload: AccountPatchPayload;
	try {
		payload = (await request.json()) as AccountPatchPayload;
	} catch {
		throw error(400, 'Invalid JSON payload.');
	}

	const db = getDb();

	if (payload.action === 'appearance') {
		if (!isThemeMode(payload.themeMode)) {
			throw error(400, 'Invalid theme mode.');
		}

		const primaryColor = normalizeHex(payload.primaryColor);
		const secondaryColor = normalizeHex(payload.secondaryColor);

		if (!primaryColor || !secondaryColor) {
			throw error(400, 'Invalid accent color values.');
		}

		const appearanceResult = await db.query(
			`
			update users
			set
				theme_mode = $2,
				primary_color = $3,
				secondary_color = $4,
				updated_at = now()
			where id = $1
			returning theme_mode, primary_color, secondary_color
			`,
			[session.user.id, payload.themeMode, primaryColor, secondaryColor]
		);

		if (appearanceResult.rowCount !== 1) {
			throw error(404, 'User not found.');
		}

		const appearance = appearanceResult.rows[0];

		return json({
			success: true,
			themeMode: appearance.theme_mode,
			primaryColor: appearance.primary_color,
			secondaryColor: appearance.secondary_color
		});
	}

	if (payload.action === 'name') {
		const firstName = payload.firstName.trim();
		const lastName = payload.lastName.trim();
		if (!firstName && !lastName) {
			throw error(400, 'At least one name value is required.');
		}

		const nameResult = await db.query(
			`
			update users
			set
				first_name = $2,
				last_name = $3,
				updated_at = now()
			where id = $1
			returning first_name, last_name
			`,
			[session.user.id, firstName || session.user.firstName, lastName || session.user.lastName]
		);

		if (nameResult.rowCount !== 1) {
			throw error(404, 'User not found.');
		}

		const updatedName = nameResult.rows[0];

		return json({
			success: true,
			firstName: updatedName.first_name,
			lastName: updatedName.last_name
		});
	}

	if (payload.action === 'email') {
		const email = payload.email.trim().toLowerCase();
		if (!email || !email.includes('@') || !email.includes('.') || email.includes(' ')) {
			throw error(400, 'Invalid email.');
		}

		let emailResult;
		try {
			emailResult = await db.query(
				`
				update users
				set
					email = $2,
					updated_at = now()
				where id = $1
				returning email
				`,
				[session.user.id, email]
			);
		} catch (err: unknown) {
			if (typeof err === 'object' && err && 'code' in err && err.code === '23505') {
				throw error(409, 'Email already in use.');
			}
			throw err;
		}

		if (!emailResult || emailResult.rowCount !== 1) {
			throw error(404, 'User not found.');
		}

		return json({ success: true, email: emailResult.rows[0].email });
	}

	if (payload.action === 'password') {
		const currentPassword = payload.currentPassword ?? '';
		const newPassword = payload.newPassword ?? '';
		const requiresCurrentPassword = !session.user.signedInWithTempPassword;

		if (!newPassword || newPassword.length < 8) {
			throw error(400, 'Invalid password payload.');
		}

		if (requiresCurrentPassword && !currentPassword) {
			throw error(400, 'Current password is required.');
		}

		if (requiresCurrentPassword) {
			const result = await db.query(
				`
				select password_hash
				from users
				where id = $1
				limit 1
				`,
				[session.user.id]
			);
			const row = result.rows[0];
			if (!row) throw error(404, 'User not found.');

			const matches = await verify(row.password_hash, currentPassword);
			if (!matches) {
				throw error(401, 'Current password is incorrect.');
			}
		}

		const passwordHash = await hash(newPassword);
		await db.query(
			`
			update users
			set
				password_hash = $2,
				temp_password_hash = null,
				temp_password_created_at = null,
				updated_at = now()
			where id = $1
			`,
			[session.user.id, passwordHash]
		);

		const token = cookies.get(SESSION_COOKIE_NAME);
		if (token) {
			await db.query(
				`
				update sessions
				set used_temp_password = false
				where token_hash = $1
					and revoked_at is null
				`,
				[hashToken(token)]
			);
		}

		return json({ success: true });
	}

	throw error(400, 'Unsupported action.');
};
