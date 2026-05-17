import { env } from '$env/dynamic/private';

const DEFAULT_PUBLIC_ORIGIN = 'https://app.example.com';

export function getPublicAppOrigin(): string {
	const raw = (env.PUBLIC_APP_ORIGIN || DEFAULT_PUBLIC_ORIGIN).trim();
	const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
	const url = new URL(withProtocol);

	// Enforce HTTPS for all user-facing links.
	url.protocol = 'https:';
	url.port = '';

	return url.origin.replace(/\/$/, '');
}
