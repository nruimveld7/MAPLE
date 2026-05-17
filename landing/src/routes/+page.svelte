<script>
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { ShellTopbar, resolveShellTheme } from '$shell';
	import '$shell/shell.css';

	export let data;

	$: applets = data?.applets ?? [];
	$: catalogDiagnostics = data?.catalogDiagnostics ?? null;

	let gridElement;
	let pageShellElement;
	let headerElement;

	let userMenuOpen = false;
	let themeReady = false;
	let customScrollbarVisible = false;
	let customScrollbarThumbHeight = 0;
	let customScrollbarThumbTop = 0;
	let touchFlippedCardId = null;
	let touchTracking = {
		pointerId: null,
		startX: 0,
		startY: 0,
		dragging: false,
		suppressTapOpen: false
	};

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

	$: userPermissions = new Set(data?.user?.permissions ?? []);

	$: if (data?.user?.isAdmin) {
		userPermissions.add('auth.manage');
	}

	$: currentUser = {
		id: data?.user?.id ?? '',
		email: data?.user?.email ?? '',
		firstName: data?.user?.firstName ?? '',
		lastName: data?.user?.lastName ?? '',
		isAdmin: Boolean(data?.user?.isAdmin),
		isAuthenticated: Boolean(data?.user),
		permissions: userPermissions
	};

	$: visibleApplets = getVisibleApplets(currentUser, applets);
	$: userFullName = getUserFullName(currentUser);
	$: userInitials = getUserInitials(currentUser);

	$: if (browser && themeReady && gridElement && pageShellElement && headerElement) {
		refreshLayout();
	}

	function getUserFullName(user) {
		return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'User';
	}

	function getUserInitials(user) {
		const firstInitial = user?.firstName?.trim()?.[0] ?? '';
		const lastInitial = user?.lastName?.trim()?.[0] ?? '';
		const initials = `${firstInitial}${lastInitial}`.toUpperCase();

		return initials || 'U';
	}

	function userCanAccessApplet(user, applet) {
		if (!user?.isAuthenticated) return false;
		if (applet.publicAccess) return true;
		if (!applet.requiredPermission && !applet.requiredPermission) return false;

		return user.permissions.has(applet.requiredPermission);
	}

	function getVisibleApplets(user, items) {
		return items.filter((applet) => userCanAccessApplet(user, applet) || applet.showWhenLocked);
	}

	function getViewportHeight() {
		if (!browser) return 0;
		return window.visualViewport?.height ?? window.innerHeight;
	}

	function calculateGridDimensions(itemCount) {
		if (itemCount <= 0) return { columns: 1, rows: 1 };

		const viewportRatio = window.innerWidth / Math.max(getViewportHeight(), 1);
		let best = null;

		for (let columns = 1; columns <= itemCount; columns++) {
			for (let rows = 1; rows <= itemCount; rows++) {
				const capacity = columns * rows;
				if (capacity < itemCount) continue;

				const emptySlots = capacity - itemCount;
				const gridRatio = columns / rows;
				const shapePenalty = Math.abs(Math.log(gridRatio / viewportRatio));
				const emptyPenalty = emptySlots * 100;
				const balancePenalty = Math.abs(columns - rows) * 0.12;
				const singleRowPenalty = rows === 1 && itemCount > 3 ? 3 : 0;
				const singleColumnPenalty = columns === 1 && itemCount > 2 ? 3 : 0;
				const score =
					emptyPenalty + shapePenalty + balancePenalty + singleRowPenalty + singleColumnPenalty;

				if (!best || score < best.score) {
					best = { columns, rows, score };
				}
			}
		}

		return best;
	}

	function sizeGridToViewport(itemCount) {
		if (!gridElement || !pageShellElement || !headerElement) return;

		const { columns, rows } = calculateGridDimensions(itemCount);

		const pageStyle = getComputedStyle(pageShellElement);
		const shellPaddingX = parseFloat(pageStyle.paddingLeft) * 2;
		const shellPaddingY = parseFloat(pageStyle.paddingTop) + parseFloat(pageStyle.paddingBottom);
		const headerHeight = headerElement.offsetHeight;
		const gap = parseFloat(getComputedStyle(gridElement).gap) || 24;

		const availableWidth = Math.max(window.innerWidth - shellPaddingX, 260);
		const availableHeight = Math.max(getViewportHeight() - headerHeight - shellPaddingY - 48, 220);

		const maxCardWidthByViewport = (availableWidth - gap * (columns - 1)) / columns;
		const maxCardHeightByViewport = (availableHeight - gap * (rows - 1)) / rows;

		const maxCardWidth = 740;
		const minCardWidth = Math.min(150, availableWidth);
		const aspectRatio = 4 / 3;

		let cardWidth = Math.min(
			maxCardWidth,
			maxCardWidthByViewport,
			maxCardHeightByViewport * aspectRatio
		);

		cardWidth = Math.max(minCardWidth, cardWidth);

		const cardHeight = cardWidth / aspectRatio;

		gridElement.style.setProperty('--grid-columns', columns);
		gridElement.style.setProperty('--grid-rows', rows);
		gridElement.style.setProperty('--computed-card-width', `${Math.floor(cardWidth)}px`);
		gridElement.style.setProperty('--computed-card-height', `${Math.floor(cardHeight)}px`);
	}

	function getScrollElement() {
		return document.scrollingElement || document.documentElement;
	}

	function updateCustomScrollbar() {
		const scrollElement = getScrollElement();

		const scrollTop = scrollElement.scrollTop;
		const scrollHeight = scrollElement.scrollHeight;
		const clientHeight = getViewportHeight();
		const canScroll = scrollHeight > clientHeight + 1;

		customScrollbarVisible = canScroll;

		if (!canScroll) {
			customScrollbarThumbHeight = 0;
			customScrollbarThumbTop = 0;
			return;
		}

		const trackInset = 24;
		const trackHeight = Math.max(clientHeight - trackInset * 2, 120);
		const minThumbHeight = 44;
		const thumbHeight = Math.max(minThumbHeight, (clientHeight / scrollHeight) * trackHeight);
		const maxThumbTop = trackHeight - thumbHeight;
		const maxScrollTop = scrollHeight - clientHeight;
		const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTop : 0;

		customScrollbarThumbHeight = thumbHeight;
		customScrollbarThumbTop = thumbTop;
	}

	function refreshLayout() {
		sizeGridToViewport(visibleApplets.length);
		requestAnimationFrame(updateCustomScrollbar);
	}

	function openApplet(applet) {
		if (!userCanAccessApplet(currentUser, applet)) return;
		if (!applet.endpoint || applet.endpoint === '#') return;

		window.location.href = applet.endpoint;
	}

	function handleCardClick(applet, event) {
		if (touchTracking.suppressTapOpen) {
			event.preventDefault();
			touchTracking.suppressTapOpen = false;
			return;
		}

		openApplet(applet);
	}

	function getCardFromPoint(x, y) {
		const element = document.elementFromPoint(x, y);
		return element?.closest?.('.app-card') ?? null;
	}

	function updateTouchFlipFromPoint(x, y) {
		const cardElement = getCardFromPoint(x, y);
		touchFlippedCardId = cardElement?.dataset?.appletId ?? null;
	}

	function handleGridPointerDown(event) {
		if (event.pointerType !== 'touch') return;

		touchTracking = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			dragging: false,
			suppressTapOpen: false
		};

		updateTouchFlipFromPoint(event.clientX, event.clientY);
	}

	function handleGridPointerMove(event) {
		if (event.pointerType !== 'touch' || touchTracking.pointerId !== event.pointerId) return;

		const deltaX = Math.abs(event.clientX - touchTracking.startX);
		const deltaY = Math.abs(event.clientY - touchTracking.startY);
		if (!touchTracking.dragging && (deltaX > 8 || deltaY > 8)) {
			touchTracking.dragging = true;
			touchTracking.suppressTapOpen = true;
		}

		updateTouchFlipFromPoint(event.clientX, event.clientY);
	}

	function resetTouchFlip(pointerId) {
		if (touchTracking.pointerId !== pointerId) return;
		touchFlippedCardId = null;
		touchTracking.pointerId = null;
	}

	function handleGridPointerUp(event) {
		if (event.pointerType !== 'touch') return;
		resetTouchFlip(event.pointerId);
	}

	function handleGridPointerCancel(event) {
		if (event.pointerType !== 'touch') return;
		resetTouchFlip(event.pointerId);
	}

	function toggleUserMenu(event) {
		event.stopPropagation();
		userMenuOpen = !userMenuOpen;
	}

	function closeUserMenu() {
		userMenuOpen = false;
	}

	function handleWindowKeydown(event) {
		if (event.key === 'Escape') {
			closeUserMenu();
		}
	}

	function manageAccount() {
		window.location.href = '/auth/account/';
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
			window.location.href = '/auth/login';
		}
	}

	onMount(() => {
		applyShellTheme();
		const frame = window.requestAnimationFrame(async () => {
			themeReady = true;
			await tick();
			refreshLayout();
		});

		if (catalogDiagnostics && catalogDiagnostics.ok === false) {
		}

		const resize = () => refreshLayout();
		const scroll = () => updateCustomScrollbar();

		window.addEventListener('resize', resize);
		window.addEventListener('scroll', scroll, { passive: true });
		window.visualViewport?.addEventListener('resize', resize);

		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener('resize', resize);
			window.removeEventListener('scroll', scroll);
			window.visualViewport?.removeEventListener('resize', resize);
		};
	});
