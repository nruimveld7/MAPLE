import type { CookieSerializeOptions } from 'cookie';

export const SESSION_COOKIE_NAME = 'maple_session';

export const SESSION_DAYS = 30;

export const SESSION_COOKIE_OPTIONS: CookieSerializeOptions & { path: string } = {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax',
	maxAge: SESSION_DAYS * 24 * 60 * 60
};