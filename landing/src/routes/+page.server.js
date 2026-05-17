import { requireSession } from '$lib/server/authClient';
import { env } from '$env/dynamic/private';

function getPlatformOrigin() {
	return env.PLATFORM_ORIGIN ?? 'http://platform:3000';
}

function getPlatformBasePath() {
	return env.PLATFORM_BASE_PATH ?? '/platform';
}

function getPlatformCatalogUrl() {
	return `${getPlatformOrigin()}${getPlatformBasePath()}/api/catalog`;
}

function getPlatformCatalogFallbackUrl() {
	return `${getPlatformOrigin()}/api/catalog`;
}

async function fetchPlatformApps(cookieHeader) {
	const urls = [getPlatformCatalogUrl(), getPlatformCatalogFallbackUrl()];
	const attempts = [];

	for (const url of urls) {
		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					cookie: cookieHeader,
					'Cache-Control': 'no-store'
				}
			});
			const contentType = response.headers.get('content-type');
			const rawBody = await response.text();
			attempts.push({
				url,
				status: response.status,
				statusText: response.statusText,
				contentType,
				bodyPreview: rawBody.slice(0, 2000)
			});

			if (!response.ok) {
				continue;
			}

			let payload;
			try {
				payload = rawBody ? JSON.parse(rawBody) : {};
			} catch (err) {
				attempts.push({
					url,
					parseError: String(err)
				});
				continue;
			}
			return {
				apps: payload.apps ?? [],
				diagnostics: {
					ok: true,
					attempts,
					successUrl: url
				}
			};
		} catch (err) {
			attempts.push({
				url,
				requestError: String(err)
			});
		}
	}
	return {
		apps: [],
		diagnostics: {
			ok: false,
			message: 'Unable to load app catalog from Platform.',
			attempts
		}
	};
}

export async function load(event) {
	const session = await requireSession(event);
	const permissions = session.user?.permissions ?? [];
	const catalogResult = await fetchPlatformApps(event.request.headers.get('cookie') ?? '');

	return {
		session,
		user: {
			...session.user,
			permissions
		},
		applets: catalogResult.apps,
		catalogDiagnostics: catalogResult.diagnostics
	};
}
