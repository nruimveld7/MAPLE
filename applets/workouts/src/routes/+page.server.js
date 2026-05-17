import { requireSession } from '$lib/server/authClient';
import { loadWorkoutState } from '$lib/server/workoutStateStore';

export async function load(event) {
	const session = await requireSession(event);
	const user = session.user ?? {};
	const workoutState = await loadWorkoutState(user.id);

	const shellTheme = {
		mode: user.themeMode ?? user.colorMode ?? 'dark',
		primary: user.primaryColor ?? user.themePrimary ?? user.shellPrimary ?? '#58a6ff',
		secondary: user.secondaryColor ?? user.themeSecondary ?? user.shellSecondary ?? '#a855f7'
	};

	return {
		session,
		user: {
			...user,
			permissions: user.permissions ?? []
		},
		shellTheme,
		workoutState
	};
}
