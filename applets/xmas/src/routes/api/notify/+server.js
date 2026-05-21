import { error, json } from '@sveltejs/kit';
import { requireSession } from '$lib/server/authClient';
import { getAuthDb, getDb } from '$lib/server/db';
import { sendGenericEmail } from '$lib/server/mailerClient';

function fullName(user) {
	return `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.displayName || user?.email || 'Someone';
}

async function getUserMap(ids, requireXmasAccess = false) {
	const authDb = getAuthDb();
	if (!authDb || ids.length === 0) return new Map();

	const result = requireXmasAccess
		? await authDb.query(
			`select distinct u.id::text, u.first_name, u.last_name, u.display_name, u.email
			 from users u
			 left join user_app_permissions uap
				on uap.user_id = u.id
				and uap.app_id = 'xmas'
				and uap.revoked_at is null
			 where u.id = any($1::uuid[])
				and u.is_active = true
				and (u.is_admin = true or uap.user_id is not null)`,
			[ids]
		)
		: await authDb.query(
			`select id::text, first_name, last_name, display_name, email
			 from users
			 where id = any($1::uuid[])`,
			[ids]
		);

	const map = new Map();
	for (const row of result.rows) {
		map.set(row.id, {
			id: row.id,
			email: row.email || '',
			name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.display_name || row.email || 'User'
		});
	}
	return map;
}

async function sendShareNotification(sessionUser, recipientUserId) {
	const users = await getUserMap([recipientUserId], true);
	const recipient = users.get(recipientUserId);
	if (!recipient?.email) throw error(400, 'Recipient does not have Xmas access.');

	const senderName = fullName(sessionUser);
	const subject = `${senderName} shared a Christmas list with you`;
	const text = `${senderName} shared their Christmas list with you.\n\nOpen the Xmas app to view it.`;
	const html = `<p>${senderName} shared their Christmas list with you.</p><p>Open the Xmas app to view it.</p>`;

	await sendGenericEmail(recipient.email, subject, text, html);
}

async function sendFlagNotification(sessionUser, itemId, message) {
	const db = getDb();
	const itemResult = await db.query(
		`select id::text, label, owner_user_id::text as owner_id
		 from xmas_items
		 where id = $1::uuid
		 limit 1`,
		[itemId]
	);
	const item = itemResult.rows[0];
	if (!item) throw error(404, 'Item not found.');
	if (item.owner_id === sessionUser.id) throw error(400, 'Cannot flag your own item.');

	const users = await getUserMap([item.owner_id]);
	const owner = users.get(item.owner_id);
	if (!owner?.email) throw error(400, 'Owner email unavailable.');

	const senderName = fullName(sessionUser);
	const subject = `${senderName} flagged an item on your Christmas list`;
	const text = [
		`${senderName} flagged: ${item.label}`,
		'',
		`Message: ${message}`,
		'',
		'Open the Xmas app to review your list.'
	].join('\n');
	const html = `<p><strong>${senderName}</strong> flagged: <strong>${item.label}</strong></p><p>${message}</p><p>Open the Xmas app to review your list.</p>`;

	await sendGenericEmail(owner.email, subject, text, html);
}

export async function POST(event) {
	const session = await requireSession(event);
	const payload = await event.request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') {
		return json({ error: 'Invalid payload' }, { status: 400 });
	}

	if (payload.type === 'share') {
		const recipientUserId = String(payload.userId || '').trim();
		if (!recipientUserId) return json({ error: 'userId required' }, { status: 400 });
		await sendShareNotification(session.user, recipientUserId);
		return json({ ok: true });
	}

	if (payload.type === 'flag') {
		const itemId = String(payload.itemId || '').trim();
		const message = String(payload.message || '').trim();
		if (!itemId || !message) return json({ error: 'itemId and message required' }, { status: 400 });
		await sendFlagNotification(session.user, itemId, message);
		return json({ ok: true });
	}

	return json({ error: 'Unknown notification type' }, { status: 400 });
}
