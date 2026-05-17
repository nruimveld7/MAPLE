import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const result = await db.query(
		`select
			id,
			title,
			endpoint,
			image_url,
			image_alt,
			enabled,
			show_when_locked,
			is_public,
			required_permission,
			sort_order
		 from platform_apps
		 where enabled = true
		 order by sort_order asc, title asc`
	);

	const routes = result.rows.map((row) => ({
		id: row.id,
		title: row.title,
		endpoint: row.endpoint,
		imageUrl: row.image_url,
		imageAlt: row.image_alt,
		showWhenLocked: row.show_when_locked,
		isPublic: row.is_public,
		requiredPermission: row.required_permission
	}));

	return json(
		{ routes },
		{
			headers: {
				'Cache-Control': 'no-store'
			}
		}
	);
};
