<script>
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { ShellTopbar, resolveShellTheme } from '$shell';
	import '$shell/shell.css';

	export let data;

	let isUserMenuOpen = false;
	let themeReady = false;

	$: theme = resolveShellTheme(data?.shellTheme);
	$: user = data?.user ?? {};
	$: userFullName = getUserFullName(user);
	$: userInitials = getUserInitials(user);

	function applyShellTheme() {
		if (!browser) return;
		document.documentElement.dataset.theme = theme.mode;
		document.documentElement.style.setProperty('--shell-spotlight-primary', theme.primary);
		document.documentElement.style.setProperty('--shell-spotlight-secondary', theme.secondary);
	}

	$: applyShellTheme();

	onMount(() => {
		applyShellTheme();
		const frame = window.requestAnimationFrame(() => {
			themeReady = true;
		});
		document.body.classList.add('shell-theme');
		return () => {
			window.cancelAnimationFrame(frame);
			document.body.classList.remove('shell-theme');
		};
	});

	function getUserFullName(currentUser) {
		return (
			[currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') ||
			currentUser?.displayName ||
			currentUser?.email ||
			'User'
		);
	}

	function getUserInitials(currentUser) {
		const firstInitial = currentUser?.firstName?.trim()?.[0] ?? '';
		const lastInitial = currentUser?.lastName?.trim()?.[0] ?? '';
		return `${firstInitial}${lastInitial}`.toUpperCase() || 'U';
	}

	function toggleUserMenu(event) {
		event.stopPropagation();
		isUserMenuOpen = !isUserMenuOpen;
	}

	function closeUserMenu() {
		isUserMenuOpen = false;
	}

	function manageAccount() {
		goto('/auth/account/');
	}

	async function logOut() {
		try {
			await fetch('/auth/api/logout', {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Cache-Control': 'no-store'
				}
			});
		} finally {
			goto('/auth/login');
		}
	}
</script>

<svelte:head>
	<title>Template App</title>
</svelte:head>

<svelte:window
	on:click={closeUserMenu}
	on:keydown={(event) => {
		if (event.key === 'Escape') closeUserMenu();
	}}
/>

{#if themeReady}
	<main class="page-shell">
		<ShellTopbar
			title="Template App"
			initials={userInitials}
			isMenuOpen={isUserMenuOpen}
			userName={userFullName}
			userMeta={user?.email ? `Signed in as ${user.email}` : ''}
			onToggleMenu={toggleUserMenu}
			onManageAccount={manageAccount}
			onLogout={logOut}
		/>

		<section class="workouts-card" aria-label="Template app home">
			<p class="eyebrow">Template App</p>
			<h2>Replace this page content with your new app experience.</h2>
			<p>
				This scaffold uses the shared shell system by default. Update this view, routes, and data logic
				to implement your app.
			</p>
			<a class="back-link" href="/">Back to Applications</a>
		</section>
	</main>
{:else}
	<div class="shell-loader" aria-label="Loading preferences" aria-live="polite">
		<span class="shell-loader-spinner" aria-hidden="true"></span>
	</div>
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	.workouts-card {
		width: min(760px, 100%);
		margin: 0 auto;
		padding: clamp(1.2rem, 2.8vw, 2rem);
		border: 1px solid var(--shell-border);
		border-radius: 22px;
		background: color-mix(in srgb, var(--shell-bg-base) 74%, black 26%);
		box-shadow: var(--shell-shadow);
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--shell-muted);
	}

	h2 {
		margin: 0 0 0.8rem;
		font-size: clamp(1.25rem, 2vw, 1.9rem);
		letter-spacing: -0.03em;
	}

	p {
		margin: 0 0 1rem;
		color: color-mix(in srgb, var(--shell-text) 84%, transparent);
		line-height: 1.5;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--shell-border);
		border-radius: 12px;
		color: var(--shell-text);
		text-decoration: none;
	}

	.back-link:hover,
	.back-link:focus-visible {
		border-color: var(--shell-border-strong);
		background: color-mix(in srgb, var(--shell-spotlight-primary) 12%, transparent);
		outline: none;
	}
</style>
