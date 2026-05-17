<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ShellTopbar, resolveShellTheme } from '$shell';
	import '$shell/shell.css';
	import type { PageData } from './$types';

	export let data: PageData;

	type TabId = 'users' | 'invites' | 'apps';
	type SelectId = 'userFilter' | 'inviteAccess';

	let activeTab: TabId = 'users';
	let isUserMenuOpen = false;
	let themeReady = false;
	let openSelect: SelectId | null = null;

	let userSearch = '';
	let userFilter = 'All users';

	let inviteEmail = '';
	let inviteAccess = '';
	let inviteFeedback = '';
	let inviteError = '';
	let isSavingInvite = false;
	let managedUserId = '';
	let dragAppId = '';
	let adminSaveError = '';
	let appAccessSaveError = '';
	let isSavingAdmin = false;
	let savingAccessByAppId: Record<string, number> = {};
	let pendingTargetByAppId: Record<string, boolean> = {};
	const DEBUG_DND = true;
	let dndTraceId = 0;

	const userFilterOptions = ['All users', 'Active only', 'Admins only', 'Inactive only'];
	$: inviteAccessOptions = [
		{ value: '', label: 'No app access yet' },
		...catalogApps.map((app) => ({ value: app.id, label: app.title }))
	];

	$: shellTheme = resolveShellTheme({
		mode: data?.user?.themeMode ?? data?.user?.colorMode ?? 'dark',
		primary: data?.user?.primaryColor ?? data?.user?.themePrimary ?? data?.user?.shellPrimary,
		secondary: data?.user?.secondaryColor ?? data?.user?.themeSecondary ?? data?.user?.shellSecondary
	});

	function applyShellTheme() {
		if (!browser) return;
		document.documentElement.dataset.theme = shellTheme.mode;
		document.documentElement.style.setProperty('--shell-spotlight-primary', shellTheme.primary);
		document.documentElement.style.setProperty('--shell-spotlight-secondary', shellTheme.secondary);
	}

	$: applyShellTheme();

	onMount(() => {
		applyShellTheme();
		const frame = window.requestAnimationFrame(() => {
			themeReady = true;
		});
		return () => {
			window.cancelAnimationFrame(frame);
		};
	});

	$: activeUsers = data.users.filter((user) => user.status === 'active').length;
	$: pendingInvites = data.invites.filter((invite) => invite.status === 'pending').length;
	$: registeredApps = data.apps.length;

	$: filteredUsers = data.users.filter((user) => {
		const query = userSearch.trim().toLowerCase();

		const searchable = [
			user.firstName,
			user.lastName,
			user.email,
			user.status,
			user.isAdmin ? 'admin' : 'user',
			...user.appAccess
		]
			.join(' ')
			.toLowerCase();

		const matchesSearch = query.length === 0 || searchable.includes(query);

		const matchesFilter =
			userFilter === 'All users' ||
			(userFilter === 'Active only' && user.status === 'active') ||
			(userFilter === 'Admins only' && user.isAdmin) ||
			(userFilter === 'Inactive only' && user.status === 'inactive');

		return matchesSearch && matchesFilter;
	});

	$: managedUser = data.users.find((user) => user.id === managedUserId) ?? null;
	$: catalogApps = data.apps.filter((app) => app.showInCatalog !== false);
	$: managedAccessIds = new Set(managedUser?.appAccessIds ?? []);
	$: grantedApps = catalogApps.filter((app) => managedAccessIds.has(app.id));
	$: noAccessApps = catalogApps.filter((app) => !managedAccessIds.has(app.id));

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

	function statusLabel(status: string) {
		if (status === 'active') return 'Active';
		if (status === 'limited') return 'Limited';
		if (status === 'inactive') return 'Inactive';
		return status;
	}

	function statusClass(status: string) {
		if (status === 'active') return 'green';
		if (status === 'limited') return 'yellow';
		if (status === 'inactive') return 'red';
		return '';
	}

	function inviteStatusLabel(status: string) {
		if (status === 'pending') return 'Pending';
		if (status === 'used') return 'Used';
		if (status === 'revoked') return 'Revoked';
        if (status === 'expired') return 'Expired';
		return status;
	}

	function inviteStatusClass(status: string) {
		if (status === 'pending') return 'yellow';
		if (status === 'used') return 'green';
		if (status === 'revoked') return 'red';
        if (status === 'expired') return 'red';
		return '';
	}

	function deliveryLabel(delivery: string) {
		if (delivery === 'sent') return 'Sent';
		if (delivery === 'email_error') return 'Email error';
		if (delivery === 'not_sent') return 'Not sent';
		return delivery;
	}

	function deliveryClass(delivery: string) {
		if (delivery === 'sent') return 'green';
		if (delivery === 'email_error') return 'red';
		return '';
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
		openSelect = openSelect === id ? null : id;
		isUserMenuOpen = false;
	}

	function selectOption(id: SelectId, value: string, event: MouseEvent) {
		event.stopPropagation();

		if (id === 'userFilter') {
			userFilter = value;
		}

		if (id === 'inviteAccess') {
			inviteAccess = value;
		}

		openSelect = null;
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

	async function createInvite() {
		const email = inviteEmail.trim();
		if (!email) {
			inviteError = 'Email address is required.';
			inviteFeedback = '';
			return;
		}

		inviteError = '';
		inviteFeedback = '';
		isSavingInvite = true;
		try {
			const response = await fetch('/auth/api/invites', {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'create',
					email,
					initialAppId: inviteAccess || null
				})
			});
			if (!response.ok) {
				const message = (await response.text()) || 'Could not create invite.';
				throw new Error(message);
			}

			inviteEmail = '';
			inviteAccess = '';
			inviteFeedback = 'Invite sent successfully.';
			await invalidateAll();
		} catch (err) {
			inviteError = err instanceof Error ? err.message : 'Could not create invite.';
		} finally {
			isSavingInvite = false;
		}
	}

	function applyUserMutation(userId: string, mutate: (user: (typeof data.users)[number]) => (typeof data.users)[number]) {
		data = {
			...data,
			users: data.users.map((user) => (user.id === userId ? mutate(user) : user))
		};
	}


	function logCardDomState(appId: string, phase: string) {
		if (!DEBUG_DND || !browser) return;
		requestAnimationFrame(() => {
			const selector = `[data-app-id="${appId}"]`;
			const nodes = Array.from(document.querySelectorAll(selector));
		});
	}

	function updateLocalAccess(userId: string, appId: string, grant: boolean) {
		const app = catalogApps.find((entry) => entry.id === appId);
		if (!app) return;

		applyUserMutation(userId, (user) => {
			const idSet = new Set(user.appAccessIds ?? []);
			const titleSet = new Set(user.appAccess ?? []);

			if (grant) {
				idSet.add(appId);
				titleSet.add(app.title);
			} else {
				idSet.delete(appId);
				titleSet.delete(app.title);
			}

			return {
				...user,
				appAccessIds: Array.from(idSet).sort((a, b) => a.localeCompare(b)),
				appAccess: Array.from(titleSet).sort((a, b) => a.localeCompare(b))
			};
		});
	}

	async function patchManagedUser(userId: string, payload: Record<string, unknown>) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 8000);
		let response: Response;
		try {
			response = await fetch(`/auth/api/users/${userId}`, {
				method: 'PATCH',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify(payload),
				signal: controller.signal
			});
		} catch (err) {
			logDnd('patch:error', {
				userId,
				payload,
				error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
			});
			throw err;
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) {
			const text = await response.text();
			logDnd('patch:not-ok', {
				userId,
				status: response.status,
				body: text.slice(0, 300)
			});
			throw new Error(text || 'Update failed');
		}
	}

	function manageUser(userId: string) {
		managedUserId = userId;
		adminSaveError = '';
		appAccessSaveError = '';
		openSelect = null;
	}

	function backToUsersTable() {
		managedUserId = '';
		dragAppId = '';
		adminSaveError = '';
		appAccessSaveError = '';
	}

	async function toggleManagedUserAdmin(event: Event) {
		if (!managedUser) return;

		const input = event.currentTarget as HTMLInputElement;
		const nextIsAdmin = input.checked;
		const previousIsAdmin = managedUser.isAdmin;

		adminSaveError = '';
		isSavingAdmin = true;
		applyUserMutation(managedUser.id, (user) => ({ ...user, isAdmin: nextIsAdmin }));

		try {
			await patchManagedUser(managedUser.id, {
				action: 'set-admin',
				isAdmin: nextIsAdmin
			});
		} catch (err) {
			applyUserMutation(managedUser.id, (user) => ({ ...user, isAdmin: previousIsAdmin }));
			adminSaveError = err instanceof Error ? err.message : 'Could not update admin status.';
		} finally {
			isSavingAdmin = false;
		}
	}

	function isSavingAppAccess(appId: string) {
		const normalized = appId.trim();
		return (savingAccessByAppId[normalized] ?? 0) > 0;
	}

	function beginSavingAppAccess(appId: string) {
		const normalized = appId.trim();
		if (!normalized) return;
		savingAccessByAppId = {
			...savingAccessByAppId,
			[normalized]: (savingAccessByAppId[normalized] ?? 0) + 1
		};
	}

	function endSavingAppAccess(appId: string) {
		const normalized = appId.trim();
		if (!normalized) return;
		const nextCount = Math.max((savingAccessByAppId[normalized] ?? 0) - 1, 0);
		const nextMap = { ...savingAccessByAppId };

		if (nextCount === 0) {
			delete nextMap[normalized];
		} else {
			nextMap[normalized] = nextCount;
		}

		savingAccessByAppId = nextMap;
	}

	function setPendingTarget(appId: string, grant: boolean) {
		pendingTargetByAppId = {
			...pendingTargetByAppId,
			[appId]: grant
		};
	}

	function clearPendingTarget(appId: string) {
		const next = { ...pendingTargetByAppId };
		delete next[appId];
		pendingTargetByAppId = next;
	}

	async function setAppAccess(appId: string, grant: boolean) {
		if (!managedUser) return;
		const normalizedAppId = appId.trim();
		if (!normalizedAppId) return;

		// De-dupe identical in-flight requests for this app.
		if (isSavingAppAccess(normalizedAppId) && pendingTargetByAppId[normalizedAppId] === grant) return;

		const hadAccess = managedAccessIds.has(normalizedAppId);
		if (hadAccess === grant) return;
		const traceId = ++dndTraceId;

		appAccessSaveError = '';
		beginSavingAppAccess(normalizedAppId);
		setPendingTarget(normalizedAppId, grant);
		logDnd('access:start', {
			traceId,
			appId: normalizedAppId,
			grant,
			hadAccess,
			savingCount: savingAccessByAppId[normalizedAppId] ?? 0
		});
		logCardDomState(normalizedAppId, `start#${traceId}`);
		updateLocalAccess(managedUser.id, normalizedAppId, grant);

		try {
			const app = catalogApps.find((entry) => entry.id === normalizedAppId);
			await patchManagedUser(managedUser.id, {
				action: 'set-app-access',
				appId: normalizedAppId,
				permission: app?.requiredPermission ?? null,
				granted: grant
			});
			logDnd('access:commit', { traceId, appId: normalizedAppId, grant });
		} catch (err) {
			updateLocalAccess(managedUser.id, normalizedAppId, hadAccess);
			appAccessSaveError = err instanceof Error ? err.message : 'Could not update app access.';
			logDnd('access:rollback', {
				traceId,
				appId: normalizedAppId,
				grant,
				error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
			});
		} finally {
			endSavingAppAccess(normalizedAppId);
			clearPendingTarget(normalizedAppId);
			logDnd('access:end', {
				traceId,
				appId: normalizedAppId,
				grant,
				savingCount: savingAccessByAppId[normalizedAppId] ?? 0
			});
			logCardDomState(normalizedAppId, `end#${traceId}`);
		}
	}

	function onAppDragStart(event: DragEvent, appId: string) {
		if (isSavingAppAccess(appId)) {
			event.preventDefault();
			logDnd('drag:blocked-saving', { appId });
			return;
		}

		dragAppId = appId;
		event.dataTransfer?.setData('text/plain', appId);
		event.dataTransfer?.setData('application/x-auth-app-id', appId);
		event.dataTransfer?.setDragImage(event.currentTarget as Element, 24, 24);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function onAppDragEnd() {
		dragAppId = '';
	}

	function allowDrop(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function onDropTo(event: DragEvent, grant: boolean) {
		event.preventDefault();
		const appId = (
			event.dataTransfer?.getData('application/x-auth-app-id') ||
			event.dataTransfer?.getData('text/plain') ||
			dragAppId
		).trim();
		logDnd('drop', { appId, grant });
		dragAppId = '';

		if (!appId) return;
		void setAppAccess(appId, grant);
	}

	async function revokeInvite(inviteId: string) {
		inviteError = '';
		inviteFeedback = '';
		try {
			const response = await fetch('/auth/api/invites', {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'revoke',
					inviteId
				})
			});
			if (!response.ok) {
				const message = (await response.text()) || 'Could not revoke invite.';
				throw new Error(message);
			}
			inviteFeedback = 'Invite revoked.';
			await invalidateAll();
		} catch (err) {
			inviteError = err instanceof Error ? err.message : 'Could not revoke invite.';
		}
	}

	async function resendInvite(inviteId: string) {
		inviteError = '';
		inviteFeedback = '';
		try {
			const response = await fetch('/auth/api/invites', {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'resend',
					inviteId
				})
			});
			if (!response.ok) {
				const message = (await response.text()) || 'Could not resend invite.';
				throw new Error(message);
			}
			inviteFeedback = 'Invite resent.';
			await invalidateAll();
		} catch (err) {
			inviteError = err instanceof Error ? err.message : 'Could not resend invite.';
		}
	}

	function viewInviteUser(inviteId: string) {
	}
