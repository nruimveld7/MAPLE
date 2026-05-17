import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let workoutsPool;
let authPool;
let cleanupRan = false;
let cleanupInFlight = null;

function getWorkoutsDb() {
	if (!env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set at runtime');
	}

	if (!workoutsPool) {
		workoutsPool = new Pool({
			connectionString: env.DATABASE_URL
		});
	}

	return workoutsPool;
}

function getAuthDb() {
	if (!env.AUTH_DATABASE_URL) return null;

	if (!authPool) {
		authPool = new Pool({
			connectionString: env.AUTH_DATABASE_URL
		});
	}

	return authPool;
}

function normalizeExercises(exercises) {
	return Array.isArray(exercises) ? exercises : [];
}

function normalizeSchedule(schedule) {
	const safeSchedule = {};
	const source = schedule && typeof schedule === 'object' ? schedule : {};
	for (const day of DAY_NAMES) {
		const entries = source[day];
		safeSchedule[day] = Array.isArray(entries) ? entries : [];
	}
	return safeSchedule;
}

export async function cleanupOrphanedWorkoutState() {
	const authDb = getAuthDb();
	if (!authDb) return { ran: false, deletedCount: 0 };

	const workoutsDb = getWorkoutsDb();
	let authUsers;
	try {
		// If auth DB is unreachable, cleanup must be a no-op.
		authUsers = await authDb.query(`select id from users`);
	} catch (err) {
		return { ran: false, deletedCount: 0, skipped: 'auth_unavailable' };
	}
	const userIds = authUsers.rows.map((row) => row.id);

	let result;
	if (userIds.length === 0) {
		result = await workoutsDb.query(`delete from workout_user_state`);
	} else {
		result = await workoutsDb.query(
			`
			delete from workout_user_state
			where not (user_id = any($1::uuid[]))
			`,
			[userIds]
		);
	}

	return { ran: true, deletedCount: result.rowCount ?? 0 };
}

async function runCleanupOncePerProcess() {
	if (cleanupRan) return;
	if (cleanupInFlight) {
		await cleanupInFlight;
		return;
	}

	cleanupInFlight = (async () => {
		try {
			const result = await cleanupOrphanedWorkoutState();
			// Mark complete only after a successful auth read path.
			// If auth DB is unavailable, leave cleanupRan false so a future
			// request can retry.
			if (result?.ran) cleanupRan = true;
		} catch (err) {
		} finally {
			cleanupInFlight = null;
		}
	})();

	await cleanupInFlight;
}

export async function loadWorkoutState(userId) {
	await runCleanupOncePerProcess();
	const db = getWorkoutsDb();
	const result = await db.query(
		`
		select exercises, schedule
		from workout_user_state
		where user_id = $1::uuid
		limit 1
		`,
		[userId]
	);

	const row = result.rows[0];
	if (!row) {
		return {
			exercises: [],
			schedule: normalizeSchedule({})
		};
	}

	return {
		exercises: normalizeExercises(row.exercises),
		schedule: normalizeSchedule(row.schedule)
	};
}

export async function saveWorkoutState(userId, state) {
	await runCleanupOncePerProcess();
	const db = getWorkoutsDb();
	const exercises = normalizeExercises(state?.exercises);
	const schedule = normalizeSchedule(state?.schedule);

	await db.query(
		`
		insert into workout_user_state (user_id, exercises, schedule)
		values ($1::uuid, $2::jsonb, $3::jsonb)
		on conflict (user_id) do update
		set exercises = excluded.exercises,
			schedule = excluded.schedule,
			updated_at = now()
		`,
		[userId, JSON.stringify(exercises), JSON.stringify(schedule)]
	);

	return {
		exercises,
		schedule
	};
}
