import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const columnResult = await db.query(
		`select column_name
		 from information_schema.columns
		 where table_schema = 'public'
		   and table_name = 'platform_apps'
		   and column_name in ('is_public', 'required_permission', 'show_in_catalog')`
	);
	const availableColumns = new Set(
		columnResult.rows.map((row: { column_name: string }) => row.column_name)
	);
	const hasIsPublic = availableColumns.has('is_public');
	const hasRequiredPermission = availableColumns.has('required_permission');
	const hasShowInCatalog = availableColumns.has('show_in_catalog');
	const result = await db.query(
		`select
			id,
			title,
			endpoint,
			image_url,
			image_alt,
			enabled,
			show_when_locked,
			${hasShowInCatalog ? 'show_in_catalog' : 'true as show_in_catalog'},
			admin_only,
			${hasIsPublic ? 'is_public' : 'false as is_public'},
			${hasRequiredPermission ? 'required_permission' : 'null::text as required_permission'},
			sort_order
		 from platform_apps
		 where enabled = true
		   and ${hasShowInCatalog ? 'show_in_catalog = true' : 'true'}
		 order by sort_order asc, title asc`
	);

	const apps = result.rows.map((row) => ({
		id: row.id,
		title: row.title,
		endpoint: row.endpoint,
		imageUrl: row.image_url,
		imageAlt: row.image_alt,
		enabled: row.enabled,
		showWhenLocked: row.show_when_locked,
		adminOnly: row.admin_only,
		isPublic: row.is_public,
		publicAccess: row.is_public,
		requiredPermission: row.required_permission
	}));

	return json(
		{ apps },
		{
			headers: {
				'Cache-Control': 'no-store'
			}
		}
	);
};