</script>

<svelte:window on:click={closeUserMenu} on:keydown={handleWindowKeydown} />

<svelte:head>
	<title>Application Selector</title>
</svelte:head>

{#if themeReady}
	<div class="page-shell" bind:this={pageShellElement}>
		<div bind:this={headerElement}>
			<ShellTopbar
				title="Application Selector"
				initials={userInitials}
				isMenuOpen={userMenuOpen}
				userName={userFullName}
				userMeta="Signed in"
				onToggleMenu={toggleUserMenu}
				onManageAccount={manageAccount}
				onLogout={logOut}
			/>
		</div>

		<main>
			{#if catalogDiagnostics && catalogDiagnostics.ok === false}
				<section class="catalog-debug" aria-live="polite">
					<h2>Catalog Load Failed</h2>
					<p>{catalogDiagnostics.message}</p>
					<pre>{JSON.stringify(catalogDiagnostics, null, 2)}</pre>
				</section>
			{/if}

			<section
				class="app-grid"
				bind:this={gridElement}
				aria-label="Available applications"
				on:pointerdown={handleGridPointerDown}
				on:pointermove={handleGridPointerMove}
				on:pointerup={handleGridPointerUp}
				on:pointercancel={handleGridPointerCancel}
			>
				{#each visibleApplets as applet}
					{@const canAccess = userCanAccessApplet(currentUser, applet)}

					<button
						type="button"
						class="app-card"
						class:is-locked={!canAccess}
						class:is-touch-flipped={touchFlippedCardId === applet.id}
						data-applet-id={applet.id}
						aria-label={canAccess ? `Open ${applet.title}` : `${applet.title} is locked`}
						on:click={(event) => handleCardClick(applet, event)}
					>
						<span class="card-inner">
							<span class="card-face card-front">
								<img src={applet.imageUrl} alt={applet.imageAlt} loading="lazy" />
								<span class="front-label">
									<strong>{applet.title}</strong>
								</span>
							</span>

							<span class="card-face card-back">
								<img src={applet.imageUrl} alt="" aria-hidden="true" loading="lazy" />
								<h2>{applet.title}</h2>
							</span>
						</span>
					</button>
				{/each}
			</section>
		</main>
	</div>

	{#if customScrollbarVisible}
		<div class="custom-scrollbar" aria-hidden="true">
			<div
				class="custom-scrollbar-thumb"
				style={`height: ${customScrollbarThumbHeight}px; transform: translateY(${customScrollbarThumbTop}px);`}
			></div>
		</div>
	{/if}
{:else}
	<div class="shell-loader" aria-label="Loading preferences" aria-live="polite">
		<span class="shell-loader-spinner" aria-hidden="true"></span>
	</div>
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html),
	:global(body) {
		width: 100%;
		min-height: 100%;
		margin: 0;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	:global(html::-webkit-scrollbar),
	:global(body::-webkit-scrollbar) {
		width: 0;
		height: 0;
		display: none;
	}

	:global(body) {
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
		color: var(--shell-text);
		overflow-x: hidden;
		overflow-y: auto;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.page-shell {
		--text: var(--shell-text);
		--muted: var(--shell-muted);
		--accent: var(--shell-spotlight-primary);
		--border: var(--shell-border);
		--shadow: var(--shell-shadow);
		--card-back-image-filter: brightness(0.38) blur(2px);
		--card-back-overlay:
			linear-gradient(135deg, rgba(13, 17, 23, 0.6), rgba(13, 17, 23, 0.74));
		--card-back-title: #ffffff;
		--radius: 24px;
		--gap: clamp(1rem, 2.4vw, 2rem);
		--card-max: 740px;

		position: relative;
		z-index: 1;
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr;
		padding: clamp(1.25rem, 3vw, 3rem);
		overflow: visible;
	}

	:global(html[data-theme='light']) .page-shell {
		--card-back-image-filter: brightness(0.72) blur(2px);
		--card-back-overlay:
			linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.32));
		--card-back-title: #0f172a;
	}

	header {
		position: relative;
		z-index: 20;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: clamp(1.5rem, 3vh, 2.5rem);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		min-width: 0;
		min-height: 44px;
		position: relative;
	}

	.user-menu-shell {
		position: relative;
		flex: 0 0 auto;
	}

	.brand-mark {
		border: 0;
		padding: 0;
		cursor: pointer;
		width: 44px;
		height: 44px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, var(--accent), #a855f7);
		box-shadow: 0 12px 36px rgba(88, 166, 255, 0.25);
		font-weight: 800;
		color: white;
		font: inherit;
		transition:
			transform 160ms ease,
			box-shadow 160ms ease,
			filter 160ms ease;
	}

	.brand-mark:hover,
	.brand-mark:focus-visible,
	.brand-mark[aria-expanded='true'] {
		transform: translateY(-1px);
		filter: brightness(1.08);
		box-shadow: 0 16px 44px rgba(88, 166, 255, 0.34);
	}

	.brand-mark:focus-visible {
		outline: 3px solid rgba(88, 166, 255, 0.72);
		outline-offset: 4px;
	}

	.user-menu {
		position: absolute;
		top: calc(100% + 0.8rem);
		left: 0;
		z-index: 100;
		width: min(280px, calc(100vw - 2.5rem));
		border: 1px solid var(--border);
		border-radius: 18px;
		background: rgba(22, 27, 34, 0.94);
		box-shadow: var(--shadow);
		backdrop-filter: blur(16px);
		padding: 0.55rem;
		transform-origin: top left;
		opacity: 0;
		transform: translateY(-6px) scale(0.98);
		pointer-events: none;
		transition:
			opacity 160ms ease,
			transform 160ms ease;
	}

	.user-menu.is-open {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	.user-menu::before {
		content: '';
		position: absolute;
		top: -7px;
		left: 16px;
		width: 14px;
		height: 14px;
		border-left: 1px solid var(--border);
		border-top: 1px solid var(--border);
		background: rgba(22, 27, 34, 0.94);
		transform: rotate(45deg);
	}

	.user-menu-header {
		display: grid;
		gap: 0.2rem;
		padding: 0.75rem 0.8rem 0.65rem;
		text-align: center;
		justify-items: center;
	}

	.user-menu-name {
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 750;
		line-height: 1.2;
	}

	.user-menu-meta {
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.25;
	}

	.user-menu-divider {
		height: 1px;
		background: var(--border);
		margin: 0.35rem;
	}

	.user-menu-item {
		width: 100%;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--text);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
		cursor: pointer;
		text-align: center;
		font: inherit;
		font-size: 0.9rem;
		text-decoration: none;
	}

	.user-menu-item:hover,
	.user-menu-item:focus-visible {
		background: rgba(88, 166, 255, 0.12);
		outline: none;
	}

	.user-menu-item.is-danger {
		color: #ffb4b4;
	}

	.user-menu-item.is-danger:hover,
	.user-menu-item.is-danger:focus-visible {
		background: rgba(248, 81, 73, 0.14);
	}

	h1 {
		margin: 0;
		font-size: clamp(1.35rem, 2.4vw, 2.4rem);
		letter-spacing: -0.045em;
	}

	main {
		position: relative;
		z-index: 10;
		display: grid;
		place-items: center;
		width: 100%;
		min-height: 0;
		overflow: visible;
		gap: 1rem;
	}

	.catalog-debug {
		width: min(1100px, 100%);
		background: rgba(248, 81, 73, 0.14);
		border: 1px solid rgba(248, 81, 73, 0.5);
		border-radius: 14px;
		padding: 1rem;
		color: #ffd8d5;
	}

	.catalog-debug h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
	}

	.catalog-debug p {
		margin: 0 0 0.75rem 0;
	}

	.catalog-debug pre {
		margin: 0;
		max-height: 320px;
		overflow: auto;
		padding: 0.8rem;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.3);
		color: #fff2f1;
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.app-grid {
		--grid-columns: 2;
		--grid-rows: 2;
		--computed-card-width: 740px;
		--computed-card-height: 555px;

		position: relative;
		z-index: 10;
		width: min(
			100%,
			calc(
				(var(--computed-card-width) * var(--grid-columns)) +
					(var(--gap) * (var(--grid-columns) - 1))
			)
		);
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), var(--computed-card-width));
		grid-template-rows: repeat(var(--grid-rows), var(--computed-card-height));
		gap: var(--gap);
		justify-content: center;
		align-content: center;
		align-items: stretch;
		overflow: visible;
	}

	.app-card {
		position: relative;
		z-index: 1;
		width: var(--computed-card-width);
		height: var(--computed-card-height);
		max-width: var(--card-max);
		max-height: 720px;
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
		perspective: 1200px;
		text-align: left;
		color: inherit;
		overflow: visible;
	}

	.app-card:hover,
	.app-card:focus-visible {
		z-index: 1000;
	}

	.app-card.is-locked {
		cursor: not-allowed;
		opacity: 0.68;
		filter: grayscale(0.35);
	}

	.app-card.is-locked .card-front::before {
		content: 'Locked';
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 2;
		border: 1px solid rgba(255, 255, 255, 0.22);
		background: rgba(13, 17, 23, 0.72);
		color: white;
		border-radius: 999px;
		padding: 0.4rem 0.65rem;
		font-size: 0.78rem;
		font-weight: 700;
		backdrop-filter: blur(10px);
	}

	.app-card:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 6px;
		border-radius: var(--radius);
	}

	.card-inner {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
		-webkit-transform-style: preserve-3d;
		transition: transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
		overflow: visible;
	}

	.app-card:hover .card-inner,
	.app-card:focus-visible .card-inner,
	.app-card.is-touch-flipped .card-inner {
		z-index: 1000;
		transform: rotateY(180deg);
	}

	.card-face {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: grid;
		overflow: hidden;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		background: #161b22;
		transform: translateZ(0);
		will-change: transform;
	}

	.card-front::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(to top, rgba(13, 17, 23, 0.62), transparent 52%),
			linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 38%);
		pointer-events: none;
	}

	.card-front img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform: scale(1.015);
		transition: transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.app-card:hover .card-front img,
	.app-card:focus-visible .card-front img {
		transform: scale(1.075);
	}

	.front-label {
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		z-index: 1;
		color: white;
		text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
	}

	.front-label strong {
		font-size: clamp(1rem, 1.6vw, 1.25rem);
		letter-spacing: -0.02em;
	}

	.card-back {
		transform: rotateY(180deg) translateZ(0);
		padding: clamp(1rem, 2.2vw, 1.5rem);
		place-items: center;
		text-align: center;
		position: relative;
	}

	.card-back img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: var(--card-back-image-filter);
		transform: scale(1.04);
		z-index: 0;
	}

	.card-back::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--card-back-overlay);
		z-index: 1;
	}

	.card-back h2 {
		position: relative;
		z-index: 2;
		margin: 0;
		color: var(--card-back-title);
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
		font-size: clamp(1.35rem, 2.2vw, 2rem);
		letter-spacing: -0.045em;
	}

	.custom-scrollbar {
		position: fixed;
		top: 24px;
		right: 18px;
		bottom: 24px;
		z-index: 2000;
		width: 0.35rem;
		border-radius: 999px;
		background: rgba(240, 246, 252, 0.08);
		pointer-events: none;
	}

	.custom-scrollbar-thumb {
		width: 100%;
		border-radius: inherit;
		background: rgba(240, 246, 252, 0.34);
		box-shadow: 0 0 18px rgba(88, 166, 255, 0.2);
	}

	@media (max-width: 680px) {
		header {
			align-items: flex-start;
			flex-direction: column;
		}

		.app-grid {
			grid-template-columns: repeat(var(--grid-columns), var(--computed-card-width));
			grid-template-rows: repeat(var(--grid-rows), var(--computed-card-height));
		}

		.app-card {
			width: var(--computed-card-width);
			height: var(--computed-card-height);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card-inner,
		.card-front img {
			transition: none;
		}

		.app-card:hover .card-inner,
		.app-card:focus-visible .card-inner {
			transform: none;
		}

		.card-back {
			transform: none;
			opacity: 0;
			transition: none;
		}

		.app-card:hover .card-back,
		.app-card:focus-visible .card-back {
			opacity: 1;
		}
	}
</style>
