import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/session';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	const session = await validateSessionToken(token);

	if (!session.authenticated) {
		return json(
			{
				authenticated: false
			},
			{
				status: 401,
				headers: {
					'Cache-Control': 'no-store'
				}
			}
		);
	}

	return json(session, {
		headers: {
			'Cache-Control': 'no-store'
		}
	});
};