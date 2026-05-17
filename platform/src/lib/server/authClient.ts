import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function getAuthOrigin() {
	return env.AUTH_ORIGIN;
}

function getAuthBasePath() {
	return env.AUTH_BASE_PATH ?? '/auth';
}

function getSessionTargets(): Array<{ url: string; useEventFetch: boolean }> {
	if (env.AUTH_SESSION_URL) {
		return [
			{
			url: env.AUTH_SESSION_URL,
			useEventFetch: false
			}
		];
	}

	const authOrigin = getAuthOrigin();

	if (authOrigin) {
		return [
			{
				url: `${authOrigin}/api/session`,
				useEventFetch: false
			},
			{
				url: `${authOrigin}${getAuthBasePath()}/api/session`,
				useEventFetch: false
			}
		];
	}

	return [
		{
			url: `${getAuthBasePath()}/api/session`,
			useEventFetch: true
		},
		{
			url: '/api/session',
			useEventFetch: true
		}
	];
}

function buildLoginUrl(url: URL) {
	const redirectTo = `${url.pathname}${url.search}`;
	return `${getAuthBasePath()}/login?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export async function getSession(event: { request: Request; fetch: typeof fetch }) {
	let response: Response | undefined;
	const sessionTargets = getSessionTargets();
	const requestInit = {
		method: 'GET',
		headers: {
			cookie: event.request.headers.get('cookie') ?? '',
			'Cache-Control': 'no-store'
		}
	};
	let lastTargetUrl = '';
	let lastError: unknown;

	for (const sessionTarget of sessionTargets) {
		lastTargetUrl = sessionTarget.url;

		try {
			if (sessionTarget.useEventFetch) {
				response = await event.fetch(sessionTarget.url, requestInit);
			} else {
				response = await fetch(sessionTarget.url, requestInit);
			}

			if (response.status === 404 || response.status === 502 || response.status === 503) {
				continue;
			}

			break;
		} catch (err) {
			lastError = err;
		}
	}

	if (!response) {
		throw error(503, 'Unable to reach authentication service.');
	}

	if (response.status === 401) {
		return {
			authenticated: false
		};
	}

	const contentType = response.headers.get('content-type') ?? '';
	const finalUrl = response.url ?? lastTargetUrl;
	const looksLikeLogin =
		response.redirected && (finalUrl.includes('/login') || finalUrl.includes('/auth/login'));

	if (looksLikeLogin) {
		return {
			authenticated: false
		};
	}

	if (!response.ok) {
		throw error(503, `Unable to validate login session. (status ${response.status})`);
	}

	if (!contentType.includes('application/json')) {
		throw error(503, 'Unable to validate login session. (invalid auth response)');
	}

	try {
		return await response.json();
	} catch (err) {
		throw error(503, 'Unable to validate login session.');
	}
}

export async function requireSession(event: { request: Request; fetch: typeof fetch; url: URL }) {
	const session = await getSession(event);

	if (!session.authenticated) {
		throw redirect(303, buildLoginUrl(event.url));
	}

	return session;
}