</script>

<svelte:head>
	<title>Auth Portal</title>
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
		title="Auth Portal"
		initials={getUserInitials(data.user)}
		isMenuOpen={isUserMenuOpen}
		userName={getUserFullName(data.user)}
		onToggleMenu={toggleUserMenu}
		onManageAccount={manageAccount}
		onLogout={logOut}
	/>

	<section class="status-grid" aria-label="Auth portal summary">
		<div class="metric">
			<span>Active users</span>
			<strong>{activeUsers}</strong>
		</div>

		<div class="metric">
			<span>Pending invites</span>
			<strong>{pendingInvites}</strong>
		</div>

		<div class="metric">
			<span>Registered apps</span>
			<strong>{registeredApps}</strong>
		</div>
	</section>

	<section class="workspace">
		<nav class="tabs" aria-label="Admin sections">
			<div class="tab-list">
				<button
					class="tab-button"
					class:active={activeTab === 'users'}
					type="button"
					on:click={() => (activeTab = 'users')}
				>
					Users
				</button>

				<button
					class="tab-button"
					class:active={activeTab === 'invites'}
					type="button"
					on:click={() => (activeTab = 'invites')}
				>
					Invites
				</button>

				<button
					class="tab-button"
					class:active={activeTab === 'apps'}
					type="button"
					on:click={() => (activeTab = 'apps')}
				>
					Apps & Permissions
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

		<section class="tab-panel" class:active={activeTab === 'users'} id="usersPanel">
			{#if managedUser}
				<div class="toolbar user-manage-toolbar">
					<div class="manage-user-heading">
						<span class="mini-avatar">{getUserInitials(managedUser)}</span>
						<div>
							<strong>{getUserFullName(managedUser)}</strong>
							<div class="subtle">{managedUser.email}</div>
						</div>
					</div>

					<button
						class="icon-button"
						type="button"
						on:click={backToUsersTable}
						aria-label="Back to users table"
						title="Back to users table"
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
							<path d="m15 18-6-6 6-6" />
						</svg>
					</button>
				</div>

				<div class="manage-user-layout">
					<aside class="form-card">
						<h3>User settings</h3>
						<div class="field">
							<label class="admin-chip">
								<input
									class="flag-input"
									type="checkbox"
									checked={managedUser.isAdmin}
									disabled={isSavingAdmin}
									on:change={toggleManagedUserAdmin}
								/>
								<span class="flag-switch" aria-hidden="true"></span>
								<span class="flag-copy">
									<strong>{managedUser.isAdmin ? 'Admin enabled' : 'Standard user'}</strong>
								</span>
							</label>
						</div>
						{#if adminSaveError}
							<p class="save-error">{adminSaveError}</p>
						{/if}
					</aside>

					<div class="dnd-access-grid">
						<div
							class="dnd-column"
							on:dragover={allowDrop}
							on:drop={(event) => onDropTo(event, false)}
						>
							<div class="dnd-column-header">
								<h3>Restricted Access</h3>
								<span>{noAccessApps.length}</span>
							</div>
							<div class="dnd-list">
								{#each noAccessApps as app (app.id)}
									<div
										class="dnd-card"
										class:is-dragging={dragAppId === app.id}
										data-app-id={app.id}
										role="button"
										tabindex="0"
										draggable="true"
										on:dragstart={(event) => onAppDragStart(event, app.id)}
										on:dragend={onAppDragEnd}
										on:dblclick={() => setAppAccess(app.id, true)}
										on:keydown={(event) => {
											if (event.key === 'Enter' || event.key === ' ') {
												event.preventDefault();
												void setAppAccess(app.id, true);
											}
										}}
									>
										<strong>{app.title}</strong>
										<span>{app.id}</span>
									</div>
								{/each}
							</div>
						</div>

						<div
							class="dnd-column"
							on:dragover={allowDrop}
							on:drop={(event) => onDropTo(event, true)}
						>
							<div class="dnd-column-header">
								<h3>Granted access</h3>
								<span>{grantedApps.length}</span>
							</div>
							<div class="dnd-list">
								{#each grantedApps as app (app.id)}
									<div
										class="dnd-card granted"
										class:is-dragging={dragAppId === app.id}
										data-app-id={app.id}
										role="button"
										tabindex="0"
										draggable="true"
										on:dragstart={(event) => onAppDragStart(event, app.id)}
										on:dragend={onAppDragEnd}
										on:dblclick={() => setAppAccess(app.id, false)}
										on:keydown={(event) => {
											if (event.key === 'Enter' || event.key === ' ') {
												event.preventDefault();
												void setAppAccess(app.id, false);
											}
										}}
									>
										<strong>{app.title}</strong>
										<span>{app.id}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				{#if appAccessSaveError}
					<p class="save-error">{appAccessSaveError}</p>
				{/if}
			{:else}
				<div class="toolbar">
					<input
						class="search"
						id="userSearch"
						type="search"
						placeholder="Search users by name or email"
						bind:value={userSearch}
					/>

					<div class="custom-select" class:open={openSelect === 'userFilter'}>
						<select
							class="native-select-hidden"
							id="userFilter"
							aria-label="Filter users"
							bind:value={userFilter}
						>
							{#each userFilterOptions as option}
								<option value={option}>{option}</option>
							{/each}
						</select>

						<button
							class="custom-select-button"
							type="button"
							aria-haspopup="listbox"
							aria-expanded={openSelect === 'userFilter'}
							on:click={(event) => toggleSelect('userFilter', event)}
						>
							<span data-selected-label>{userFilter}</span>

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
							{#each userFilterOptions as option}
								<button
									class="custom-option"
									class:selected={userFilter === option}
									type="button"
									role="option"
									aria-selected={userFilter === option}
									on:click={(event) => selectOption('userFilter', option, event)}
								>
									{option}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<div class="table-shell desktop-table">
					<table class="center-all">
						<thead>
							<tr>
								<th>User</th>
								<th class="center-cell">Status</th>
								<th class="center-cell">Role</th>
								<th></th>
							</tr>
						</thead>

						<tbody>
							{#each filteredUsers as user}
								<tr>
									<td>
										<div class="person">
											<span class="mini-avatar">{getUserInitials(user)}</span>
											<span>
												<strong>{getUserFullName(user)}</strong>
												<span>{user.email}</span>
											</span>
										</div>
									</td>

									<td class="center-cell">
										<span class="pill {statusClass(user.status)}">{statusLabel(user.status)}</span>
									</td>

									<td class="center-cell">
										<span class="pill" class:blue={user.isAdmin}>{user.isAdmin ? 'Admin' : 'User'}</span>
									</td>

									<td>
										<div class="action-row">
											<button class="soft-button" type="button" on:click={() => manageUser(user.id)}>
												Manage
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="mobile-cards">
					{#each filteredUsers as user}
						<article class="mobile-card">
							<div class="person">
								<span class="mini-avatar">{getUserInitials(user)}</span>
								<span>
									<strong>{getUserFullName(user)}</strong>
									<span>{user.email}</span>
								</span>
							</div>

							<div class="mobile-card-header">
								<div class="pill-row">
									<span class="pill {statusClass(user.status)}">{statusLabel(user.status)}</span>
									<span class="pill" class:blue={user.isAdmin}>{user.isAdmin ? 'Admin' : 'User'}</span>
								</div>

								<button class="soft-button" type="button" on:click={() => manageUser(user.id)}>Manage</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<section class="tab-panel" class:active={activeTab === 'invites'} id="invitesPanel">
			<div class="invite-layout">
				<form class="form-card" on:submit|preventDefault={createInvite}>
					<h3>Create Invite</h3>

					<div class="field">
						<label for="inviteEmail">Email address</label>
						<input
							class="input"
							id="inviteEmail"
							type="email"
							placeholder="person@example.com"
							bind:value={inviteEmail}
						/>
					</div>

					<div class="field">
						<label for="inviteAccess">Initial access</label>

						<div class="custom-select" class:open={openSelect === 'inviteAccess'}>
							<select class="native-select-hidden" id="inviteAccess" bind:value={inviteAccess}>
								{#each inviteAccessOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>

							<button
								class="custom-select-button"
								type="button"
								aria-haspopup="listbox"
								aria-expanded={openSelect === 'inviteAccess'}
								on:click={(event) => toggleSelect('inviteAccess', event)}
							>
								<span data-selected-label>{inviteAccessOptions.find((option) => option.value === inviteAccess)?.label ?? 'No app access yet'}</span>

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
								{#each inviteAccessOptions as option}
									<button
										class="custom-option"
										class:selected={inviteAccess === option.value}
										type="button"
										role="option"
										aria-selected={inviteAccess === option.value}
										on:click={(event) => selectOption('inviteAccess', option.value, event)}
									>
										{option.label}
									</button>
								{/each}
							</div>
						</div>
					</div>

					<button class="primary-button full-button" type="submit" disabled={isSavingInvite}>
						{isSavingInvite ? 'Sending invite...' : 'Create Invite'}
					</button>

					{#if inviteFeedback}
						<p class="save-success">{inviteFeedback}</p>
					{/if}

					{#if inviteError}
						<p class="save-error">{inviteError}</p>
					{/if}
				</form>

				<div class="table-shell desktop-table invites-table">
					<table class="center-all">
						<thead>
							<tr>
								<th>Email</th>
								<th class="center-cell">Status</th>
								<th class="center-cell">Expires</th>
								<th class="center-cell">Delivery</th>
								<th></th>
							</tr>
						</thead>

						<tbody>
							{#each data.invites as invite}
								<tr>
									<td>{invite.email}</td>

									<td class="center-cell">
										<span class="pill {inviteStatusClass(invite.status)}">
											{inviteStatusLabel(invite.status)}
										</span>
									</td>

									<td class="center-cell">
										<span class="subtle">{invite.expiresLabel}</span>
									</td>

									<td class="center-cell">
										<span class="pill {deliveryClass(invite.delivery)}">
											{deliveryLabel(invite.delivery)}
										</span>
									</td>

									<td>
										<div class="action-row">
											{#if invite.status === 'pending' && invite.delivery === 'email_error'}
												<button class="soft-button" type="button" on:click={() => resendInvite(invite.id)}>
													Resend
												</button>
											{/if}

											{#if invite.status === 'pending'}
												<button class="danger-button" type="button" on:click={() => revokeInvite(invite.id)}>
													Revoke
												</button>
											{:else if invite.status === 'used'}
												<button class="soft-button" type="button" on:click={() => viewInviteUser(invite.id)}>
													View user
												</button>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="mobile-cards">
					{#each data.invites as invite}
						<article class="mobile-card">
							<div>
								<strong>{invite.email}</strong>
								<div class="subtle">{invite.expiresLabel}</div>
							</div>

							<div class="mobile-card-header">
								<div class="pill-row">
									<span class="pill {inviteStatusClass(invite.status)}">
										{inviteStatusLabel(invite.status)}
									</span>
									<span class="pill {deliveryClass(invite.delivery)}">
										{deliveryLabel(invite.delivery)}
									</span>
								</div>

								<div class="action-row">
									{#if invite.status === 'pending' && invite.delivery === 'email_error'}
										<button class="soft-button" type="button" on:click={() => resendInvite(invite.id)}>
											Resend
										</button>
									{/if}

									{#if invite.status === 'pending'}
										<button class="danger-button" type="button" on:click={() => revokeInvite(invite.id)}>
											Revoke
										</button>
									{:else if invite.status === 'used'}
										<button class="soft-button" type="button" on:click={() => viewInviteUser(invite.id)}>
											View user
										</button>
									{/if}
								</div>
							</div>
						</article>
					{/each}
				</div>
			</div>
		</section>

		<section class="tab-panel" class:active={activeTab === 'apps'} id="appsPanel">
			<div class="app-grid">
				{#each data.apps as app}
					<article class="app-card">
						<div>
							<h3>{app.title}</h3>
							<div class="endpoint">{app.endpoint}</div>
							<div class="permission-code">{app.requiredPermission}</div>
						</div>

						<div class="pill-row">
							{#if app.enabled}
								<span class="pill green">Enabled</span>
							{:else}
								<span class="pill red">Disabled</span>
							{/if}

							{#if app.adminOnly}
								<span class="pill blue">Admin only</span>
							{/if}

							{#if app.showWhenLocked}
								<span class="pill yellow">Show locked</span>
							{/if}

							{#if !app.publicAccess}
								<span class="pill red">No public access</span>
							{/if}
						</div>
					</article>
				{/each}
			</div>
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
		/* Inherit shell theme variables from shared-shell instead of forcing dark defaults. */
		--bg: var(--shell-bg-base);
		--panel: color-mix(in srgb, var(--shell-bg-base) 78%, var(--shell-text) 22%);
		--panel-strong: color-mix(in srgb, var(--shell-bg-base) 72%, var(--shell-text) 28%);
		--panel-soft: color-mix(in srgb, var(--shell-bg-base) 90%, var(--shell-text) 10%);
		--border: color-mix(in srgb, var(--shell-text) 12%, transparent);
		--border-strong: color-mix(in srgb, var(--shell-text) 20%, transparent);
		--text: var(--shell-text);
		--muted: var(--shell-muted);
		--muted-2: color-mix(in srgb, var(--shell-muted) 82%, var(--shell-text) 18%);
		--blue: #60a5fa;
		--purple: #a78bfa;
		--green: #34d399;
		--yellow: #fbbf24;
		--red: #fb7185;
		--accent: var(--shell-spotlight-primary);
		--shadow: var(--shell-shadow);
		--radius-lg: 28px;
		--radius-md: 20px;
		--radius-sm: 14px;
	}

	:global(:root[data-theme='light']) {
		--panel: color-mix(in srgb, white 88%, var(--shell-bg-base) 12%);
		--panel-strong: color-mix(in srgb, white 94%, var(--shell-bg-base) 6%);
		--panel-soft: color-mix(in srgb, white 82%, var(--shell-bg-base) 18%);
		--border: color-mix(in srgb, var(--shell-text) 20%, transparent);
		--border-strong: color-mix(in srgb, var(--shell-text) 30%, transparent);
		--muted: color-mix(in srgb, var(--shell-muted) 70%, var(--shell-text) 30%);
		--muted-2: color-mix(in srgb, var(--shell-muted) 54%, var(--shell-text) 46%);
		--shadow: 0 18px 44px rgba(15, 23, 42, 0.1);
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		min-height: 100vh;
		color: var(--text);
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background:
			radial-gradient(
				circle at top left,
				color-mix(in srgb, var(--shell-spotlight-primary) 20%, transparent),
				transparent 34rem
			),
			radial-gradient(
				circle at bottom right,
				color-mix(in srgb, var(--shell-spotlight-secondary) 16%, transparent),
				transparent 32rem
			),
			var(--shell-bg-base);
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
	.danger-button,
	.icon-button {
		border-radius: 999px;
		border: 1px solid var(--border);
		padding: 11px 16px;
		color: var(--text);
		background: rgba(255, 255, 255, 0.055);
		transition:
			transform 150ms ease,
			border-color 150ms ease,
			background 150ms ease;
	}

	.soft-button:hover,
	.danger-button:hover,
	.primary-button:hover {
		transform: translateY(-1px);
		border-color: var(--border-strong);
	}

	.primary-button {
		border-color: color-mix(in srgb, var(--shell-spotlight-primary) 50%, transparent);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--shell-spotlight-primary) 94%, white 6%),
			color-mix(in srgb, var(--shell-spotlight-secondary) 92%, white 8%)
		);
		color: #08111f;
		font-weight: 800;
		box-shadow: 0 18px 42px color-mix(in srgb, var(--shell-spotlight-primary) 24%, transparent);
	}

	.full-button {
		width: 100%;
		justify-content: center;
	}

	.soft-button {
		padding: 8px 12px;
		font-size: 0.86rem;
	}

	.danger-button {
		padding: 8px 12px;
		font-size: 0.86rem;
		color: #fecdd3;
		background: rgba(251, 113, 133, 0.1);
		border-color: rgba(251, 113, 133, 0.2);
	}

	.icon-button {
		width: 42px;
		height: 42px;
		display: inline-grid;
		place-items: center;
		padding: 0;
		color: var(--muted);
	}

	.icon-button:hover {
		color: var(--text);
	}

	.icon-button svg {
		width: 18px;
		height: 18px;
	}

	.eyebrow {
		color: var(--blue);
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin-bottom: 10px;
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
		background: rgba(255, 255, 255, 0.052);
		backdrop-filter: blur(16px);
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

	.workspace {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel);
		backdrop-filter: blur(24px);
		box-shadow: var(--shadow);
		overflow: visible;
	}

	.tabs {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		padding: 14px;
		border-bottom: 1px solid var(--border);
		background: var(--panel-soft);
		border-radius: var(--radius-lg);
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
		transition:
			background 150ms ease,
			color 150ms ease,
			border-color 150ms ease;
	}

	.tab-button:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.055);
	}

	.tab-button.active {
		color: var(--text);
		background: rgba(96, 165, 250, 0.12);
		border-color: rgba(96, 165, 250, 0.26);
	}

	.tab-panel {
		display: none;
		padding: 24px;
		overflow: visible;
	}

	.tab-panel.active {
		display: block;
	}

	.toolbar {
		display: flex;
		justify-content: center;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 18px;
		position: relative;
		z-index: 40;
	}

	.search,
	.input,
	.custom-select-button {
		min-height: 42px;
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--panel-soft);
		padding: 0 14px;
		outline: none;
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
		display: inline-block;
		width: max-content;
		min-width: 170px;
		z-index: 50;
	}

	.custom-select.open {
		z-index: 1000;
	}

	.custom-select-button {
		position: relative;
		width: 100%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
		white-space: nowrap;
		text-align: center;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			transform 150ms ease;
	}

	.custom-select-button [data-selected-label] {
		flex: 1;
		text-align: center;
	}

	.custom-select-button:hover,
	.custom-select.open .custom-select-button {
		border-color: var(--border-strong);
		background: var(--panel-strong);
		transform: translateY(-1px);
	}

	.custom-select-button svg {
		position: absolute;
		right: 14px;
		width: 16px;
		height: 16px;
		color: var(--muted);
		flex: 0 0 auto;
		transition: transform 150ms ease;
	}

	.custom-select.open .custom-select-button svg {
		transform: rotate(180deg);
	}

	.custom-select-popover {
		position: absolute;
		z-index: 1001;
		top: calc(100% + 8px);
		left: 0;
		width: 100%;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--panel-strong);
		backdrop-filter: blur(22px);
		box-shadow: var(--shadow);
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
		text-align: center;
		white-space: nowrap;
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.custom-option:hover,
	.custom-option.selected {
		color: var(--text);
		background: var(--panel-soft);
	}

	.search {
		min-width: min(340px, 100%);
	}

	.search::placeholder,
	.input::placeholder {
		color: var(--muted-2);
	}

	.table-shell {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--panel-soft);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		text-align: left;
		padding: 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.075);
		vertical-align: middle;
	}

	.center-cell {
		text-align: center;
	}

	.center-cell .pill {
		justify-content: center;
	}

	.center-all th,
	.center-all td {
		text-align: center;
	}

	.center-all .person {
		justify-content: center;
	}

	.center-all .person > span {
		text-align: center;
	}

	th {
		color: var(--muted);
		font-size: 0.76rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: var(--panel-soft);
	}

	tr:last-child td {
		border-bottom: 0;
	}

	.person {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.mini-avatar {
		width: 38px;
		height: 38px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		font-weight: 850;
		background: rgba(96, 165, 250, 0.14);
		border: 1px solid rgba(96, 165, 250, 0.23);
		color: #bfdbfe;
	}

	.person strong {
		display: block;
		margin-bottom: 4px;
	}

	.person span,
	.subtle {
		color: var(--muted);
		font-size: 0.86rem;
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
		gap: 6px;
		border-radius: 999px;
		border: 1px solid var(--border);
		padding: 5px 9px;
		font-size: 0.78rem;
		color: var(--muted);
		background: rgba(255, 255, 255, 0.045);
		white-space: nowrap;
	}

	.pill.green {
		color: #bbf7d0;
		border-color: rgba(52, 211, 153, 0.24);
		background: rgba(52, 211, 153, 0.1);
	}

	.pill.yellow {
		color: #fde68a;
		border-color: rgba(251, 191, 36, 0.24);
		background: rgba(251, 191, 36, 0.1);
	}

	.pill.red {
		color: #fecdd3;
		border-color: rgba(251, 113, 133, 0.24);
		background: rgba(251, 113, 133, 0.1);
	}

	.pill.blue {
		color: #bfdbfe;
		border-color: rgba(96, 165, 250, 0.24);
		background: rgba(96, 165, 250, 0.1);
	}

	:global(:root[data-theme='light']) .pill.green {
		color: #065f46;
		border-color: rgba(5, 150, 105, 0.42);
		background: rgba(16, 185, 129, 0.24);
	}

	:global(:root[data-theme='light']) .pill.yellow {
		color: #854d0e;
		border-color: rgba(217, 119, 6, 0.44);
		background: rgba(245, 158, 11, 0.27);
	}

	:global(:root[data-theme='light']) .pill.red {
		color: #9f1239;
		border-color: rgba(225, 29, 72, 0.42);
		background: rgba(244, 63, 94, 0.24);
	}

	:global(:root[data-theme='light']) .pill.blue {
		color: #1e3a8a;
		border-color: rgba(37, 99, 235, 0.42);
		background: rgba(59, 130, 246, 0.24);
	}

	.action-row {
		display: flex;
		justify-content: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.invite-layout {
		display: grid;
		grid-template-columns: 360px minmax(0, 1fr);
		gap: 18px;
		align-items: start;
	}

	.form-card,
	.details-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 18px;
		text-align: center;
		background: var(--panel-soft);
	}

	.form-card h3 {
		margin: 0 0 8px;
		letter-spacing: -0.02em;
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

	.field .input {
		width: 100%;
	}

	.field .custom-select {
		width: 100% !important;
		max-width: 100%;
	}

	.field .custom-select-button {
		border-radius: 14px;
	}

	.field .custom-select-popover {
		width: 100% !important;
		max-width: calc(100vw - 64px);
	}

	.user-manage-toolbar {
		justify-content: space-between;
	}

	.manage-user-heading {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.manage-user-heading strong {
		display: block;
	}

	.manage-user-layout {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}

	.admin-chip {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.03);
		cursor: pointer;
	}

	.flag-input {
		display: none;
	}

	.flag-switch {
		width: 38px;
		height: 22px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.08);
		position: relative;
		flex: 0 0 auto;
		transition: background 140ms ease;
	}

	.flag-switch::after {
		content: '';
		position: absolute;
		width: 16px;
		height: 16px;
		top: 2px;
		left: 2px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.85);
		transition: transform 140ms ease;
	}

	.flag-input:checked + .flag-switch {
		background: rgba(52, 211, 153, 0.25);
		border-color: rgba(52, 211, 153, 0.32);
	}

	.flag-input:checked + .flag-switch::after {
		transform: translateX(16px);
	}

	.flag-copy strong,
	.flag-copy small {
		display: block;
	}

	.flag-copy small {
		color: var(--muted);
		font-size: 0.8rem;
	}

	.dnd-access-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.dnd-column {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 12px;
		background: var(--panel-soft);
		min-height: 420px;
	}

	.dnd-column-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.dnd-column-header h3 {
		margin: 0;
		font-size: 0.95rem;
	}

	.dnd-column-header span {
		color: var(--muted);
		font-size: 0.82rem;
	}

	.dnd-list {
		display: grid;
		gap: 8px;
		align-content: start;
	}

	.dnd-card {
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 11px;
		background: rgba(255, 255, 255, 0.05);
		text-align: left;
		cursor: grab;
	}

	.dnd-card.granted {
		border-color: rgba(52, 211, 153, 0.28);
		background: rgba(52, 211, 153, 0.12);
	}

	.dnd-card strong,
	.dnd-card span {
		display: block;
	}

	.dnd-card span {
		color: var(--muted);
		font-size: 0.78rem;
		margin-top: 3px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}

	.dnd-card.is-dragging {
		opacity: 0.55;
	}

	.dnd-card:focus-visible {
		outline: 2px solid rgba(96, 165, 250, 0.75);
		outline-offset: 2px;
	}

	.dnd-card.is-saving {
		opacity: 0.5;
		pointer-events: none;
		cursor: progress;
	}

	.save-error {
		margin: 10px 0 0;
		color: #fecdd3;
		font-size: 0.86rem;
	}

	.save-success {
		margin: 10px 0 0;
		color: #86efac;
		font-size: 0.86rem;
	}

	.app-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		text-align: center;
	}

	.app-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 18px;
		background: var(--panel-soft);
		min-height: 180px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
	}

	.app-card h3 {
		margin: 0 0 8px;
		font-size: 1.12rem;
		letter-spacing: -0.025em;
	}

	.endpoint {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		color: #c4b5fd;
		font-size: 0.86rem;
		margin-bottom: 14px;
	}

	.permission-code {
		display: inline-block;
		color: #bfdbfe;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.16);
		border-radius: 8px;
		padding: 4px 7px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.84rem;
		margin-bottom: 16px;
	}

	.mobile-cards {
		display: none;
		gap: 12px;
	}

	.mobile-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 16px;
		background: var(--panel-soft);
	}

	:global(:root[data-theme='light']) .metric,
	:global(:root[data-theme='light']) .primary-button,
	:global(:root[data-theme='light']) .soft-button,
	:global(:root[data-theme='light']) .danger-button,
	:global(:root[data-theme='light']) .icon-button,
	:global(:root[data-theme='light']) .tab-button:hover,
	:global(:root[data-theme='light']) .tab-button.active,
	:global(:root[data-theme='light']) .admin-chip,
	:global(:root[data-theme='light']) .dnd-card,
	:global(:root[data-theme='light']) .pill {
		box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
	}

	.mobile-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
	}

	@media (max-width: 920px) {
		.invite-layout {
			grid-template-columns: 1fr;
		}

		.manage-user-layout,
		.dnd-access-grid {
			grid-template-columns: 1fr;
		}

		.app-grid {
			grid-template-columns: 1fr;
		}

		.status-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 10px;
			margin: 20px auto;
		}

		.metric {
			padding: 14px 10px;
		}

		.metric strong {
			font-size: 1.45rem;
		}

		.desktop-table {
			display: none;
		}

		.invites-table.desktop-table {
			display: block;
			overflow-x: auto;
		}

		.invites-table table {
			min-width: 720px;
		}

		.mobile-cards {
			display: grid;
		}
	}

	@media (max-width: 640px) {
		.status-grid {
			gap: 8px;
		}

		.metric {
			padding: 12px 8px;
		}

		.metric span {
			font-size: 0.75rem;
			margin-bottom: 6px;
		}

		.metric strong {
			font-size: 1.2rem;
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
		}

		th,
		td {
			padding: 13px;
		}
	}
</style>
