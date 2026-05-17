import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

type AppPermission = {
	permission: string;
	label: string;
	description: string | null;
	isRequiredForAccess: boolean;
};

export const GET: RequestHandler = async () => {
	const db = getDb();
	const columnResult = await db.query(
		`select column_name
		 from information_schema.columns
		 where table_schema = 'public'
		   and table_name = 'platform_apps'
		   and column_name in ('show_in_catalog')`
	);
	const hasShowInCatalog = new Set(
		columnResult.rows.map((row: { column_name: string }) => row.column_name)
	).has('show_in_catalog');

	const appsResult = await db.query(
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
			sort_order,
			app_type,
			absolute_path,
			is_public,
			required_permission
		 from platform_apps
		 order by sort_order asc, title asc`
	);

	const permissionsResult = await db.query(
		`select app_id, permission, label, description, is_required_for_access
		 from platform_app_permissions
		 order by app_id asc, permission asc`
	);

	const permissionsByApp = new Map<string, AppPermission[]>();

	for (const row of permissionsResult.rows) {
		const current = permissionsByApp.get(row.app_id) ?? [];
		current.push({
			permission: row.permission,
			label: row.label,
			description: row.description,
			isRequiredForAccess: row.is_required_for_access
		});
		permissionsByApp.set(row.app_id, current);
	}

	const apps = appsResult.rows.map((row) => ({
		id: row.id,
		title: row.title,
		endpoint: row.endpoint,
		imageUrl: row.image_url,
		imageAlt: row.image_alt,
		enabled: row.enabled,
		showWhenLocked: row.show_when_locked,
		showInCatalog: row.show_in_catalog,
		adminOnly: row.admin_only,
		sortOrder: row.sort_order,
		appType: row.app_type,
		absolutePath: row.absolute_path,
		isPublic: row.is_public,
		requiredPermission: row.required_permission,
		permissions: permissionsByApp.get(row.id) ?? []
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
