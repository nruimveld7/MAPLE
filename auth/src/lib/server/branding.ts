import { env } from '$env/dynamic/private';

const DEFAULT_APP_BRAND = 'MAPLE';

export function getAppBrandName(): string {
	const brand = (env.APP_BRAND || '').trim();
	return brand || DEFAULT_APP_BRAND;
}
