import { getAuthDb, getDb } from '$lib/server/db';

let cleanupInFlight = null;

async function loadEligibleXmasUsers(authDb) {
	const result = await authDb.query(`
		select distinct u.id::text as id
		from users u
		left join user_app_permissions uap
			on uap.user_id = u.id
			and uap.app_id = 'xmas'
			and uap.revoked_at is null
		where u.is_active = true
			and (u.is_admin = true or uap.user_id is not null)
	`);
	return result.rows.map((row) => row.id);
}

async function cleanupIneligibleXmasData() {
	const authDb = getAuthDb();
	if (!authDb) return { ran: false, skipped: 'auth_db_unavailable' };

	const eligibleIds = await loadEligibleXmasUsers(authDb);
	const db = getDb();
	const client = await db.connect();
	try {
		await client.query('begin');
		if (eligibleIds.length === 0) {
			await client.query('delete from xmas_claims');
			await client.query('delete from xmas_shares');
			await client.query('delete from xmas_items');
		} else {
			await client.query(
				`delete from xmas_claims where claimant_user_id <> all($1::uuid[])`,
				[eligibleIds]
			);
			await client.query(
				`delete from xmas_shares where owner_user_id <> all($1::uuid[]) or shared_with_user_id <> all($1::uuid[])`,
				[eligibleIds]
			);
			await client.query(
				`delete from xmas_items where owner_user_id <> all($1::uuid[])`,
				[eligibleIds]
			);
		}
		await client.query('commit');
		return { ran: true };
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

function startCleanupTask() {
	if (cleanupInFlight) return cleanupInFlight;

	cleanupInFlight = (async () => {
		try {
			await cleanupIneligibleXmasData();
		} catch {
			// Best-effort background cleanup.
		} finally {
			cleanupInFlight = null;
		}
	})();

	return cleanupInFlight;
}

async function runCleanupBeforeOperation() {
	await startCleanupTask();
}

function normalizeUrl(url) {
	const raw = String(url || '').trim();
	if (!raw) return '';
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
		return parsed.toString();
	} catch {
		return '';
	}
}

function normalizeItems(items, ownerId) {
	if (!Array.isArray(items)) return [];
	return items
		.filter((item) => item && typeof item === 'object')
		.map((item, index) => ({
			id: item.id || crypto.randomUUID(),
			ownerId,
			label: String(item.label || '').trim(),
			url: normalizeUrl(item.url),
			quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
			order: Number.parseInt(item.order, 10) || index + 1
		}))
		.filter((item) => item.label);
}

function normalizeShares(shares, ownerId) {
	if (!Array.isArray(shares)) return [];
	const dedupe = new Map();
	for (const share of shares) {
		if (!share || typeof share !== 'object') continue;
		const userId = String(share.userId || '').trim();
		if (!userId || userId === ownerId) continue;
		dedupe.set(userId, {
			ownerId,
			userId,
			active: Boolean(share.active)
		});
	}
	return Array.from(dedupe.values());
}

function normalizeClaims(claims, currentUserId) {
	if (!Array.isArray(claims)) return [];
	const dedupe = new Map();
	for (const claim of claims) {
		if (!claim || typeof claim !== 'object') continue;
		const itemId = String(claim.itemId || '').trim();
		const userId = String(claim.userId || '').trim();
		if (!itemId || !userId || userId !== currentUserId) continue;
		const quantity = Math.max(1, Number.parseInt(claim.quantity, 10) || 1);
		dedupe.set(`${itemId}:${userId}`, { itemId, userId, quantity });
	}
	return Array.from(dedupe.values());
}

export async function loadXmasState(currentUserId, sessionUser) {
	void startCleanupTask();
	const db = getDb();
	const [itemsResult, sharesResult, claimsResult] = await Promise.all([
		db.query(
			`select id::text, owner_user_id::text as owner_id, label, url, quantity, display_order
			 from xmas_items
			 where owner_user_id = $1::uuid
			    or owner_user_id in (
			      select owner_user_id
			      from xmas_shares
			      where shared_with_user_id = $1::uuid and is_active = true
			    )
			 order by owner_user_id, display_order, created_at`,
			[currentUserId]
		),
		db.query(
			`select owner_user_id::text as owner_id, shared_with_user_id::text as user_id, is_active as active
			 from xmas_shares
			 where owner_user_id = $1::uuid or shared_with_user_id = $1::uuid`,
			[currentUserId]
		),
		db.query(
			`select c.item_id::text as item_id, c.claimant_user_id::text as user_id, c.quantity
			 from xmas_claims c
			 join xmas_items i on i.id = c.item_id
			 where i.owner_user_id = $1::uuid
			    or i.owner_user_id in (
			      select owner_user_id
			      from xmas_shares
			      where shared_with_user_id = $1::uuid and is_active = true
			    )`,
			[currentUserId]
		)
	]);

	const items = itemsResult.rows.map((row) => ({
		id: row.id,
		ownerId: row.owner_id,
		label: row.label,
		url: row.url || '',
		quantity: row.quantity,
		order: row.display_order
	}));
	const shares = sharesResult.rows.map((row) => ({
		ownerId: row.owner_id,
		userId: row.user_id,
		active: row.active
	}));
	const claims = claimsResult.rows.map((row) => ({
		itemId: row.item_id,
		userId: row.user_id,
		quantity: row.quantity
	}));

	const userIds = new Set([currentUserId]);
	for (const item of items) userIds.add(item.ownerId);
	for (const share of shares) {
		userIds.add(share.ownerId);
		userIds.add(share.userId);
	}
	for (const claim of claims) userIds.add(claim.userId);

	const users = await loadUsers(Array.from(userIds), sessionUser, true);

	return { items, shares, claims, users };
}

async function loadUsers(userIds, sessionUser, includeAll = false) {
	const authDb = getAuthDb();
	if (!authDb || userIds.length === 0) {
		return [
			{
				id: sessionUser.id,
				name:
					`${sessionUser.firstName || ''} ${sessionUser.lastName || ''}`.trim() ||
					sessionUser.displayName ||
					sessionUser.email ||
					'User',
				email: sessionUser.email || ''
			}
		];
	}

	const result = includeAll
		? await authDb.query(
			`select distinct u.id::text, u.first_name, u.last_name, u.display_name, u.email
			 from users u
			 left join user_app_permissions uap
				on uap.user_id = u.id
				and uap.app_id = 'xmas'
				and uap.revoked_at is null
			 where u.is_active = true
				and (u.is_admin = true or uap.user_id is not null)
			 order by coalesce(u.display_name, trim(u.first_name || ' ' || u.last_name), u.email)`
		)
		: await authDb.query(
			`select id::text, first_name, last_name, display_name, email
			 from users
			 where id = any($1::uuid[])
			 order by coalesce(display_name, trim(first_name || ' ' || last_name), email)`,
			[userIds]
		);

	if (!result.rowCount) {
		return [
			{
				id: sessionUser.id,
				name: sessionUser.displayName || sessionUser.email || 'User',
				email: sessionUser.email || ''
			}
		];
	}

	return result.rows.map((row) => ({
		id: row.id,
		name:
			`${row.first_name || ''} ${row.last_name || ''}`.trim() ||
			row.display_name ||
			row.email ||
			'User',
		email: row.email || ''
	}));
}

export async function saveXmasState(currentUserId, payload) {
	await runCleanupBeforeOperation();
	const db = getDb();
	const items = normalizeItems(payload?.items, currentUserId);
	let shares = normalizeShares(payload?.shares, currentUserId);
	const claims = normalizeClaims(payload?.claims, currentUserId);

	const authDb = getAuthDb();
	if (authDb) {
		const eligibleIds = new Set(await loadEligibleXmasUsers(authDb));
		shares = shares.filter((share) => eligibleIds.has(share.userId));
	}

	const client = await db.connect();
	try {
		await client.query('begin');

		await client.query('delete from xmas_claims where claimant_user_id = $1::uuid', [currentUserId]);
		await client.query('delete from xmas_items where owner_user_id = $1::uuid', [currentUserId]);
		await client.query('delete from xmas_shares where owner_user_id = $1::uuid', [currentUserId]);

		for (const item of items) {
			await client.query(
				`insert into xmas_items (id, owner_user_id, label, url, quantity, display_order)
				 values ($1::uuid, $2::uuid, $3, nullif($4, ''), $5, $6)`,
				[item.id, currentUserId, item.label, item.url, item.quantity, item.order]
			);
		}

		for (const share of shares) {
			await client.query(
				`insert into xmas_shares (owner_user_id, shared_with_user_id, is_active)
				 values ($1::uuid, $2::uuid, $3)`,
				[currentUserId, share.userId, share.active]
			);
		}

		for (const claim of claims) {
			await client.query(
				`insert into xmas_claims (item_id, claimant_user_id, quantity)
				 values ($1::uuid, $2::uuid, $3)`,
				[claim.itemId, claim.userId, claim.quantity]
			);
		}

		await client.query('commit');
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}

	return { items, shares, claims };
}
