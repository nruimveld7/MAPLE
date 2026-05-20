export type ShellThemeMode = 'light' | 'dark' | 'system';

export type ShellTheme = {
	mode: ShellThemeMode;
	primary: string;
	secondary: string;
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

function safeColor(value: string | null | undefined, fallback: string): string {
	if (!value) return fallback;
	const normalized = value.trim();
	return HEX_COLOR.test(normalized) ? normalized : fallback;
}

export function resolveShellTheme(input?: Partial<ShellTheme> | null): ShellTheme {
	return {
		mode:
			input?.mode === 'light' || input?.mode === 'system'
				? input.mode
				: 'dark',
		primary: safeColor(input?.primary, '#58a6ff'),
		secondary: safeColor(input?.secondary, '#a855f7')
	};
}

export function shellThemeStyle(theme: ShellTheme): string {
	return `--shell-spotlight-primary: ${theme.primary}; --shell-spotlight-secondary: ${theme.secondary};`;
}
