import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getDb(): pg.Pool {
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