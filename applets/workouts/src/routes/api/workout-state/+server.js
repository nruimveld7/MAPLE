import { json } from '@sveltejs/kit';
import { requireSession } from '$lib/server/authClient';
import { saveWorkoutState } from '$lib/server/workoutStateStore';

async function persistWorkoutState(event) {
	const session = await requireSession(event);
	const payload = await event.request.json().catch(() => null);

	if (!payload || typeof payload !== 'object') {
		return json({ error: 'Invalid request payload' }, { status: 400 });
	}

	const state = await saveWorkoutState(session.user.id, {
		exercises: payload.exercises,
		schedule: payload.schedule
	});

	return json({ ok: true, state });
}

export async function PUT(event) {
	return persistWorkoutState(event);
}

export async function POST(event) {
	return persistWorkoutState(event);
}
