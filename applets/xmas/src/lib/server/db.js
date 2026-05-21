import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;

let pool;
let authPool;

export function getDb() {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set at runtime');
	}

	if (!pool) {
		pool = new Pool({
			connectionString: env.DATABASE_URL
		});
	}

	return pool;
}

export function getAuthDb() {
	if (!env.AUTH_DATABASE_URL) return null;

	if (!authPool) {
		authPool = new Pool({
			connectionString: env.AUTH_DATABASE_URL
		});
	}

	return authPool;
}
