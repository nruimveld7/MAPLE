import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME, revokeSessionToken } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);

	await revokeSessionToken(token);

	cookies.delete(SESSION_COOKIE_NAME, {
		path: '/'
	});

	return json(
		{
			success: true
		},
		{
			headers: {
				'Cache-Control': 'no-store'
			}
		}
	);
};