# Shared Frontend Shell Framework

This module defines one shell contract for every frontend page:

- Background source of truth: `landing/src/routes/+page.svelte` (dark mode baseline).
- User button/menu + centered page title source of truth: `auth/src/routes/+page.svelte`.
- Account-level theme knobs: `primary` and `secondary` spotlight colors through CSS variables.

## What lives here

- `src/shell.css`
  - Global shell tokens.
  - Shared dark/light backgrounds.
  - Shared top-left user button/menu.
  - Shared centered page title style.
- `src/ShellTopbar.svelte`
  - Reusable auth-style topbar component.
- `src/theme.ts`
  - Theme contract (`mode`, `primary`, `secondary`) and color sanitization.

## Import contract

Every app imports from `$shell` (alias configured in each `vite.config.js`):

```ts
import { ShellTopbar, resolveShellTheme, shellThemeStyle } from '$shell';
import '$shell/shell.css';
```

## Server data contract (per user)

Add this shape to each app load function:

```ts
shellTheme: {
  mode: 'dark' | 'light',
  primary: '#58a6ff',
  secondary: '#a855f7'
}
```

Recommended DB ownership: `auth.users` table (or linked preferences table), then projected through each app's session/user payload.

## Layout pattern

Use a root `+layout.svelte` (or page-level while migrating):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveShellTheme, shellThemeStyle } from '$shell';
  import '$shell/shell.css';

  export let data;
  $: theme = resolveShellTheme(data?.shellTheme);

  onMount(() => {
    document.body.classList.add('shell-theme');
    return () => document.body.classList.remove('shell-theme');
  });

  $: document.documentElement.dataset.theme = theme.mode;
  $: document.documentElement.style.cssText = shellThemeStyle(theme);
</script>

<slot />
```

## Topbar usage pattern

```svelte
<ShellTopbar
  title="Auth Portal"
  initials={userInitials}
  isMenuOpen={isUserMenuOpen}
  userName={userFullName}
  userMeta={`Signed in as ${data.user.email}`}
  onToggleMenu={toggleUserMenu}
  onManageAccount={manageAccount}
  onLogout={logOut}
/>
```

## Rollout plan

1. Add `shellTheme` to each app server load.
2. Add a root `+layout.svelte` in each app and import `shell.css`.
3. Replace local header/menu blocks with `ShellTopbar`.
4. Remove duplicate page-local shell CSS after each migration.
