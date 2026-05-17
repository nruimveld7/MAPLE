import { redirect, type PageServerLoad } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/session';

export const load: PageServerLoad = async (event) => {
	const token = event.cookies.get(SESSION_COOKIE_NAME);
	const session = await validateSessionToken(token);

	if (!session.authenticated) {
		throw redirect(
			303,
			`/auth/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}

	return {
		user: session.user
	};
};
