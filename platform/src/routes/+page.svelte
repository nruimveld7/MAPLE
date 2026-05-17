<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { base } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { ShellTopbar, resolveShellTheme } from '$shell';
	import '$shell/shell.css';
	import type { PageData } from './$types';

	export let data: PageData;

	type TabId = 'apps';
	type SelectId = 'appFilter' | 'appType';

	let activeTab: TabId = 'apps';
	let isUserMenuOpen = false;
	let themeReady = false;
	let openSelect: SelectId | null = null;

	let appSearch = '';
	let appFilter = 'All apps';
	let appTypeSelection: 'applet' | 'management' = 'applet';
	let enabledSelection = true;
	let isPublicSelection = false;
	let showWhenLockedSelection = true;
	let showInCatalogSelection = true;
	let adminOnlySelection = false;
	let selectedImageName = 'No file selected';
	let imageUploadError = '';
	let saveError = '';
	let saveSuccess = '';
	let isSavingApp = false;
	const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;
	let lastManagedAppId = '';
	let managedAppId = '';
	let isCreateAppView = false;
	type RuntimeMode = 'prod' | 'dev' | 'db';
	type RuntimeControls = { prod: boolean; dev: boolean; db: boolean };
	type RuntimeAvailability = { prod: boolean; dev: boolean; db: boolean };
	type RuntimeState = {
		prod: boolean;
		dev: boolean;
		db: boolean | null;
		controls?: RuntimeControls;
		availability?: RuntimeAvailability;
	};
	let runtimeByApp: Record<string, RuntimeState> = {};
	let runtimeTransitions: Record<string, 'starting' | 'stopping' | null> = {};
	let runtimeTransitionStartedAt: Record<string, number | null> = {};
	let isRuntimeLoading = false;
	let hasRuntimeLoaded = false;
	let runtimeError = '';
	let runtimePollHandle: ReturnType<typeof setInterval> | null = null;
	const RUNTIME_POLL_INTERVAL_MS = 4000;
	const RUNTIME_FETCH_TIMEOUT_MS = 2500;
	$: runtimeDisplayByApp = Object.fromEntries(
		data.apps.map((app) => {
			const prodKey = runtimeKey(app.id, 'prod');
			const devKey = runtimeKey(app.id, 'dev');
			const dbKey = runtimeKey(app.id, 'db');
			const prodTransition = runtimeTransitions[prodKey];
			const devTransition = runtimeTransitions[devKey];
			const dbTransition = runtimeTransitions[dbKey];
			const prodRunning = Boolean(runtimeByApp[app.id]?.prod);
			const devRunning = Boolean(runtimeByApp[app.id]?.dev);
			const dbRaw = runtimeByApp[app.id]?.db;
			const dbAvailable = dbRaw !== null && dbRaw !== undefined;
			const dbRunning = Boolean(dbRaw);
			const prodAvailable = runtimeByApp[app.id]?.controls?.prod !== false;
			const devAvailable = runtimeByApp[app.id]?.controls?.dev !== false;
			const dbControllable = runtimeByApp[app.id]?.controls?.db !== false;
			const prodExists = runtimeByApp[app.id]?.availability?.prod !== false;
			const devExists = runtimeByApp[app.id]?.availability?.dev !== false;
			const dbExists = runtimeByApp[app.id]?.availability?.db === true;

			const waiting = !hasRuntimeLoaded && isRuntimeLoading;

			const prodLabel = !prodExists
				? 'N/A'
				: waiting
					? 'Waiting'
					: prodTransition === 'starting' && !prodRunning
						? 'Starting'
						: prodTransition === 'stopping' && prodRunning
							? 'Stopping'
							: prodRunning
								? 'Running'
								: 'Stopped';
			const devLabel = !devExists
				? 'N/A'
				: waiting
					? 'Waiting'
					: devTransition === 'starting' && !devRunning
						? 'Starting'
						: devTransition === 'stopping' && devRunning
							? 'Stopping'
							: devRunning
								? 'Running'
								: 'Stopped';
			const dbLabel = !dbExists
				? 'N/A'
				: waiting
					? 'Waiting'
					: dbTransition === 'starting' && !dbRunning
						? 'Starting'
						: dbTransition === 'stopping' && dbRunning
							? 'Stopping'
							: dbRunning
								? 'Running'
								: 'Stopped';

			const statusClass = (label: string) =>
				label === 'Running' ? 'green' : label === 'Stopped' ? 'red' : label === 'Waiting' ? 'gray' : 'yellow';

			return [
				app.id,
					{
						db: {
							label: dbLabel,
							className: statusClass(dbLabel),
							busy: dbExists && dbControllable && dbTransition !== null && dbTransition !== undefined,
							available: dbExists,
							controllable: dbControllable
						},
						prod: {
							label: prodLabel,
							className: statusClass(prodLabel),
							busy: prodExists && prodAvailable && prodTransition !== null && prodTransition !== undefined,
							available: prodExists,
							controllable: prodAvailable
						},
						dev: {
							label: devLabel,
							className: statusClass(devLabel),
							busy: devExists && devAvailable && devTransition !== null && devTransition !== undefined,
							available: devExists,
							controllable: devAvailable
						}
					}
				];
		})
	);

	const appFilterOptions = ['All apps', 'Enabled only', 'Disabled only', 'Admin only'];

	$: shellTheme = resolveShellTheme({
		mode: data?.user?.themeMode ?? data?.user?.colorMode ?? data?.shellTheme?.mode ?? 'dark',
		primary:
			data?.user?.primaryColor ??
			data?.user?.themePrimary ??
			data?.user?.shellPrimary ??
			data?.shellTheme?.primary,
		secondary:
			data?.user?.secondaryColor ??
			data?.user?.themeSecondary ??
			data?.user?.shellSecondary ??
			data?.shellTheme?.secondary
	});

	function applyShellTheme() {
		if (!browser) return;
		document.documentElement.dataset.theme = shellTheme.mode;
		document.documentElement.style.setProperty('--shell-spotlight-primary', shellTheme.primary);
		document.documentElement.style.setProperty('--shell-spotlight-secondary', shellTheme.secondary);
	}

	$: applyShellTheme();

	$: registeredApps = data.apps.length;
	$: enabledApps = data.apps.filter((app) => app.enabled).length;
	$: protectedApps = data.apps.filter((app) => !app.isPublic).length;
	$: dbTotals = data.apps.reduce(
		(acc, app) => {
			if (runtimeByApp[app.id]?.availability?.db) {
				acc.total += 1;
				if (runtimeByApp[app.id]?.db === true) acc.running += 1;
			}
			return acc;
		},
		{ running: 0, total: 0 }
	);
	$: prodTotals = data.apps.reduce(
		(acc, app) => {
			if (runtimeByApp[app.id]?.availability?.prod !== false) {
				acc.total += 1;
				if (runtimeByApp[app.id]?.prod === true) acc.running += 1;
			}
			return acc;
		},
		{ running: 0, total: 0 }
	);
	$: devTotals = data.apps.reduce(
		(acc, app) => {
			if (runtimeByApp[app.id]?.availability?.dev !== false) {
				acc.total += 1;
				if (runtimeByApp[app.id]?.dev === true) acc.running += 1;
			}
			return acc;
		},
		{ running: 0, total: 0 }
	);

	$: filteredApps = data.apps.filter((app) => {
		const query = appSearch.trim().toLowerCase();
		const searchable = [app.id, app.title, app.endpoint, app.absolutePath]
			.join(' ')
			.toLowerCase();

		const matchesSearch = query.length === 0 || searchable.includes(query);
		const matchesFilter =
			appFilter === 'All apps' ||
			(appFilter === 'Enabled only' && app.enabled) ||
			(appFilter === 'Disabled only' && !app.enabled) ||
			(appFilter === 'Admin only' && app.adminOnly);

		return matchesSearch && matchesFilter;
	});

	$: managedApp = data.apps.find((app) => app.id === managedAppId) ?? null;
	$: {
		const nextManagedAppId = managedApp?.id ?? '';
		if (nextManagedAppId !== lastManagedAppId) {
			saveError = '';
			appTypeSelection = managedApp?.appType === 'management' ? 'management' : 'applet';
			enabledSelection = managedApp ? managedApp.enabled : true;
			isPublicSelection = managedApp ? managedApp.isPublic : false;
			showWhenLockedSelection = managedApp ? managedApp.showWhenLocked : true;
			showInCatalogSelection = managedApp ? managedApp.showInCatalog : true;
			adminOnlySelection = managedApp ? managedApp.adminOnly : false;
			selectedImageName = 'No file selected';
			imageUploadError = '';
			lastManagedAppId = nextManagedAppId;
		}
	}

	$: {
		if (!isCreateAppView && saveError) {
			saveError = '';
		}
		if (!isCreateAppView && saveSuccess) {
			saveSuccess = '';
		}
	}

	function getUserFullName(user: {
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
		displayName?: string | null;
	}) {
		return (
			[user.firstName, user.lastName].filter(Boolean).join(' ') ||
			user.displayName ||
			user.email ||
			'User'
		);
	}

	function getUserInitials(user: { firstName?: string | null; lastName?: string | null }) {
		const firstInitial = user.firstName?.trim()?.[0] || '';
		const lastInitial = user.lastName?.trim()?.[0] || '';
		const initials = `${firstInitial}${lastInitial}`.toUpperCase();
		return initials || 'U';
	}

	function statusClass(app: { enabled: boolean; adminOnly: boolean }) {
		if (!app.enabled) return 'red';
		if (app.adminOnly) return 'yellow';
		return 'green';
	}

	function statusLabel(app: { enabled: boolean; adminOnly: boolean }) {
		if (!app.enabled) return 'Disabled';
		if (app.adminOnly) return 'Admin only';
		return 'Enabled';
	}

	function toggleUserMenu(event: MouseEvent) {
		event.stopPropagation();
		isUserMenuOpen = !isUserMenuOpen;
		openSelect = null;
	}

	function closeOverlays() {
		isUserMenuOpen = false;
		openSelect = null;
	}

	function toggleSelect(id: SelectId, event: MouseEvent) {
		event.stopPropagation();
		if (id === 'appType' && managedApp) return;
		openSelect = openSelect === id ? null : id;
		isUserMenuOpen = false;
	}

	function selectOption(id: SelectId, value: string, event: MouseEvent) {
		event.stopPropagation();
		if (id === 'appFilter') appFilter = value;
		if (id === 'appType') appTypeSelection = value === 'management' ? 'management' : 'applet';
		openSelect = null;
	}

	function onImageSelected(event: Event) {
		const target = event.currentTarget as HTMLInputElement | null;
		const file = target?.files?.[0] ?? null;
		saveError = '';

		if (file && file.size > MAX_IMAGE_UPLOAD_BYTES) {
			imageUploadError = `Image is too large (${Math.ceil(file.size / 1024)} KB). Max allowed is 2048 KB.`;
			selectedImageName = 'No file selected';
			if (target) {
				target.value = '';
			}
			return;
		}

		imageUploadError = '';
		selectedImageName = file?.name ?? 'No file selected';
	}

	function manageAccount() {
		goto('/auth/account/');
	}

	function openManage(appId: string) {
		saveError = '';
		isCreateAppView = true;
		managedAppId = appId;
	}

	function toggleCreateAppView() {
		saveError = '';
		if (isCreateAppView) {
			isCreateAppView = false;
			managedAppId = '';
			return;
		}
		managedAppId = '';
		isCreateAppView = true;
	}

	function clearSaveError() {
		if (saveError) {
			saveError = '';
		}
		if (saveSuccess) {
			saveSuccess = '';
		}
	}

	function enhanceManagedAppForm() {
		saveError = '';
		saveSuccess = '';
		isSavingApp = true;

		return async ({
			result,
			update
		}: {
			result: { type: string; data?: { message?: string }; error?: { message?: string } };
			update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
		}) => {
			if (result.type === 'success') {
				saveError = '';
				await update({ reset: false, invalidateAll: true });
				isSavingApp = false;
				saveSuccess = 'Successfully saved.';
				return;
			}

			if (result.type === 'failure') {
				isSavingApp = false;
				saveSuccess = '';
				saveError = result.data?.message?.trim() || 'Failed to save app.';
				return;
			}

			if (result.type === 'error') {
				isSavingApp = false;
				saveSuccess = '';
				saveError = result.error?.message?.trim() || 'Internal server error while saving app.';
				return;
			}

			isSavingApp = false;
			saveSuccess = '';
			saveError = 'Save was interrupted. Please try again.';
		};
	}

	function runtimeKey(appId: string, mode: RuntimeMode) {
		return `${appId}:${mode}`;
	}

	async function refreshRuntimeStatuses() {
		if (isRuntimeLoading) return;
		isRuntimeLoading = true;
		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), RUNTIME_FETCH_TIMEOUT_MS);

		try {
			const response = await fetch(`${base}/api/apps/runtime`, {
				cache: 'no-store',
				credentials: 'same-origin',
				headers: { 'Cache-Control': 'no-store' },
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Runtime status poll failed (${response.status})`);
			}

			const payload = (await response.json()) as {
				runtime?: Record<string, RuntimeState>;
				runtimeError?: string | null;
			};
			const rawRuntime = payload.runtime ?? {};
			const runtimeEntries = Object.entries(rawRuntime);
			const nextRuntime: Record<string, RuntimeState> = {};

			for (const app of data.apps) {
				const exact = rawRuntime[app.id];
					if (exact) {
						nextRuntime[app.id] = {
							prod: Boolean(exact.prod),
							dev: Boolean(exact.dev),
							db: exact.db === null || exact.db === undefined ? null : Boolean(exact.db),
							availability: exact.availability
								? {
									prod: exact.availability.prod !== false,
									dev: exact.availability.dev !== false,
									db: exact.availability.db === true
								}
								: {
									prod: true,
									dev: true,
									db: exact.db !== null && exact.db !== undefined
								},
							controls: exact.controls
								? {
									prod: exact.controls.prod !== false,
								dev: exact.controls.dev !== false,
								db: exact.controls.db !== false
							}
							: { prod: true, dev: true, db: true }
					};
					continue;
				}

				const matched = runtimeEntries.find(([key]) => key.trim().toLowerCase() === app.id.trim().toLowerCase());
					nextRuntime[app.id] = {
						prod: Boolean(matched?.[1]?.prod),
						dev: Boolean(matched?.[1]?.dev),
						db: matched?.[1]?.db === null || matched?.[1]?.db === undefined ? null : Boolean(matched?.[1]?.db),
						availability: matched?.[1]?.availability
							? {
								prod: matched[1].availability.prod !== false,
								dev: matched[1].availability.dev !== false,
								db: matched[1].availability.db === true
							}
							: {
								prod: true,
								dev: true,
								db: matched?.[1]?.db !== null && matched?.[1]?.db !== undefined
							},
						controls: matched?.[1]?.controls
							? {
								prod: matched[1].controls.prod !== false,
							dev: matched[1].controls.dev !== false,
							db: matched[1].controls.db !== false
						}
						: { prod: true, dev: true, db: true }
				};
			}
			runtimeByApp = nextRuntime;
			hasRuntimeLoaded = true;

			const nextTransitions: Record<string, 'starting' | 'stopping' | null> = { ...runtimeTransitions };
			const nextTransitionStartedAt: Record<string, number | null> = { ...runtimeTransitionStartedAt };
			const now = Date.now();
			let timeoutMessage = '';
			for (const app of data.apps) {
				for (const mode of ['prod', 'dev', 'db'] as const) {
					const key = runtimeKey(app.id, mode);
					const transition = runtimeTransitions[key];
					if (!transition) continue;
					const raw = nextRuntime[app.id]?.[mode];
					if (raw === null || raw === undefined) {
						nextTransitions[key] = null;
						nextTransitionStartedAt[key] = null;
						continue;
					}

					const running = Boolean(raw);
					if ((transition === 'starting' && running) || (transition === 'stopping' && !running)) {
						nextTransitions[key] = null;
						nextTransitionStartedAt[key] = null;
						continue;
					}

					const startedAt = runtimeTransitionStartedAt[key] ?? now;
					if (now - startedAt > 20000) {
						nextTransitions[key] = null;
						nextTransitionStartedAt[key] = null;
						if (!timeoutMessage) {
							timeoutMessage = `${app.title} ${mode.toUpperCase()} did not reach "${transition === 'starting' ? 'Running' : 'Stopped'}" in time.`;
						}
					}
				}
			}
			runtimeTransitions = nextTransitions;
			runtimeTransitionStartedAt = nextTransitionStartedAt;
			runtimeError = timeoutMessage || payload.runtimeError || '';
		} catch (err) {
			hasRuntimeLoaded = true;
			runtimeError =
				err instanceof Error && err.name === 'AbortError'
					? 'Runtime status check timed out.'
					: err instanceof Error
						? err.message
						: 'Failed to poll runtime status.';
		} finally {
			clearTimeout(timeoutHandle);
			isRuntimeLoading = false;
		}
	}

	async function triggerRuntimeAction(appId: string, mode: RuntimeMode, action: 'start' | 'stop') {
		const key = runtimeKey(appId, mode);
		runtimeTransitions = {
			...runtimeTransitions,
			[key]: action === 'start' ? 'starting' : 'stopping'
		};
		runtimeTransitionStartedAt = {
			...runtimeTransitionStartedAt,
			[key]: Date.now()
		};

		const formData = new FormData();
		formData.set('id', appId);

		try {
			const actionName =
				mode === 'prod'
					? action === 'start'
						? 'startApp'
						: 'stopApp'
					: mode === 'dev'
						? action === 'start'
							? 'startAppDev'
							: 'stopAppDev'
						: action === 'start'
							? 'startAppDb'
							: 'stopAppDb';
			const response = await fetch(`?/${actionName}`, {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				let message = `Failed to ${action} ${mode.toUpperCase()} container (${response.status})`;
				try {
					const payload = await response.json();
					if (typeof payload?.message === 'string' && payload.message.trim()) {
						message = payload.message;
					}
				} catch {
					const text = await response.text();
					if (text.trim()) message = text.trim();
				}
				throw new Error(message);
			}

			await refreshRuntimeStatuses();
		} catch (err) {
				runtimeTransitions = {
					...runtimeTransitions,
					[key]: null
				};
				runtimeTransitionStartedAt = {
					...runtimeTransitionStartedAt,
					[key]: null
				};
				runtimeError = err instanceof Error ? err.message : 'Container action failed.';
			}
		}

	onMount(async () => {
		if (!browser) return;
		applyShellTheme();
		const frame = window.requestAnimationFrame(() => {
			themeReady = true;
		});
		await refreshRuntimeStatuses();
		runtimePollHandle = setInterval(() => {
			void refreshRuntimeStatuses();
		}, RUNTIME_POLL_INTERVAL_MS);
		return () => {
			window.cancelAnimationFrame(frame);
		};
	});

	onDestroy(() => {
		if (runtimePollHandle) {
			clearInterval(runtimePollHandle);
			runtimePollHandle = null;
		}
	});

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

	async function triggerBulkModeAction(mode: RuntimeMode, action: 'start' | 'stop') {
		const isDevUi = Boolean(
			runtimeByApp['platform']?.controls &&
				runtimeByApp['platform'].controls.dev === false &&
				runtimeByApp['platform'].controls.prod === true
		);
		const coreApps = new Set(['auth', 'platform']);
		const dbBlocked = new Set(['auth', 'platform']);
		const blockedForMode = (appId: string) =>
			(mode === 'db' && dbBlocked.has(appId)) ||
			(mode === 'dev' && isDevUi && coreApps.has(appId)) ||
			(mode === 'prod' && !isDevUi && coreApps.has(appId));

		const nextTransitions = { ...runtimeTransitions };
		const nextStartedAt = { ...runtimeTransitionStartedAt };
		const transitionValue = action === 'start' ? 'starting' : 'stopping';
		const now = Date.now();

		for (const app of data.apps) {
			const key = runtimeKey(app.id, mode);
			const exists = runtimeByApp[app.id]?.availability?.[mode] !== false;
			if (!exists || blockedForMode(app.id)) continue;
			nextTransitions[key] = transitionValue;
			nextStartedAt[key] = now;
		}
		runtimeTransitions = nextTransitions;
		runtimeTransitionStartedAt = nextStartedAt;

		const formData = new FormData();
		formData.set('mode', mode);
		formData.set('action', action);

		try {
			const response = await fetch('?/setAllByMode', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				let message = `Failed bulk ${action} for ${mode.toUpperCase()} (${response.status})`;
				try {
					const payload = await response.json();
					if (typeof payload?.message === 'string' && payload.message.trim()) {
						message = payload.message;
					}
				} catch {
					const text = await response.text();
					if (text.trim()) message = text.trim();
				}
				throw new Error(message);
			}

			await refreshRuntimeStatuses();
		} catch (err) {
			const resetTransitions = { ...runtimeTransitions };
			const resetStartedAt = { ...runtimeTransitionStartedAt };
			for (const app of data.apps) {
				const key = runtimeKey(app.id, mode);
				if (resetTransitions[key] === transitionValue) {
					resetTransitions[key] = null;
					resetStartedAt[key] = null;
				}
			}
			runtimeTransitions = resetTransitions;
			runtimeTransitionStartedAt = resetStartedAt;
			runtimeError = err instanceof Error ? err.message : 'Bulk container action failed.';
		}
	}
</script>

<svelte:head>
	<title>Platform</title>
</svelte:head>

<svelte:window
	on:click={closeOverlays}
	on:keydown={(event) => {
		if (event.key === 'Escape') closeOverlays();
	}}
/>

{#if themeReady}
<main class="page-shell">
	<ShellTopbar
		title="Platform"
		initials={getUserInitials(data.user)}
		isMenuOpen={isUserMenuOpen}
		userName={getUserFullName(data.user)}
		onToggleMenu={toggleUserMenu}
		onManageAccount={manageAccount}
		onLogout={logOut}
	/>

	<section class="status-grid" aria-label="Platform summary">
		<div class="metric">
			<span>Registered apps</span>
			<strong>{registeredApps}</strong>
		</div>

		<div class="metric">
			<span>Enabled apps</span>
			<strong>{enabledApps}</strong>
		</div>

		<div class="metric">
			<span>Private apps</span>
			<strong>{protectedApps}</strong>
		</div>
		<div class="metric">
			<span>DB</span>
			<strong>{dbTotals.running}/{dbTotals.total}</strong>
			<div class="metric-actions">
				<button class="soft-button runtime-icon-button" type="button" title="Start all DB containers" aria-label="Start all DB containers" on:click={() => triggerBulkModeAction('db', 'start')}>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
						<path d="M8 5v14l11-7z" />
					</svg>
				</button>
				<button class="soft-button runtime-icon-button" type="button" title="Stop all DB containers" aria-label="Stop all DB containers" on:click={() => triggerBulkModeAction('db', 'stop')}>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
						<rect x="6" y="6" width="12" height="12" rx="1.2" />
					</svg>
				</button>
			</div>
		</div>
		<div class="metric">
			<span>Prod</span>
			<strong>{prodTotals.running}/{prodTotals.total}</strong>
			<div class="metric-actions">
				<button class="soft-button runtime-icon-button" type="button" title="Start all Prod containers" aria-label="Start all Prod containers" on:click={() => triggerBulkModeAction('prod', 'start')}>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
						<path d="M8 5v14l11-7z" />
					</svg>
				</button>
				<button class="soft-button runtime-icon-button" type="button" title="Stop all Prod containers" aria-label="Stop all Prod containers" on:click={() => triggerBulkModeAction('prod', 'stop')}>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
						<rect x="6" y="6" width="12" height="12" rx="1.2" />
					</svg>
				</button>
			</div>
		</div>
		<div class="metric">
			<span>Dev</span>
			<strong>{devTotals.running}/{devTotals.total}</strong>
			<div class="metric-actions">
				<button class="soft-button runtime-icon-button" type="button" title="Start all Dev containers" aria-label="Start all Dev containers" on:click={() => triggerBulkModeAction('dev', 'start')}>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
						<path d="M8 5v14l11-7z" />
					</svg>
				</button>
				<button class="soft-button runtime-icon-button" type="button" title="Stop all Dev containers" aria-label="Stop all Dev containers" on:click={() => triggerBulkModeAction('dev', 'stop')}>
					<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
						<rect x="6" y="6" width="12" height="12" rx="1.2" />
					</svg>
				</button>
			</div>
		</div>
	</section>

	<section class="workspace">
		<nav class="tabs" aria-label="Platform sections">
			<div class="tab-list">
				<button
					class="tab-button"
					class:active={activeTab === 'apps'}
					type="button"
					on:click={() => (activeTab = 'apps')}
				>
					Apps
				</button>
			</div>

			<button
				class="icon-button"
				type="button"
				aria-label="Refresh all tabs"
				title="Refresh all tabs"
				on:click={() => invalidateAll()}
			>
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M6 14.5A7.5 7.5 0 0 1 18.2 7" />
					<path d="M18.2 7l-2.8-.4" />
					<path d="M18.2 7l-.4-2.8" />
					<path d="M18 9.5A7.5 7.5 0 0 1 5.8 17" />
					<path d="M5.8 17l2.8.4" />
					<path d="M5.8 17l.4 2.8" />
				</svg>
			</button>
		</nav>

		<section class="tab-panel" class:active={activeTab === 'apps'}>
			<div class="toolbar">
				<div class="toolbar-left">
					<input
						class="search"
						type="search"
						placeholder="Search apps by title, endpoint, or path"
						bind:value={appSearch}
					/>

					<div class="custom-select" class:open={openSelect === 'appFilter'}>
						<select class="native-select-hidden" aria-label="Filter apps" bind:value={appFilter}>
							{#each appFilterOptions as option}
								<option value={option}>{option}</option>
							{/each}
						</select>

						<button
							class="custom-select-button"
							type="button"
							aria-haspopup="listbox"
							aria-expanded={openSelect === 'appFilter'}
							on:click={(event) => toggleSelect('appFilter', event)}
						>
							<span data-selected-label>{appFilter}</span>
							<svg
								viewBox="0 0 24 24"
								aria-hidden="true"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</button>

						<div class="custom-select-popover" role="listbox">
							{#each appFilterOptions as option}
								<button
									class="custom-option"
									class:selected={appFilter === option}
									type="button"
									role="option"
									aria-selected={appFilter === option}
									on:click={(event) => selectOption('appFilter', option, event)}
								>
									{option}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<button
					class="icon-button"
					type="button"
					on:click={toggleCreateAppView}
					aria-label={isCreateAppView ? 'Back to apps table' : 'Create app'}
					title={isCreateAppView ? 'Back to apps table' : 'Create app'}
				>
					{#if isCreateAppView}
						<svg
							viewBox="0 0 24 24"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m15 18-6-6 6-6" />
						</svg>
					{:else}
						<svg
							viewBox="0 0 24 24"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M12 5v14" />
							<path d="M5 12h14" />
						</svg>
					{/if}
				</button>
			</div>

			{#if runtimeError}
				<p class="runtime-error">{runtimeError}</p>
			{/if}

			{#if isCreateAppView}
				<form
					class="form-card"
					method="POST"
					action={managedApp ? '?/updateApp' : '?/createApp'}
					enctype="multipart/form-data"
					use:enhance={enhanceManagedAppForm}
					on:input={clearSaveError}
					on:change={clearSaveError}
				>
					{#if managedApp}
						<input type="hidden" name="id" value={managedApp.id} />
					{/if}
					<h3>{managedApp ? 'Edit app' : 'Create app'}</h3>
					{#if managedApp}
						<p class="subtle mono">{managedApp.id}</p>
					{/if}
					<div class="field">
						<label for="name">Display name</label>
						<input
							class="input"
							id="name"
							name="name"
							type="text"
							required
							value={managedApp?.title ?? ''}
							placeholder="My New App"
						/>
					</div>

					<div class="field">
						<label for="appType">App type</label>
						<div class="custom-select app-type-select" class:open={openSelect === 'appType'} class:is-locked={Boolean(managedApp)}>
							<select class="native-select-hidden" id="appType" name="appType" bind:value={appTypeSelection}>
								<option value="applet">Applet (applets/)</option>
								<option value="management">Management (repo root)</option>
							</select>

							<button
								class="custom-select-button"
								type="button"
								aria-haspopup="listbox"
								aria-expanded={openSelect === 'appType'}
								aria-disabled={Boolean(managedApp)}
								disabled={Boolean(managedApp)}
								on:click={(event) => toggleSelect('appType', event)}
							>
								<span data-selected-label>
									{appTypeSelection === 'management'
										? 'Management (repo root)'
										: 'Applet (applets/)'}
								</span>
								<svg
									viewBox="0 0 24 24"
									aria-hidden="true"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="m6 9 6 6 6-6" />
								</svg>
							</button>

							<div class="custom-select-popover" role="listbox">
								<button
									class="custom-option"
									class:selected={appTypeSelection === 'applet'}
									type="button"
									role="option"
									aria-selected={appTypeSelection === 'applet'}
									on:click={(event) => selectOption('appType', 'applet', event)}
								>
									Applet (applets/)
								</button>
								<button
									class="custom-option"
									class:selected={appTypeSelection === 'management'}
									type="button"
									role="option"
									aria-selected={appTypeSelection === 'management'}
									on:click={(event) => selectOption('appType', 'management', event)}
								>
									Management (repo root)
								</button>
							</div>
						</div>
					</div>

					<div class="field">
						<label for="absolutePath">Absolute path ({managedApp ? 'required' : 'optional override'})</label>
						{#if managedApp}
							<input type="hidden" name="absolutePath" value={managedApp.absolutePath} />
						{/if}
						<input
							class="input"
							id="absolutePath"
							name="absolutePath"
							type="text"
							value={managedApp?.absolutePath ?? ''}
							required={Boolean(managedApp)}
							disabled={Boolean(managedApp)}
							placeholder="applets/my-app"
						/>
					</div>

					<div class="field">
						<label for="requiredPermission">Required permission (private apps)</label>
						<input
							class="input"
							id="requiredPermission"
							name="requiredPermission"
							type="text"
							value={managedApp?.requiredPermission ?? ''}
							placeholder="my-app.access"
						/>
					</div>

					{#if showInCatalogSelection}
						<div class="field">
							<label for="image">{managedApp ? 'Replace app image' : 'App image'}</label>
							<div class="file-picker">
								<input
									class="file-input-native"
									id="image"
									name="image"
									type="file"
									accept=".png,image/png"
									on:change={onImageSelected}
								/>
								<label class="file-picker-button" for="image">Choose PNG</label>
								<span class="file-picker-name">{selectedImageName}</span>
							</div>
							{#if imageUploadError}
								<small class="field-error">{imageUploadError}</small>
							{/if}
						</div>
					{:else}
						<p class="subtle">Image not needed while hidden from catalog.</p>
					{/if}

					<div class="flag-grid">
						<label class="flag-chip">
							<input class="flag-input" type="checkbox" name="enabled" bind:checked={enabledSelection} />
							<span class="flag-switch" aria-hidden="true"></span>
							<span class="flag-copy">
								<strong>{enabledSelection ? 'Enabled' : 'Disabled'}</strong>
								<small>{enabledSelection ? 'Shown in the platform list' : 'Hidden from the platform list'}</small>
							</span>
						</label>
						<label class="flag-chip">
							<input class="flag-input" type="checkbox" name="isPublic" bind:checked={isPublicSelection} />
							<span class="flag-switch" aria-hidden="true"></span>
							<span class="flag-copy">
								<strong>{isPublicSelection ? 'Public app' : 'Private app'}</strong>
								<small>{isPublicSelection ? 'No permission required' : 'Permission required'}</small>
							</span>
						</label>
						<label class="flag-chip">
							<input class="flag-input" type="checkbox" name="showWhenLocked" bind:checked={showWhenLockedSelection} />
							<span class="flag-switch" aria-hidden="true"></span>
							<span class="flag-copy">
								<strong>{showWhenLockedSelection ? 'Show when locked' : 'Hide when locked'}</strong>
								<small>{showWhenLockedSelection ? 'Visible before sign in' : 'Hidden before sign in'}</small>
							</span>
						</label>
						<label class="flag-chip">
							<input class="flag-input" type="checkbox" name="showInCatalog" bind:checked={showInCatalogSelection} />
							<span class="flag-switch" aria-hidden="true"></span>
							<span class="flag-copy">
								<strong>{showInCatalogSelection ? 'Show in catalog' : 'Hide from catalog'}</strong>
								<small>{showInCatalogSelection ? 'Appears as a Landing card' : 'Excluded from Landing cards'}</small>
							</span>
						</label>
						<label class="flag-chip">
							<input class="flag-input" type="checkbox" name="adminOnly" bind:checked={adminOnlySelection} />
							<span class="flag-switch" aria-hidden="true"></span>
							<span class="flag-copy">
								<strong>{adminOnlySelection ? 'Admin only' : 'Not admin only'}</strong>
								<small>{adminOnlySelection ? 'Visible only to admins' : 'Visible based on permission/public rules'}</small>
							</span>
						</label>
					</div>

						<button class="primary-button full-button" type="submit" disabled={isSavingApp}>
							{#if isSavingApp}
								<span class="button-spinner" aria-hidden="true"></span>
								<span>Saving…</span>
							{:else}
								{managedApp ? 'Save App' : 'Create App'}
							{/if}
						</button>
						{#if saveSuccess}
							<p class="save-success">{saveSuccess}</p>
						{/if}
						{#if saveError}
							<p class="save-error">{saveError}</p>
						{/if}
					</form>
			{:else}
				<div class="table-shell">
					<table>
						<thead>
							<tr>
								<th class="center-cell">App</th>
								<th class="center-cell">Status</th>
								<th class="center-cell">Type</th>
								<th class="center-cell">Access</th>
								<th class="center-cell">DB</th>
								<th class="center-cell">Prod</th>
								<th class="center-cell">Dev</th>
								<th class="center-cell">Path</th>
								<th class="center-cell"></th>
							</tr>
						</thead>
						<tbody>
							{#each filteredApps as app}
								<tr>
									<td class="center-cell">
										<div>
											<strong>{app.title}</strong>
											<div class="subtle">{app.endpoint}</div>
										</div>
									</td>
									<td class="center-cell">
										<span class="pill {statusClass(app)}">{statusLabel(app)}</span>
									</td>
									<td class="center-cell"><span class="pill">{app.appType}</span></td>
									<td class="center-cell">
										{#if app.isPublic}
											<span class="pill green">Public</span>
										{:else}
											<span class="pill yellow">{app.requiredPermission ?? 'permission required'}</span>
										{/if}
									</td>
										<td class="center-cell runtime-cell">
											{#if runtimeDisplayByApp[app.id]?.db.available}
												<div class="runtime-control">
													{#if runtimeDisplayByApp[app.id]?.db.controllable}
														<div class="runtime-buttons">
															<button
																class="soft-button runtime-icon-button"
																type="button"
																aria-label={`Start ${app.title} database container`}
																title="Start database"
																disabled={runtimeDisplayByApp[app.id]?.db.busy}
																on:click={() => triggerRuntimeAction(app.id, 'db', 'start')}
															>
																<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
																	<path d="M8 5v14l11-7z" />
																</svg>
															</button>
															<button
																class="soft-button runtime-icon-button"
																type="button"
																aria-label={`Stop ${app.title} database container`}
																title="Stop database"
																disabled={runtimeDisplayByApp[app.id]?.db.busy}
																on:click={() => triggerRuntimeAction(app.id, 'db', 'stop')}
															>
																<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
																	<rect x="6" y="6" width="12" height="12" rx="1.2" />
																</svg>
															</button>
														</div>
													{/if}
													<span class="subtle runtime-status {runtimeDisplayByApp[app.id]?.db.className ?? 'gray'}">
														{runtimeDisplayByApp[app.id]?.db.label ?? 'N/A'}
													</span>
												</div>
										{:else}
											<span class="subtle runtime-status gray">N/A</span>
										{/if}
									</td>
										<td class="center-cell runtime-cell">
											{#if runtimeDisplayByApp[app.id]?.prod.available}
												<div class="runtime-control">
													{#if runtimeDisplayByApp[app.id]?.prod.controllable}
														<div class="runtime-buttons">
															<button
																class="soft-button runtime-icon-button"
																type="button"
																aria-label={`Start ${app.title} production container`}
																title="Start production"
																disabled={runtimeDisplayByApp[app.id]?.prod.busy}
																on:click={() => triggerRuntimeAction(app.id, 'prod', 'start')}
															>
																<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
																	<path d="M8 5v14l11-7z" />
																</svg>
															</button>
															<button
																class="soft-button runtime-icon-button"
																type="button"
																aria-label={`Stop ${app.title} production container`}
																title="Stop production"
																disabled={runtimeDisplayByApp[app.id]?.prod.busy}
																on:click={() => triggerRuntimeAction(app.id, 'prod', 'stop')}
															>
																<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
																	<rect x="6" y="6" width="12" height="12" rx="1.2" />
																</svg>
															</button>
														</div>
													{/if}
													<span class="subtle runtime-status {runtimeDisplayByApp[app.id]?.prod.className ?? 'gray'}">
														{runtimeDisplayByApp[app.id]?.prod.label ?? 'Waiting'}
													</span>
												</div>
										{:else}
											<span class="subtle runtime-status gray">N/A</span>
										{/if}
									</td>
										<td class="center-cell runtime-cell">
											{#if runtimeDisplayByApp[app.id]?.dev.available}
												<div class="runtime-control">
													{#if runtimeDisplayByApp[app.id]?.dev.controllable}
														<div class="runtime-buttons">
															<button
																class="soft-button runtime-icon-button"
																type="button"
																aria-label={`Start ${app.title} development container`}
																title="Start development"
																disabled={runtimeDisplayByApp[app.id]?.dev.busy}
																on:click={() => triggerRuntimeAction(app.id, 'dev', 'start')}
															>
																<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
																	<path d="M8 5v14l11-7z" />
																</svg>
															</button>
															<button
																class="soft-button runtime-icon-button"
																type="button"
																aria-label={`Stop ${app.title} development container`}
																title="Stop development"
																disabled={runtimeDisplayByApp[app.id]?.dev.busy}
																on:click={() => triggerRuntimeAction(app.id, 'dev', 'stop')}
															>
																<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
																	<rect x="6" y="6" width="12" height="12" rx="1.2" />
																</svg>
															</button>
														</div>
													{/if}
													<span class="subtle runtime-status {runtimeDisplayByApp[app.id]?.dev.className ?? 'gray'}">
														{runtimeDisplayByApp[app.id]?.dev.label ?? 'Waiting'}
													</span>
												</div>
										{:else}
											<span class="subtle runtime-status gray">N/A</span>
										{/if}
									</td>
									<td class="center-cell"><span class="subtle mono">{app.absolutePath}</span></td>
									<td class="center-cell">
										<div class="action-row">
											<button class="soft-button" type="button" on:click={() => openManage(app.id)}>
												Manage
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

		</section>
	</section>
</main>
{:else}
	<div class="shell-loader" aria-label="Loading preferences" aria-live="polite">
		<span class="shell-loader-spinner" aria-hidden="true"></span>
	</div>
{/if}

<style>
	:global(:root) {
		/* Consume shared-shell theme vars instead of overriding them locally. */
		--border: color-mix(in srgb, var(--shell-text) 12%, transparent);
		--border-strong: color-mix(in srgb, var(--shell-text) 20%, transparent);
		--text: var(--shell-text);
		--muted: var(--shell-muted);
		--muted-2: color-mix(in srgb, var(--shell-muted) 82%, var(--shell-text) 18%);
		--surface-1: color-mix(in srgb, var(--shell-bg-base) 84%, var(--shell-text) 16%);
		--surface-2: color-mix(in srgb, var(--shell-bg-base) 78%, var(--shell-text) 22%);
		--surface-3: color-mix(in srgb, var(--shell-bg-base) 92%, var(--shell-text) 8%);
		--surface-4: color-mix(in srgb, var(--shell-bg-base) 88%, var(--shell-text) 12%);
		--surface-strong: color-mix(in srgb, var(--shell-bg-base) 70%, var(--shell-text) 30%);
		--success: #10b981;
		--warning: #f59e0b;
		--danger: #ef4444;
		--radius-lg: 28px;
		--radius-md: 20px;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		height: 100%;
		min-height: 100%;
		background: var(--shell-bg-base);
	}

	:global(body) {
		margin: 0;
		min-height: 100%;
		min-height: 100vh;
		min-height: 100dvh;
		color: var(--text);
		font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background:
			radial-gradient(circle at top left, color-mix(in srgb, var(--shell-spotlight-primary) 20%, transparent), transparent 34rem),
			radial-gradient(circle at bottom right, color-mix(in srgb, var(--shell-spotlight-secondary) 16%, transparent), transparent 32rem),
			var(--shell-bg-base);
		background-repeat: no-repeat, no-repeat, no-repeat;
		overflow-x: hidden;
	}

	:global(button),
	:global(input),
	:global(select) {
		font: inherit;
	}
	:global(button) {
		cursor: pointer;
	}

	.primary-button,
	.soft-button,
	.icon-button {
		border-radius: 999px;
		border: 1px solid var(--border);
		padding: 11px 16px;
		color: var(--text);
		background: var(--surface-1);
	}

	.primary-button {
		border-color: rgba(96, 165, 250, 0.5);
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(167, 139, 250, 0.92));
		color: #08111f;
		font-weight: 800;
	}

	.full-button {
		width: 100%;
	}
	.soft-button {
		padding: 8px 12px;
		font-size: 0.86rem;
	}
	.icon-button {
		width: 42px;
		height: 42px;
		display: inline-grid;
		place-items: center;
		padding: 0;
	}
	.icon-button svg {
		width: 18px;
		height: 18px;
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
		margin: 26px auto;
		max-width: 820px;
	}

	.metric {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 18px;
		text-align: center;
		background: var(--surface-1);
	}
	.metric span {
		display: block;
		color: var(--muted);
		font-size: 0.83rem;
		margin-bottom: 8px;
	}
	.metric strong {
		font-size: 1.75rem;
		letter-spacing: -0.04em;
	}
	.metric-actions {
		margin-top: 10px;
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.workspace {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		backdrop-filter: blur(24px);
		box-shadow: var(--shell-shadow);
	}

	.tabs {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		padding: 14px;
		border-bottom: 1px solid var(--border);
	}
	.tab-list {
		grid-column: 2;
		display: flex;
		justify-content: center;
		gap: 8px;
	}
	.tabs .icon-button {
		grid-column: 3;
		justify-self: end;
	}

	.tab-button {
		border: 1px solid transparent;
		border-radius: 999px;
		padding: 10px 16px;
		color: var(--muted);
		background: transparent;
		font-weight: 750;
	}

	.tab-button.active {
		color: var(--text);
		background: rgba(96, 165, 250, 0.12);
		border-color: rgba(96, 165, 250, 0.26);
	}
	.tab-panel {
		display: none;
		padding: 24px;
	}
	.tab-panel.active {
		display: block;
	}

	.toolbar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 10px;
		align-items: center;
		margin-bottom: 18px;
	}
	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: nowrap;
		grid-column: 2;
		justify-self: center;
	}
	.toolbar > .icon-button {
		grid-column: 3;
		justify-self: end;
	}
	.search,
	.input,
	.custom-select-button {
		min-height: 42px;
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-1);
		padding: 0 14px;
	}

	.search {
		min-width: min(420px, 100%);
	}
	.search::placeholder,
	.input::placeholder {
		color: var(--muted-2);
	}
	.file-picker {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 42px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-1);
		padding: 6px;
	}
	.file-input-native {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.file-picker-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 30px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-strong);
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}
	.file-picker-name {
		color: var(--muted);
		font-size: 0.84rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-right: 10px;
	}

	.native-select-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.custom-select {
		position: relative;
		min-width: 170px;
	}
	.custom-select-button {
		width: 100%;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		gap: 12px;
	}
	.custom-select-button svg {
		width: 16px;
		height: 16px;
	}
	.custom-select-popover {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		width: 100%;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface-4);
		display: none;
	}
	.custom-select.open .custom-select-popover {
		display: block;
	}
	.custom-option {
		width: 100%;
		border: 0;
		border-radius: 12px;
		padding: 10px 11px;
		color: var(--muted);
		background: transparent;
	}
	.custom-option.selected {
		color: var(--text);
		background: var(--surface-strong);
	}
	.app-type-select .custom-select-button {
		justify-content: space-between;
	}
	.app-type-select .custom-select-button [data-selected-label] {
		text-align: left;
	}
	.app-type-select .custom-option {
		text-align: left;
	}
	.app-type-select.is-locked .custom-select-button {
		opacity: 0.65;
		cursor: not-allowed;
	}
	.app-type-select.is-locked .custom-select-button svg {
		opacity: 0.55;
	}
	.input:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.table-shell {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		background: var(--surface-3);
	}
	table {
		width: 100%;
		min-width: 1080px;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		vertical-align: middle;
		padding: 16px;
		border-bottom: 1px solid var(--border);
	}
	th {
		color: var(--muted);
		font-size: 0.76rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: var(--surface-1);
	}
	tr:last-child td {
		border-bottom: 0;
	}
	.center-cell {
		text-align: center;
	}
	.subtle {
		color: var(--muted);
		font-size: 0.86rem;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}

	.pill-row {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 7px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		border: 1px solid var(--border);
		padding: 5px 9px;
		font-size: 0.78rem;
		color: var(--muted);
		background: var(--surface-1);
	}
	.pill.green {
		color: color-mix(in srgb, var(--success) 80%, var(--shell-text) 20%);
		border-color: color-mix(in srgb, var(--success) 38%, transparent);
		background: color-mix(in srgb, var(--success) 15%, transparent);
	}
	.pill.yellow {
		color: color-mix(in srgb, var(--warning) 78%, var(--shell-text) 22%);
		border-color: color-mix(in srgb, var(--warning) 38%, transparent);
		background: color-mix(in srgb, var(--warning) 15%, transparent);
	}
	.pill.red {
		color: color-mix(in srgb, var(--danger) 72%, var(--shell-text) 28%);
		border-color: color-mix(in srgb, var(--danger) 38%, transparent);
		background: color-mix(in srgb, var(--danger) 15%, transparent);
	}

	.manage-layout {
		display: grid;
		grid-template-columns: 360px minmax(0, 1fr);
		gap: 18px;
		align-items: start;
	}
	.form-card,
	.edit-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 18px;
		background: var(--surface-1);
	}
	.edit-grid {
		display: grid;
		gap: 12px;
	}
	.field {
		display: grid;
		gap: 8px;
		margin-bottom: 14px;
		text-align: left;
	}
	.field label {
		color: var(--muted);
		font-size: 0.83rem;
		font-weight: 750;
	}
	.flag-grid {
		display: grid;
		gap: 10px;
		margin-bottom: 14px;
	}
	.flag-chip {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface-3);
		color: var(--muted);
		cursor: pointer;
		transition: border-color 120ms ease, background-color 120ms ease;
	}
	.flag-input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.flag-switch {
		position: relative;
		width: 42px;
		height: 24px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface-strong);
		transition: background-color 120ms ease, border-color 120ms ease;
	}
	.flag-switch::after {
		content: '';
		position: absolute;
		left: 2px;
		top: 2px;
		width: 18px;
		height: 18px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--shell-text) 92%, var(--shell-bg-base) 8%);
		transition: transform 140ms ease;
	}
	.flag-copy {
		display: grid;
		gap: 2px;
		text-align: left;
	}
	.flag-copy strong {
		color: var(--text);
		font-size: 0.9rem;
		line-height: 1.2;
	}
	.flag-copy small {
		color: var(--muted);
		font-size: 0.76rem;
	}
	.flag-input:checked + .flag-switch {
		background: color-mix(in srgb, var(--success) 25%, transparent);
		border-color: color-mix(in srgb, var(--success) 45%, transparent);
	}
	.flag-input:checked + .flag-switch::after {
		transform: translateX(18px);
	}
	.flag-input:checked ~ .flag-copy strong {
		color: color-mix(in srgb, var(--success) 80%, var(--shell-text) 20%);
	}
	.flag-input:focus-visible + .flag-switch {
		outline: 2px solid rgba(96, 165, 250, 0.7);
		outline-offset: 2px;
	}
	.runtime-error {
		margin: 0 0 12px;
		color: color-mix(in srgb, var(--danger) 72%, var(--shell-text) 28%);
		font-size: 0.84rem;
		text-align: center;
	}
	.field-error {
		display: inline-block;
		margin-top: 6px;
		color: color-mix(in srgb, var(--danger) 76%, var(--shell-text) 24%);
		font-size: 0.78rem;
	}
	.save-error {
		margin: 10px 0 0;
		color: color-mix(in srgb, var(--danger) 76%, var(--shell-text) 24%);
		font-size: 0.82rem;
		text-align: center;
	}
	.save-success {
		margin: 10px 0 0;
		color: color-mix(in srgb, var(--success) 80%, var(--shell-text) 20%);
		font-size: 0.82rem;
		text-align: center;
	}
	.button-spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		border: 2px solid color-mix(in srgb, var(--shell-text) 35%, transparent);
		border-top-color: color-mix(in srgb, var(--shell-text) 95%, transparent);
		animation: spin 700ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.runtime-cell {
		min-width: 128px;
	}
	.runtime-control {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.runtime-buttons {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.runtime-icon-button {
		width: 34px;
		height: 34px;
		padding: 0;
		display: inline-grid;
		place-items: center;
	}
	.runtime-icon-button svg {
		width: 14px;
		height: 14px;
	}
	.runtime-icon-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.runtime-status {
		font-weight: 700;
		font-size: 0.79rem;
	}
	.runtime-status.green {
		color: color-mix(in srgb, var(--success) 80%, var(--shell-text) 20%);
	}
	.runtime-status.yellow {
		color: color-mix(in srgb, var(--warning) 78%, var(--shell-text) 22%);
	}
	.runtime-status.red {
		color: color-mix(in srgb, var(--danger) 72%, var(--shell-text) 28%);
	}
	.runtime-status.gray {
		color: var(--muted-2);
	}

	@media (max-width: 920px) {
		.status-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 10px;
		}
		.manage-layout {
			grid-template-columns: 1fr;
		}
		.desktop-table {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.status-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 8px;
		}
		.metric {
			padding: 12px 8px;
		}
		.metric strong {
			font-size: 1.25rem;
		}
		.metric-actions {
			gap: 6px;
		}
		.toolbar {
			display: flex;
			justify-content: center;
			flex-wrap: wrap;
		}
		.toolbar-left {
			flex-wrap: wrap;
			justify-content: center;
		}
		.tabs {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.tab-list {
			grid-column: 1;
			justify-content: flex-start;
			overflow-x: auto;
		}
		.tabs .icon-button {
			grid-column: 2;
		}
		.tab-panel {
			padding: 16px;
			min-width: 0;
		}
		.workspace {
			min-width: 0;
		}
		.table-shell {
			display: block;
			width: 100%;
			max-width: 100%;
			min-width: 0;
			overscroll-behavior-x: contain;
			scrollbar-gutter: stable both-edges;
			scrollbar-width: thin;
			scrollbar-color: color-mix(in srgb, var(--shell-text) 30%, transparent) transparent;
		}
		.table-shell::-webkit-scrollbar {
			height: 10px;
		}
		.table-shell::-webkit-scrollbar-track {
			background: transparent;
		}
		.table-shell::-webkit-scrollbar-thumb {
			border-radius: 999px;
			border: 2px solid transparent;
			background-clip: padding-box;
			background-color: color-mix(in srgb, var(--shell-text) 30%, transparent);
		}
		.table-shell::-webkit-scrollbar-thumb:hover {
			background-color: color-mix(in srgb, var(--shell-text) 42%, transparent);
		}
	}
</style>
