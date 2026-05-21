import { json } from '@sveltejs/kit';
import { requireSession } from '$lib/server/authClient';
import { loadXmasState, saveXmasState } from '$lib/server/xmasStore';

export async function GET(event) {
	const session = await requireSession(event);
	const state = await loadXmasState(session.user.id, session.user);
	return json({ ok: true, ...state });
}

async function save(event) {
	const session = await requireSession(event);
	const payload = await event.request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') {
		return json({ error: 'Invalid payload' }, { status: 400 });
	}

	const saved = await saveXmasState(session.user.id, payload);
	return json({ ok: true, ...saved });
}

export async function POST(event) {
	return save(event);
}

export async function PUT(event) {
	return save(event);
}
