import crypto from 'node:crypto';
import { fail, type Actions, type PageServerLoad } from '@sveltejs/kit';
import { hash } from '@node-rs/argon2';
import { getDb } from '$lib/server/db';
import { sendTemporaryPasswordEmail } from '$lib/server/emailTemplates';
import { getAppBrandName } from '$lib/server/branding';

function readString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
	return Boolean(value) && value.includes('@') && value.includes('.') && !value.includes(' ');
}

function createTemporaryPassword(): string {
	return crypto.randomBytes(9).toString('base64url');
}

export const load: PageServerLoad = async () => {
	return {
		brandName: getAppBrandName()
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = normalizeEmail(readString(formData, 'email'));

		if (!isValidEmail(email)) {
			return fail(400, {
				message: 'Enter a valid email address.'
			});
		}

		const db = getDb();
		const result = await db.query(
			`
			select id, email, is_active
			from users
			where lower(email) = lower($1)
			limit 1
			`,
			[email]
		);

		const user = result.rows[0] as { id: string; email: string; is_active: boolean } | undefined;

		if (!user || user.is_active !== true) {
			return {
				success: true,
				message:
					'If an active account exists for that email, a temporary password has been sent.'
			};
		}

		const temporaryPassword = createTemporaryPassword();
		const passwordHash = await hash(temporaryPassword);

		try {
			await sendTemporaryPasswordEmail(user.email, temporaryPassword);
		} catch (err) {
			return fail(500, {
				message: 'Unable to send reset email right now. Please try again in a few minutes.'
			});
		}

		await db.query(
			`
			update users
			set
				temp_password_hash = $2,
				temp_password_created_at = now(),
				updated_at = now()
			where id = $1
			`,
			[user.id, passwordHash]
		);

		return {
			success: true,
			message: 'If an active account exists for that email, a temporary password has been sent.'
		};
	}
};
