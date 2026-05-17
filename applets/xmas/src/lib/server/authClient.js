import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function getAuthOrigin() {
	return env.AUTH_ORIGIN ?? 'http://auth:3000';
}

function getAuthBasePath() {
	return env.AUTH_BASE_PATH ?? '/auth';
}

function getSessionUrl() {
	return `${getAuthOrigin()}${getAuthBasePath()}/api/session`;
}

function buildLoginUrl(url) {
	const redirectTo = `${url.pathname}${url.search}`;
	return `${getAuthBasePath()}/login?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export async function getSession(request) {
	let response;

	try {
		response = await fetch(getSessionUrl(), {
			method: 'GET',
			headers: {
				cookie: request.headers.get('cookie') ?? ''
			}
		});
	} catch (err) {
		throw error(503, 'Unable to reach authentication service.');
	}

	if (response.status === 401) {
		return {
			authenticated: false
		};
	}

	if (!response.ok) {
		throw error(503, 'Unable to validate login session.');
	}

	return await response.json();
}

export async function requireSession(event) {
	const session = await getSession(event.request);

	if (!session.authenticated) {
		throw redirect(303, buildLoginUrl(event.url));
	}

	return session;
}
