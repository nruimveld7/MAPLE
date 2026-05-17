import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppBrandName } from '$lib/server/branding';
import { hash, verify } from '@node-rs/argon2';
import { getDb } from '$lib/server/db';
import { createSession } from '$lib/server/session';
import { hashInviteCode, normalizeInviteCode } from '$lib/server/inviteCode';

function readString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function sanitizeRedirectTo(value: string | null): string {
	const fallback = '/';

	if (!value) {
		return fallback;
	}

	if (!value.startsWith('/')) {
		return fallback;
	}

	if (value.startsWith('//')) {
		return fallback;
	}

	if (value.startsWith('/auth')) {
		return fallback;
	}

	return value;
}

type AuthMode = 'login' | 'signup';

function formState(params: {
	mode: AuthMode;
	redirectTo: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	inviteCode?: string;
}): {
	mode: AuthMode;
	redirectTo: string;
	email: string;
	firstName: string;
	lastName: string;
	inviteCode: string;
} {
	return {
		mode: params.mode,
		redirectTo: params.redirectTo,
		email: params.email ?? '',
		firstName: params.firstName ?? '',
		lastName: params.lastName ?? '',
		inviteCode: params.inviteCode ?? ''
	};
}

export const load: PageServerLoad = async ({ url }) => {
	return {
		redirectTo: sanitizeRedirectTo(url.searchParams.get('redirectTo')),
		brandName: getAppBrandName()
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const db = getDb();
		const formData = await request.formData();

		const mode = readString(formData, 'mode');
		const redirectTo = sanitizeRedirectTo(readString(formData, 'redirectTo'));
		const normalizedMode: AuthMode = mode === 'signup' ? 'signup' : 'login';

		const email = normalizeEmail(readString(formData, 'email'));
		const password = readString(formData, 'password');

		if (!email || !password) {
			return fail(400, {
				...formState({
					mode: normalizedMode,
					redirectTo,
					email
				}),
				message: 'Email and password are required.'
			});
		}

		if (mode === 'signup') {
			const firstName = readString(formData, 'firstName');
			const lastName = readString(formData, 'lastName');
			const confirmPassword = readString(formData, 'confirmPassword');
			const inviteCode = normalizeInviteCode(readString(formData, 'inviteCode'));

			if (!firstName || !lastName) {
				return fail(400, {
					...formState({
						mode: 'signup',
						redirectTo,
						email,
						firstName,
						lastName,
						inviteCode
					}),
					message: 'First and last name are required.'
				});
			}

			if (password.length < 8) {
				return fail(400, {
					...formState({
						mode: 'signup',
						redirectTo,
						email,
						firstName,
						lastName,
						inviteCode
					}),
					message: 'Password must be at least 8 characters.'
				});
			}

			if (password !== confirmPassword) {
				return fail(400, {
					...formState({
						mode: 'signup',
						redirectTo,
						email,
						firstName,
						lastName,
						inviteCode
					}),
					message: 'Password and confirmation do not match.'
				});
			}

			if (!inviteCode) {
				return fail(400, {
					...formState({
						mode: 'signup',
						redirectTo,
						email,
						firstName,
						lastName,
						inviteCode
					}),
					message: 'Invite code is required.'
				});
			}

			const inviteHash = hashInviteCode(inviteCode);
			const inviteResult = await db.query(
				`
				select id, email, initial_app_id, expires_at
				from invites
				where code_hash = $1
					and lower(email) = lower($2)
					and used_at is null
					and revoked_at is null
					and expires_at > now()
				limit 1
				`,
				[inviteHash, email]
			);
			const invite = inviteResult.rows[0];
			if (!invite) {
				return fail(400, {
					...formState({
						mode: 'signup',
						redirectTo,
						email,
						firstName,
						lastName,
						inviteCode
					}),
					message: 'Invalid invite code for this email.'
				});
			}

			const existingUserResult = await db.query(
				`
				select id
				from users
				where lower(email) = lower($1)
				limit 1
				`,
				[email]
			);
			if (existingUserResult.rows[0]) {
				return fail(409, {
					...formState({
						mode: 'signup',
						redirectTo,
						email,
						firstName,
						lastName,
						inviteCode
					}),
					message: 'An account already exists for this email.'
				});
			}

			const passwordHash = await hash(password);
			let createdUserId = '';
			await db.query('begin');
			try {
				const createdUserResult = await db.query(
					`
					insert into users (
						email,
						password_hash,
						first_name,
						last_name,
						is_active,
						is_admin
					)
					values ($1, $2, $3, $4, true, false)
					returning id
					`,
					[email, passwordHash, firstName, lastName]
				);
				const userId = createdUserResult.rows[0]?.id as string | undefined;
				if (!userId) {
					throw new Error('Failed to create user.');
				}
				createdUserId = userId;

				if (invite.initial_app_id) {
					const appResult = await db.query(
						`
						select id, required_permission
						from app_registry
						where id = $1
						limit 1
						`,
						[invite.initial_app_id]
					);
					const app = appResult.rows[0];
					if (app) {
						const permission = app.required_permission || `${app.id}.access`;
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
							values ($1, $2, $3, null, now(), null)
							on conflict (user_id, app_id, permission)
							do update set
								granted_at = now(),
								revoked_at = null
							`,
							[createdUserId, app.id, permission]
						);
					}
				}

				await db.query(
					`
					delete from invites
					where id = $1
					`,
					[invite.id]
				);
				await db.query('commit');
			} catch (err) {
				await db.query('rollback');
				throw err;
			}

			await createSession(createdUserId, cookies, {
				usedTempPassword: false
			});

			throw redirect(303, redirectTo);
		}

		if (mode !== 'login') {
			return fail(400, {
				...formState({
					mode: 'login',
					redirectTo,
					email,
					password
				}),
				message: 'Invalid authentication mode.'
			});
		}

		const result = await db.query(
			`
			select
				id,
				password_hash,
				temp_password_hash,
				temp_password_created_at,
				is_active
			from users
			where lower(email) = lower($1)
			limit 1
			`,
			[email]
		);

		const user = result.rows[0];

		if (!user || user.is_active !== true) {
			return fail(401, {
				...formState({
					mode: 'login',
					redirectTo,
					email,
					password
				}),
				message: 'Invalid email or password.'
			});
		}

		const validPassword = await verify(user.password_hash, password);

		let usedTemporaryPassword = false;
		let validTemporaryPassword = false;

		if (!validPassword && user.temp_password_hash && user.temp_password_created_at) {
			const createdAt = new Date(user.temp_password_created_at);
			const tempAgeMs = Date.now() - createdAt.getTime();
			const tempIsFresh = Number.isFinite(tempAgeMs) && tempAgeMs >= 0 && tempAgeMs <= 60 * 60 * 1000;

			if (tempIsFresh) {
				validTemporaryPassword = await verify(user.temp_password_hash, password);
			}
		}

		if (!validPassword && !validTemporaryPassword) {
			return fail(401, {
				...formState({
					mode: 'login',
					redirectTo,
					email,
					password
				}),
				message: 'Invalid email or password.'
			});
		}

		if (validTemporaryPassword) {
			usedTemporaryPassword = true;
		}

		if (usedTemporaryPassword) {
			await db.query(
				`
				update users
				set
					temp_password_hash = null,
					temp_password_created_at = null,
					updated_at = now()
				where id = $1
				`,
				[user.id]
			);
		}

		await createSession(user.id, cookies, {
			usedTempPassword: usedTemporaryPassword
		});

		throw redirect(303, redirectTo);
	}
};
