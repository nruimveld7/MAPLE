<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
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

	$: currentUserId = user?.id ?? '';

	let viewOwnerId = currentUserId;
	let modal = null;
	let draggedItemId = null;
	let dragOverItemId = null;

	let users = data?.xmasState?.users ?? [];

	let shares = data?.xmasState?.shares ?? [];

	let items = data?.xmasState?.items ?? [];

	let claims = data?.xmasState?.claims ?? [];

	let previews = {};
	let toasts = [];
	let previewLoadState = {};
	let previewDebounceTimer = null;
	let previewRequestSeq = 0;

	$: currentOwner = userById(viewOwnerId);
	$: isMine = viewOwnerId === currentUserId;
	$: visibleItems = items
		.filter((item) => item.ownerId === viewOwnerId)
		.sort((a, b) => a.order - b.order);
	$: visibleOrderSignature = visibleItems.map((item) => `${item.id}:${item.order}`).join('|');
	$: shareActiveByUserId = new Map(
		shares
			.filter((share) => share.ownerId === currentUserId)
			.map((share) => [share.userId, share.active])
	);
	$: claimBubbles = buildClaimBubbles(modal, items, claims);
	$: claimStateByItemId = buildClaimStateByItemId(visibleItems, claims, currentUserId);
	$: shareCandidates = users.filter((entry) => entry.id !== currentUserId);
	$: sharedRows = buildSharedWithMeRows(shares, claims, items, users, currentUserId);
	$: activeModalItem = modal?.itemId ? items.find((item) => item.id === modal.itemId) ?? null : null;
	$: activeModalOwner = activeModalItem ? users.find((entry) => entry.id === activeModalItem.ownerId) ?? null : null;
	$: pageTitle = isMine ? 'My Christmas List' : `${currentOwner?.name?.split(' ')?.[0] ?? 'Shared'}’s List`;
	$: if (!viewOwnerId && currentUserId) {
		viewOwnerId = currentUserId;
	}

	let persistDebounceTimer = null;
	let persistInFlight = false;
	let hasHydrated = false;
	$: itemSignature = items.map((item) => `${item.id}:${item.ownerId}:${item.label}:${item.url}:${item.quantity}:${item.order}`).join('|');
	$: shareSignature = shares.map((share) => `${share.ownerId}:${share.userId}:${share.active ? 1 : 0}`).join('|');
	$: claimSignature = claims.map((claim) => `${claim.itemId}:${claim.userId}:${claim.quantity}`).join('|');

	$: if (browser && hasHydrated && currentUserId) {
		itemSignature;
		shareSignature;
		claimSignature;
		schedulePersistState();
	}

	function schedulePersistState() {
		if (persistDebounceTimer) window.clearTimeout(persistDebounceTimer);
		persistDebounceTimer = window.setTimeout(() => {
			void persistState();
		}, 250);
	}

	async function persistState() {
		if (persistInFlight || !currentUserId) return;
		persistInFlight = true;
		try {
			await fetch('./api/state', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: items.filter((item) => item.ownerId === currentUserId),
					shares: shares.filter((share) => share.ownerId === currentUserId),
					claims
				})
			});
		} catch {
			toast('Unable to save changes right now', 'error');
		} finally {
			persistInFlight = false;
		}
	}

	async function sendNotification(payload) {
		try {
			await fetch('./api/notify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
		} catch {
			toast('Notification could not be sent', 'error');
		}
	}

	function parseCssColorToRgb(colorValue) {
		if (!browser) return null;
		const probe = document.createElement('span');
		probe.style.color = colorValue;
		document.body.appendChild(probe);
		const resolved = getComputedStyle(probe).color;
		probe.remove();

		const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
		if (!match) return null;
		return {
			r: Number(match[1]),
			g: Number(match[2]),
			b: Number(match[3])
		};
	}

	function srgbToLinear(channel) {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	}

	function relativeLuminance({ r, g, b }) {
		const R = srgbToLinear(r);
		const G = srgbToLinear(g);
		const B = srgbToLinear(b);
		return 0.2126 * R + 0.7152 * G + 0.0722 * B;
	}

	function contrastRatio(colorA, colorB) {
		const lumA = relativeLuminance(colorA);
		const lumB = relativeLuminance(colorB);
		const lighter = Math.max(lumA, lumB);
		const darker = Math.min(lumA, lumB);
		return (lighter + 0.05) / (darker + 0.05);
	}

	function pickOnColor(backgroundColor) {
		const bg = parseCssColorToRgb(backgroundColor);
		if (!bg) return '#ffffff';
		const white = { r: 255, g: 255, b: 255 };
		const black = { r: 0, g: 0, b: 0 };
		const whiteContrast = contrastRatio(bg, white);
		const blackContrast = contrastRatio(bg, black);
		return blackContrast >= whiteContrast ? '#111111' : '#ffffff';
	}

	function applyShellTheme() {
		if (!browser) return;
		document.documentElement.dataset.theme = theme.mode;
		document.documentElement.style.setProperty('--shell-spotlight-primary', theme.primary);
		document.documentElement.style.setProperty('--shell-spotlight-secondary', theme.secondary);
		document.documentElement.style.setProperty('--xmas-on-primary', pickOnColor(theme.primary));
		document.documentElement.style.setProperty('--xmas-on-secondary', pickOnColor(theme.secondary));
	}

	$: applyShellTheme();

	onMount(() => {
		applyShellTheme();
		const frame = window.requestAnimationFrame(() => {
			themeReady = true;
			hasHydrated = true;
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

	function userById(id) {
		return users.find((entry) => entry.id === id);
	}

	function ownerItems(ownerId) {
		return items.filter((item) => item.ownerId === ownerId).sort((a, b) => a.order - b.order);
	}

	function itemClaims(itemId) {
		return claims.filter((claim) => claim.itemId === itemId);
	}

	function myClaim(itemId) {
		return claims.find((claim) => claim.itemId === itemId && claim.userId === currentUserId);
	}

	function totalClaimed(itemId) {
		return itemClaims(itemId).reduce((sum, claim) => sum + claim.quantity, 0);
	}

	function uid() {
		return `id${Math.random().toString(36).slice(2, 9)}`;
	}

	function formatQuantity(quantity) {
		return `Quantity: ${quantity}`;
	}

	function getPreview(url, previewMap = previews) {
		if (!url) return null;
		const normalizedUrl = normalizeUrl(url);
		if (normalizedUrl && previewMap[normalizedUrl]) return previewMap[normalizedUrl];
		return previewMap[url] ?? makeFallbackPreview(url);
	}

	function previewArtValue(preview) {
		const image = preview?.image || '';
		if (/^https?:\/\//i.test(image)) {
			return 'url("' + image.split('"').join('%22') + '")';
		}
		return image || 'linear-gradient(135deg,#e1efe6,#fff0c9)';
	}

	function normalizeUrl(rawUrl) {
		const value = rawUrl?.trim();
		if (!value) return '';
		try {
			return new URL(value).toString();
		} catch {
			return '';
		}
	}

	function looksLikeResolvableUrl(rawUrl) {
		const value = rawUrl?.trim() || '';
		if (!value) return false;
		if (/^https?:\/\//i.test(value)) return true;
		return false;
	}

	async function fetchPreviewForUrl(rawUrl, requestId = null) {
		const normalizedUrl = normalizeUrl(rawUrl);
		const id = requestId ?? ++previewRequestSeq;
		console.log('[preview-trace] fetch:enter', { id, rawUrl: String(rawUrl ?? ''), normalizedUrl });

		if (!looksLikeResolvableUrl(rawUrl)) {
			console.log('[preview-trace] fetch:skip-not-resolvable', { id, rawUrl: String(rawUrl ?? ''), normalizedUrl });
			if (normalizedUrl) setPreviewStatus(normalizedUrl, 'idle', 'skip-not-resolvable', id);
			return;
		}

		if (!normalizedUrl) {
			console.log('[preview-trace] fetch:skip-invalid-format', { id, rawUrl: String(rawUrl ?? '') });
			return;
		}

		const cachedPreview = previews[normalizedUrl];
		if (cachedPreview && !isFallbackPreviewEntry(cachedPreview)) {
			console.log('[preview-trace] fetch:skip-cached', { id, normalizedUrl });
			setPreviewStatus(normalizedUrl, 'loaded', 'skip-cached', id);
			return;
		}

		if (previewLoadState[normalizedUrl] === 'loading') {
			console.log('[preview-trace] fetch:skip-already-loading', { id, normalizedUrl });
			return;
		}

		setPreviewStatus(normalizedUrl, 'loading', 'fetch-start', id);
		const endpoint = `./api/link-preview?url=${encodeURIComponent(normalizedUrl)}`;
		console.log('[preview-trace] fetch:request', { id, normalizedUrl, endpoint });

		try {
			const response = await fetch(endpoint);
			const payload = await response.json().catch(() => null);
			console.log('[preview-trace] fetch:response', { id, normalizedUrl, status: response.status, ok: response.ok, hasPayload: Boolean(payload) });

			if (!response.ok) {
				throw new Error(payload?.error || 'Preview request failed');
			}

			if (!payload?.title && !payload?.description && !payload?.image) {
				throw new Error('No preview metadata');
			}

			previews = {
				...previews,
				[normalizedUrl]: {
					title: payload.title || makeFallbackPreview(normalizedUrl).title,
					site: payload.site || makeFallbackPreview(normalizedUrl).site,
					description: payload.description || 'Link preview',
					image: payload.image || makeFallbackPreview(normalizedUrl).image
				}
			};
			setPreviewStatus(normalizedUrl, 'loaded', 'fetch-success', id);
			console.log('[preview-trace] fetch:success', { id, normalizedUrl });
		} catch (error) {
			console.error('[preview-trace] fetch:fail', { id, normalizedUrl, message: error?.message });
			previews = {
				...previews,
				[normalizedUrl]: makeFallbackPreview(normalizedUrl)
			};
			setPreviewStatus(normalizedUrl, 'failed', 'fetch-fail', id);
		}
	}

	function schedulePreviewFetch(rawUrl) {
		if (previewDebounceTimer) window.clearTimeout(previewDebounceTimer);

		const id = ++previewRequestSeq;
		const normalizedUrl = normalizeUrl(rawUrl);
		console.log('[preview-trace] schedule', { id, rawUrl: String(rawUrl ?? ''), normalizedUrl });

		if (looksLikeResolvableUrl(rawUrl) && normalizedUrl) {
			const cachedPreview = previews[normalizedUrl];
			if (cachedPreview && !isFallbackPreviewEntry(cachedPreview)) {
				setPreviewStatus(normalizedUrl, 'loaded', 'schedule-cached', id);
			} else {
				setPreviewStatus(normalizedUrl, 'queued', 'schedule-queued', id);
			}
		}

		previewDebounceTimer = window.setTimeout(() => {
			console.log('[preview-trace] timer-fired', { id, normalizedUrl });
			fetchPreviewForUrl(rawUrl, id);
		}, 350);
	}

	function makeFallbackPreview(url) {
		let host = url;
		try {
			host = new URL(url).host;
		} catch {
			host = url;
		}

		return {
			title: host,
			site: host,
			description: 'Link preview',
			image: 'linear-gradient(135deg,#e1efe6,#fff0c9)'
		};
	}

	function isFallbackPreviewEntry(preview) {
		if (!preview) return true;
		const fallbackImage = 'linear-gradient(135deg,#e1efe6,#fff0c9)';
		const looksLikeFallbackDescription = preview.description === 'Link preview';
		const looksLikeFallbackImage = preview.image === fallbackImage;
		return looksLikeFallbackDescription && looksLikeFallbackImage;
	}

	function previewStatusForUrl(url, state = previewLoadState) {
		const normalizedUrl = normalizeUrl(url);
		if (!normalizedUrl) return 'idle';
		return state[normalizedUrl] || 'idle';
	}

	function isPreviewLoading(url, state = previewLoadState) {
		const status = previewStatusForUrl(url, state);
		return status === 'queued' || status === 'loading';
	}

	function setPreviewStatus(url, status, reason = 'unknown', requestId = null) {
		const normalizedUrl = normalizeUrl(url);
		if (!normalizedUrl) return;
		const previous = previewLoadState[normalizedUrl] || 'idle';
		previewLoadState = { ...previewLoadState, [normalizedUrl]: status };
		console.log('[preview-trace] status', { requestId, normalizedUrl, previous, next: status, reason });
	}

	function shouldResolvePreviewOnRender(url, state = previewLoadState, previewMap = previews) {
		const normalizedUrl = normalizeUrl(url);
		if (!normalizedUrl) return false;

		const status = state[normalizedUrl] || 'idle';
		if (status === 'queued' || status === 'loading' || status === 'loaded') return false;

		const cached = previewMap[normalizedUrl] || previewMap[url];
		if (cached && !isFallbackPreviewEntry(cached)) return false;

		return true;
	}

	function requestPreviewResolution(url, reason = 'render') {
		if (!looksLikeResolvableUrl(url)) return;
		const normalizedUrl = normalizeUrl(url);
		if (!normalizedUrl) return;
		if (!shouldResolvePreviewOnRender(normalizedUrl, previewLoadState, previews)) return;

		const id = ++previewRequestSeq;
		setPreviewStatus(normalizedUrl, 'queued', `${reason}-queued`, id);
		fetchPreviewForUrl(normalizedUrl, id);
	}

	$: if (browser) {
		for (const item of visibleItems) {
			if (item.url) requestPreviewResolution(item.url, 'render-visible-list');
		}
	}

	function buildClaimStateByItemId(visibleItemsState, claimsState, viewerUserId) {
		return new Map(
			visibleItemsState.map((item) => {
				const mineQty =
					claimsState.find((claim) => claim.itemId === item.id && claim.userId === viewerUserId)
						?.quantity ?? 0;
				const total = claimsState
					.filter((claim) => claim.itemId === item.id)
					.reduce((sum, claim) => sum + claim.quantity, 0);
				const remaining = Math.max(0, item.quantity - total);
				const hasConflict = total > item.quantity;

				let text = '';
				let disabled = false;
				let primary = false;

				if (item.quantity === 1) {
					if (mineQty > 0) {
						text = 'Claimed';
					} else if (remaining > 0) {
						text = 'Claim';
						primary = true;
					} else {
						text = 'Claimed';
						disabled = true;
					}
				} else if (mineQty > 0) {
					const otherClaimed = total - mineQty;
					const denominator = Math.max(0, item.quantity - otherClaimed);
					text = `Claimed: ${mineQty}/${denominator}`;
				} else if (remaining > 0) {
					text = `Available: ${remaining}`;
					primary = true;
				} else {
					text = 'All Claimed';
					disabled = true;
				}

				return [item.id, { text, disabled, primary, hasConflict }];
			})
		);
	}


	function openAddItemModal() {
		modal = {
			type: 'item',
			mode: 'create',
			draft: {
				id: uid(),
				ownerId: currentUserId,
				label: '',
				url: '',
				quantity: 1,
				order: ownerItems(currentUserId).length + 1
			}
		};
	}

	function openEditItemModal(item) {
		if (item.ownerId !== currentUserId) {
			openInspectItemModal(item);
			return;
		}

		modal = {
			type: 'item',
			mode: 'edit',
			draft: { ...item }
		};
	}

	function openInspectItemModal(item) {
		modal = {
			type: 'inspect',
			itemId: item.id
		};
	}

	function updateDraftField(field, value) {
		if (!modal?.draft) return;

		let nextValue = value;
		if (field === 'quantity') {
			nextValue = Math.max(1, parseInt(value, 10) || 1);
		}

		modal = {
			...modal,
			draft: {
				...modal.draft,
				[field]: nextValue
			}
		};

		if (field === 'url') {
			schedulePreviewFetch(nextValue);
		}
	}

	function saveItem() {
		if (!modal?.draft) return;

		const label = modal.draft.label.trim();
		const url = modal.draft.url.trim();
		const normalizedUrl = normalizeUrl(url) || url;
		const quantity = Math.max(1, parseInt(modal.draft.quantity, 10) || 1);

		if (!label) {
			toast('Item needs a name', 'error');
			return;
		}

		if (normalizedUrl) {
			fetchPreviewForUrl(normalizedUrl);
		}

		if (modal.mode === 'edit') {
			const existingItem = items.find((item) => item.id === modal.draft.id);
			if (!existingItem || existingItem.ownerId !== currentUserId) {
				closeModal();
				toast('You can only edit your own items', 'error');
				return;
			}

			items = items.map((item) =>
				item.id === modal.draft.id ? { ...item, label, url: normalizedUrl, quantity } : item
			);
			toast('Item updated');
		} else {
			items = [
				...items,
				{
					...modal.draft,
					label,
					url: normalizedUrl,
					quantity,
					order: ownerItems(currentUserId).length + 1
				}
			];
			toast('Item added');
		}

		closeModal();
	}

	function openDeleteModal(itemId) {
		const item = items.find((entry) => entry.id === itemId);
		if (!item || item.ownerId !== currentUserId) {
			closeModal();
			toast('You can only delete your own items', 'error');
			return;
		}

		modal = {
			type: 'delete',
			itemId
		};
	}

	function deleteItem(itemId) {
		const item = items.find((entry) => entry.id === itemId);
		if (!item || item.ownerId !== currentUserId) {
			closeModal();
			toast('You can only delete your own items', 'error');
			return;
		}

		items = items.filter((entry) => entry.id !== itemId);
		claims = claims.filter((claim) => claim.itemId !== itemId);
		closeModal();
		toast('Item removed');
	}

	function openShareModal() {
		modal = { type: 'share' };
	}

	async function toggleShare(userId) {
		const existing = shares.find(
			(share) => share.ownerId === currentUserId && share.userId === userId
		);

		if (!existing) {
			shares = [...shares, { ownerId: currentUserId, userId, active: true }];
			await sendNotification({ type: 'share', userId });
			toast('Share email sent');
			return;
		}

		shares = shares.map((share) =>
			share.ownerId === currentUserId && share.userId === userId
				? { ...share, active: !share.active }
				: share
		);

		if (!existing.active) {
			await sendNotification({ type: 'share', userId });
		}

		toast(existing.active ? 'Access removed' : 'Share email sent');
	}

	function openSharedWithMeModal() {
		modal = { type: 'shared' };
	}

	function buildSharedWithMeRows(sharesState, claimsState, itemsState, usersState, viewerUserId) {
		return sharesState
			.filter((share) => share.userId === viewerUserId)
			.map((share) => {
				const owner = usersState.find((entry) => entry.id === share.ownerId);
				const ownerItemIds = itemsState
					.filter((item) => item.ownerId === share.ownerId)
					.map((item) => item.id);
				const hasClaims = claimsState.some(
					(claim) => claim.userId === viewerUserId && ownerItemIds.includes(claim.itemId)
				);

				if (!share.active && !hasClaims) return null;

				return {
					...share,
					owner,
					hasClaims
				};
			})
			.filter(Boolean);
	}

	function viewSharedList(ownerId) {
		viewOwnerId = ownerId;
		closeModal();
	}

	function returnToMyList() {
		viewOwnerId = currentUserId;
	}

	function openDisclaimAllModal(ownerId) {
		modal = { type: 'disclaimAll', ownerId };
	}

	function disclaimAll(ownerId) {
		const ids = ownerItems(ownerId).map((item) => item.id);
		claims = claims.filter(
			(claim) => !(claim.userId === currentUserId && ids.includes(claim.itemId))
		);

		closeModal();
		toast('Claims removed');
	}

	function handleClaimClick(item) {
		if (item.quantity === 1) {
			toggleSingleClaim(item.id);
			return;
		}

		openClaimModal(item.id);
	}

	function toggleSingleClaim(itemId) {
		const claim = myClaim(itemId);

		if (claim) {
			claims = claims.filter((entry) => entry !== claim);
			toast('Claim removed');
		} else {
			claims = [...claims, { itemId, userId: currentUserId, quantity: 1 }];
			toast('Item claimed');
		}
	}

	function claimModel(itemId) {
		const item = items.find((entry) => entry.id === itemId);
		const mine = myClaim(itemId)?.quantity ?? 0;
		const total = totalClaimed(itemId);
		const other = total - mine;
		const remaining = Math.max(0, item.quantity - total);
		const overflow = Math.max(0, total - item.quantity);

		return {
			item,
			mine,
			other,
			total,
			remaining,
			overflow,
			maxMine: mine + remaining
		};
	}

	function openClaimModal(itemId) {
		const model = claimModel(itemId);
		const selected = [];

		for (let index = 0; index < model.mine; index += 1) {
			selected.push(model.other + index);
		}

		modal = {
			type: 'claim',
			itemId,
			selected
		};
	}

	function buildClaimBubbles(modalState, itemsState, claimsState) {
		if (modalState?.type !== 'claim') return [];

		const item = itemsState.find((entry) => entry.id === modalState.itemId);
		if (!item) return [];

		const mine =
			claimsState.find(
				(claim) => claim.itemId === modalState.itemId && claim.userId === currentUserId
			)?.quantity ?? 0;
		const total = claimsState
			.filter((claim) => claim.itemId === modalState.itemId)
			.reduce((sum, claim) => sum + claim.quantity, 0);
		const other = total - mine;

		const selected = new Set(modalState.selected ?? []);
		const selectedCount = selected.size;
		const visibleCount = Math.max(item.quantity, other + selectedCount, total);

		return Array.from({ length: visibleCount }, (_, index) => {
			const isOther = index < other;
			const isMine = selected.has(index);
			const isOverflow = index >= item.quantity;

			return {
				index,
				isOther,
				isMine,
				isOverflow,
				className: [
					isOther ? 'other' : '',
					isMine ? 'mine' : '',
					isMine && isOverflow ? 'conflict warn' : '',
					!isMine && isOverflow ? 'other warn' : ''
				]
					.filter(Boolean)
					.join(' '),
				disabled: isOther,
				label: isMine ? '✓' : ''
			};
		});
	}

	function toggleBubble(index) {
		if (modal?.type !== 'claim') return;

		const model = claimModel(modal.itemId);
		if (index < model.other) return;

		const selected = new Set(modal.selected);

		if (selected.has(index)) {
			const isClickedConflict = index >= model.item.quantity;
			const conflictingMine = Array.from(selected)
				.filter((selectedIndex) => selectedIndex >= model.item.quantity)
				.sort((a, b) => b - a);

			if (!isClickedConflict && conflictingMine.length > 0) {
				// Preserve non-conflicting selections: remove a conflicting claim first.
				selected.delete(conflictingMine[0]);
			} else {
				selected.delete(index);
			}

			toast('Claim removed');
		} else {
			const availableCount = Math.max(0, model.item.quantity - model.other - selected.size);
			if (availableCount <= 0) return;
			selected.add(index);
			toast('Item claimed');
		}

		const nextSelected = Array.from(selected).sort((a, b) => a - b);
		setMyClaimQuantity(modal.itemId, nextSelected.length);

		modal = {
			...modal,
			selected: nextSelected
		};
	}

	function setMyClaimQuantity(itemId, quantity) {
		const safeQuantity = Math.max(0, quantity);
		const existing = myClaim(itemId);

		if (!safeQuantity) {
			claims = claims.filter((claim) => claim !== existing);
			return;
		}

		if (existing) {
			claims = claims.map((claim) =>
				claim === existing ? { ...claim, quantity: safeQuantity } : claim
			);
		} else {
			claims = [...claims, { itemId, userId: currentUserId, quantity: safeQuantity }];
		}
	}

	function openFlagModal(itemId) {
		const item = items.find((entry) => entry.id === itemId);
		if (!item || item.ownerId === currentUserId) return;

		modal = {
			type: 'flag',
			itemId,
			message: ''
		};
	}

	function updateFlagMessage(value) {
		if (modal?.type !== 'flag') return;
		modal = {
			...modal,
			message: value
		};
	}

	async function sendFlagAlert() {
		if (modal?.type !== 'flag') return;

		const item = items.find((entry) => entry.id === modal.itemId);
		if (!item || item.ownerId === currentUserId) return;

		const message = modal.message.trim();
		if (!message) {
			toast('Please add a message', 'error');
			return;
		}

		const owner = userById(item.ownerId);
		await sendNotification({
			type: 'flag',
			itemId: item.id,
			message
		});
		closeModal();
		toast(`Alert sent to ${owner?.name?.split(' ')?.[0] ?? 'the owner'}`, 'sent');
	}

	function onLinkDrop(event) {
		event.preventDefault();

		if (!modal?.draft) return;

		const transfer = event.dataTransfer;
		const raw =
			transfer.getData('text/uri-list') ||
			transfer.getData('text/plain') ||
			transfer.getData('text/html');

		const url = extractFirstUrl(raw.trim()) || raw.trim();
		if (!url) return;

		updateDraftField('url', url);
		fetchPreviewForUrl(url);
		toast('Link added');
	}

	function extractFirstUrl(text) {
		const match = text.match(/https?:\/\/[^\s"']+/i);
		return match ? match[0] : '';
	}

	function startDrag(event, itemId) {
		if (!isMine) return;
		draggedItemId = itemId;
		dragOverItemId = null;
		const transfer = event.dataTransfer;
		transfer.effectAllowed = 'move';
		transfer.setData('text/plain', itemId);
		console.log(
		);

		// Use the whole card as the drag preview instead of just the handle.
		const card = event.currentTarget?.closest('.item-card');
		if (card) {
			const rect = card.getBoundingClientRect();
			const pointerX = event.clientX - rect.left;
			const pointerY = event.clientY - rect.top;
			transfer.setDragImage(card, pointerX, pointerY);
		}
	}

	function dragOver(event, itemId) {
		if (!draggedItemId || draggedItemId === itemId) return;
		event.preventDefault();
		dragOverItemId = itemId;
	}

	function dropItem(event, targetItemId) {
		event.preventDefault();

		const sourceItemId = event.dataTransfer.getData('text/plain') || draggedItemId;
		const resolvedTargetItemId =
			dragOverItemId && dragOverItemId !== sourceItemId ? dragOverItemId : targetItemId;
		console.log(
		);

		if (!sourceItemId || sourceItemId === resolvedTargetItemId) {
			console.log(
			);
			draggedItemId = null;
			dragOverItemId = null;
			return;
		}

		const currentItems = ownerItems(currentUserId);
		const from = currentItems.findIndex((item) => item.id === sourceItemId);
		const to = currentItems.findIndex((item) => item.id === resolvedTargetItemId);
		console.log(
		);

		if (from < 0 || to < 0) {
			console.log(
			);
			draggedItemId = null;
			dragOverItemId = null;
			return;
		}

		const reordered = [...currentItems];
		const [moved] = reordered.splice(from, 1);
		reordered.splice(to, 0, moved);

		const reorderedOwnedItems = reordered.map((item, index) => ({
			...item,
			order: index + 1
		}));
		console.log(
		);

		const otherItems = items.filter((item) => item.ownerId !== currentUserId);
		items = [...otherItems, ...reorderedOwnedItems];
		console.log(
		);
		draggedItemId = null;
		dragOverItemId = null;
		toast('Order updated');
	}

	function endDrag() {
		draggedItemId = null;
		dragOverItemId = null;
	}

	function closeModal() {
		modal = null;
	}

	function toast(message, type = 'info') {
		const id = uid();

		toasts = [...toasts, { id, message, type }];

		window.setTimeout(() => {
			toasts = toasts.filter((entry) => entry.id !== id);
		}, 2800);
	}

	function toastClass(type) {
		return ['toast', type === 'error' ? 'error' : ''].filter(Boolean).join(' ');
	}

</script>

<svelte:head>
	<title>Christmas Lists</title>
</svelte:head>

<svelte:window
	on:click={closeUserMenu}
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			if (modal) closeModal();
			else closeUserMenu();
		}
	}}
/>

{#if themeReady}
	<main class="page-shell">
		<ShellTopbar
			title="Christmas Lists"
			initials={userInitials}
			isMenuOpen={isUserMenuOpen}
			userName={userFullName}
			userMeta={user?.email ? `Signed in as ${user.email}` : ''}
			onToggleMenu={toggleUserMenu}
			onManageAccount={manageAccount}
			onLogout={logOut}
		/>

		<section class="xmas-app" aria-label="Christmas lists">
			<header class="xmas-topbar">
				<div class="title-block">
					<h1>{pageTitle}</h1>
				</div>

				<div class="actions" aria-label="List actions">
					<button class="btn icon" type="button" aria-label="Shared With Me" title="Shared With Me" on:click={openSharedWithMeModal}>
						<svg class="svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M9.2 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							<path d="M15.8 10.5a3 3 0 1 0 0-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							<path d="M3.8 19.6c.7-3.5 2.8-5.3 5.4-5.3s4.7 1.8 5.4 5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							<path d="M15.2 14.5c2.4.4 4.1 2.1 4.8 5.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
						</svg>
					</button>

					{#if isMine}
						<button class="btn icon" type="button" aria-label="Share" title="Share" on:click={openShareModal}>
							<svg class="svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M8.8 13.3 15.2 17M15.2 7 8.8 10.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
								<path d="M6.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" stroke-width="2" />
							</svg>
						</button>
					{:else}
						<button class="btn icon" type="button" aria-label="My List" title="My List" on:click={returnToMyList}>
							<svg class="svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M9 6.5h10M9 12h10M9 17.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
								<path d="m4 6.5 1.1 1.1L7.2 5.2M4 12l1.1 1.1L7.2 10.7M4 17.5l1.1 1.1 2.1-2.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					{/if}
				</div>
			</header>

			<section class="content">
				{#key visibleOrderSignature}
					<div class="list-wrap">
						{#if visibleItems.length}
						{#each visibleItems as item (item.id)}
							{@const ownItem = item.ownerId === currentUserId && isMine}
							{@const claimState = claimStateByItemId.get(item.id)}
							<article
								class:owner-card={ownItem}
								class:shared-card={!ownItem}
								class:dragging={draggedItemId === item.id}
								class:drag-over-target={dragOverItemId === item.id}
								class="item-card"
								on:click={() => (ownItem ? openEditItemModal(item) : openInspectItemModal(item))}
								on:dragover={(event) => dragOver(event, item.id)}
								on:drop={(event) => dropItem(event, item.id)}
							>
								{#if ownItem}
									<button
										class="drag-handle"
										type="button"
										draggable="true"
										aria-label="Reorder item"
										on:click|stopPropagation
										on:dragstart={(event) => startDrag(event, item.id)}
										on:dragend={endDrag}
									>
										<svg width="18" height="28" viewBox="0 0 18 28" fill="none">
											<path d="M6 6h.01M12 6h.01M6 14h.01M12 14h.01M6 22h.01M12 22h.01" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
										</svg>
									</button>
								{/if}

								<div class="item-main">
									<div class="item-head">
										<div class="item-label">{item.label}</div>
										<div class="item-qty">{formatQuantity(item.quantity)}</div>
									</div>

									<div class="preview-wrap">
										{#if item.url}
											{@const preview = getPreview(item.url, previews)}
											<a
												class:loading={isPreviewLoading(item.url, previewLoadState)}
											class="preview-card"
												href={item.url}
												target="_blank"
												rel="noopener noreferrer"
												style={`--preview-art:${previewArtValue(preview)}`}
												on:click|stopPropagation
											>
												<div class="preview-copy">
													<div class="preview-title">{preview.title}</div>
													<div class="preview-meta">{preview.site} · {preview.description}</div>
												</div>
											{#if isPreviewLoading(item.url, previewLoadState)}
												<div class="preview-spinner" aria-hidden="true"></div>
											{/if}
										</a>
										{:else}
											<div class="preview-card placeholder empty-preview-space" aria-hidden="true"><span class="preview-empty-label">No Link</span></div>
										{/if}

										{#if !ownItem}
											<div class="claim-float">
												<button
													class:primary={claimState.primary}
													class:claim-conflict={claimState.hasConflict}
													class="btn"
													type="button"
													disabled={claimState.disabled}
													on:click|stopPropagation={() => handleClaimClick(item)}
												>
													{claimState.text}
												</button>
											</div>
										{/if}
									</div>
								</div>
							</article>
						{/each}

						{#if isMine}
							<button class="item-card add-card" type="button" aria-label="Add item" style:order={9999} on:click={openAddItemModal}>
								<span class="add-card-rail" aria-hidden="true"></span>
								<span class="add-card-main" aria-hidden="true"></span>
								<span class="add-card-center" aria-hidden="true">
									<svg viewBox="0 0 24 24" fill="none">
										<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
									</svg>
								</span>
							</button>
						{/if}
					{:else if isMine}
						<button class="item-card add-card only-card" type="button" aria-label="Add item" on:click={openAddItemModal}>
							<span class="add-card-center" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
								</svg>
							</span>
						</button>
					{:else}
						<div class="empty-state">
							<div>
								<div class="empty-icon">🎄</div>
								<div class="empty-title">Nothing under this tree yet.</div>
								<div class="empty-sub">Check back once the wish list magic starts.</div>
							</div>
						</div>
						{/if}
					</div>
				{/key}
			</section>
		</section>
	</main>
{:else}
	<div class="shell-loader" aria-label="Loading preferences" aria-live="polite">
		<span class="shell-loader-spinner" aria-hidden="true"></span>
	</div>
{/if}

{#if modal}
	<div class="modal-backdrop show" role="presentation" on:pointerdown={(event) => event.target === event.currentTarget && closeModal()}>
		<section class="modal" role="dialog" aria-modal="true" on:pointerdown|stopPropagation>
			<header class="modal-head">
				<div class="modal-title">
					{#if modal.type === 'item'}
						{modal.mode === 'edit' ? 'Edit Item' : 'Add Item'}
					{:else if modal.type === 'delete'}
						Delete Item
					{:else if modal.type === 'share'}
						Share List
					{:else if modal.type === 'shared'}
						Shared With Me
					{:else if modal.type === 'claim'}
						{claimModel(modal.itemId).item?.label}
					{:else if modal.type === 'inspect'}
						{activeModalItem?.label}
					{:else if modal.type === 'disclaimAll'}
						Disclaim All
					{:else if modal.type === 'flag'}
						Flag Item
					{/if}
				</div>

				<button class="btn icon ghost" type="button" aria-label="Close" on:pointerdown|preventDefault={closeModal}>
					✕
				</button>
			</header>

			<div class="modal-body">
				{#if modal.type === 'item'}
					<div class="field">
						<label for="itemLabel">Item</label>
						<input
							class="input"
							id="itemLabel"
							value={modal.draft.label}
							placeholder="Cozy blanket"
							on:input={(event) => updateDraftField('label', event.currentTarget.value)}
						/>
					</div>

					<div class="input-row">
						<div
							class="field drop-zone"
							on:dragenter|preventDefault
							on:dragover|preventDefault
							on:drop={onLinkDrop}
						>
							<label for="itemUrl">Link</label>
							<input
								class="input"
								id="itemUrl"
								value={modal.draft.url}
								placeholder="Paste or drop a link"
								on:input={(event) => updateDraftField('url', event.currentTarget.value)}
							/>
						</div>

						<div class="field field-shell">
							<label for="itemQty">Quantity</label>
							<input
								class="input"
								id="itemQty"
								type="number"
								min="1"
								value={modal.draft.quantity}
								on:input={(event) => updateDraftField('quantity', event.currentTarget.value)}
							/>
						</div>
					</div>

					{#if modal.draft.url}
						{@const preview = getPreview(modal.draft.url, previews)}
						<a
							class:loading={isPreviewLoading(modal.draft.url, previewLoadState)}
							class="preview-card"
							href={modal.draft.url}
							target="_blank"
							rel="noopener noreferrer"
							style={`--preview-art:${previewArtValue(preview)}`}
						>
							<div class="preview-copy">
								<div class="preview-title">{preview.title}</div>
								<div class="preview-meta">{preview.site} · {preview.description}</div>
							</div>
							{#if isPreviewLoading(modal.draft.url, previewLoadState)}
								<div class="preview-spinner" aria-hidden="true"></div>
							{/if}
						</a>
					{/if}
				{:else if modal.type === 'delete'}
					{@const item = activeModalItem}
					<div>This removes <strong>{item?.label}</strong> from your list.</div>
				{:else if modal.type === 'share'}
					{#each shareCandidates as shareUser (shareUser.id)}
						{@const active = shareActiveByUserId.get(shareUser.id) ?? false}
						<div class="share-row">
							<div>
								<div class="person-name">{shareUser.name}</div>
								<div class="person-sub">{shareUser.email}</div>
							</div>
							<button
								class:on={active}
								class="switch"
								type="button"
								aria-label="Toggle share"
								aria-pressed={active}
								on:click={() => toggleShare(shareUser.id)}
							></button>
						</div>
					{/each}
				{:else if modal.type === 'shared'}
					{@const rows = sharedRows}
					{#if rows.length}
						{#each rows as row (row.ownerId)}
							<div class="shared-row">
								<div>
									<div class="person-name">{row.owner.name}</div>
									<div class="person-sub">{row.active ? 'Shared list' : 'Access revoked'}</div>
								</div>

								{#if row.active}
									<button class="btn primary row-action" type="button" on:click={() => viewSharedList(row.ownerId)}>
										View List
									</button>
								{:else}
									<button
										class="btn danger row-action"
										type="button"
										title="Access to this user’s list has been revoked"
										on:click={() => openDisclaimAllModal(row.ownerId)}
									>
										Disclaim All
									</button>
								{/if}
							</div>
						{/each}
					{:else}
						<div class="empty-state compact">
							<div>
								<div class="empty-icon">🎁</div>
								<div class="empty-title">No shared lists yet.</div>
							</div>
						</div>
					{/if}
				{:else if modal.type === 'claim'}
					<div class="bubble-grid">
						{#each claimBubbles as bubble (bubble.index)}
							<button
								class={`bubble ${bubble.className}`}
								type="button"
								disabled={bubble.disabled}
								aria-label="Claim bubble"
								on:click={() => toggleBubble(bubble.index)}
							>
								{bubble.label}
							</button>
						{/each}
					</div>
				{:else if modal.type === 'inspect'}
					{@const item = activeModalItem}
					{#if item}
						<div class="field">
							<label>Item</label>
							<div class="readonly-value">{item.label}</div>
						</div>

						<div class="input-row">
							<div class="field">
								<label>Link</label>
								<div class="readonly-value muted-value">{item.url || 'No link'}</div>
							</div>
							<div class="field">
								<label>Quantity</label>
								<div class="readonly-value">{item.quantity}</div>
							</div>
						</div>

						{#if item.url}
							{@const preview = getPreview(item.url, previews)}
							<a
								class:loading={isPreviewLoading(item.url, previewLoadState)}
								class="preview-card"
								href={item.url}
								target="_blank"
								rel="noopener noreferrer"
								style={`--preview-art:${previewArtValue(preview)}`}
							>
								<div class="preview-copy">
									<div class="preview-title">{preview.title}</div>
									<div class="preview-meta">{preview.site} · {preview.description}</div>
								</div>
								{#if isPreviewLoading(item.url, previewLoadState)}
									<div class="preview-spinner" aria-hidden="true"></div>
								{/if}
							</a>
						{:else}
							<div class="preview-card placeholder empty-preview-space" aria-hidden="true"><span class="preview-empty-label">No Link</span></div>
						{/if}
					{/if}
				{:else if modal.type === 'disclaimAll'}
					{@const owner = users.find((entry) => entry.id === modal.ownerId)}
					<div>Remove all claims you have on {owner?.name}’s list?</div>
				{:else if modal.type === 'flag'}
					{@const item = activeModalItem}
					{@const owner = activeModalOwner}
					<div class="field">
						<label>Item</label>
						<div class="readonly-value">{item?.label}</div>
					</div>

					<div class="field">
						<label for="flagMessage">Message to {owner?.name?.split(' ')?.[0] ?? 'the owner'}</label>
						<textarea
							class="textarea"
							id="flagMessage"
							placeholder="The link may be broken, the item looks unavailable, or something else seems off."
							value={modal.message}
							on:input={(event) => updateFlagMessage(event.currentTarget.value)}
						></textarea>
					</div>
				{/if}
			</div>

			<footer class="modal-foot">
				{#if modal.type === 'item'}
					{#if modal.mode === 'edit'}
						<button class="btn danger icon footer-left" type="button" aria-label="Remove item" on:click={() => openDeleteModal(modal.draft.id)}>
							<svg class="svg" viewBox="0 0 24 24" fill="none">
								<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					{/if}

					<button class="btn matched-action" type="button" on:click={closeModal}>Cancel</button>
					<button class="btn primary matched-action" type="button" on:click={saveItem}>
						{modal.mode === 'edit' ? 'Save' : 'Create'}
					</button>
				{:else if modal.type === 'delete'}
					<button class="btn" type="button" on:click={closeModal}>Cancel</button>
					<button class="btn danger" type="button" on:click={() => deleteItem(modal.itemId)}>Delete</button>
				{:else if modal.type === 'claim'}
					<button class="btn" type="button" on:click={closeModal}>Done</button>
				{:else if modal.type === 'inspect'}
					{@const item = activeModalItem}
					{#if item?.ownerId !== currentUserId}
						<button class="btn danger icon footer-left" type="button" aria-label="Flag item" title="Flag item" on:click={() => openFlagModal(item.id)}>
							<svg class="svg" viewBox="0 0 24 24" fill="none">
								<path d="M6 21V4.8c0-.5.4-.8.8-.8h9.5c.5 0 .9.4.9.9v7.6c0 .5-.4.9-.9.9H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
								<path d="M17.2 8.8H12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</button>
					{/if}
					<button class="btn primary" type="button" on:click={closeModal}>Done</button>
				{:else if modal.type === 'disclaimAll'}
					<button class="btn" type="button" on:click={closeModal}>Cancel</button>
					<button class="btn danger" type="button" on:click={() => disclaimAll(modal.ownerId)}>Disclaim All</button>
				{:else if modal.type === 'flag'}
					<button class="btn matched-action" type="button" on:click={closeModal}>Cancel</button>
					<button class="btn danger matched-action" type="button" on:click={sendFlagAlert}>Send</button>
				{/if}
			</footer>
		</section>
	</div>
{/if}

<div class="toast-stack" aria-live="polite">
	{#each toasts as entry (entry.id)}
		<div class={toastClass(entry.type)}>
			{#if entry.type === 'sent'}
				<span class="toast-label">Message Sent</span>
				<span class="toast-message">{entry.message}</span>
			{:else}
				{entry.message}
			{/if}
		</div>
	{/each}
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(:root) {
		--xmas-primary: var(--shell-spotlight-primary, #1f7a57);
		--xmas-secondary: var(--shell-spotlight-secondary, #d8a43b);
		--xmas-on-primary: #ffffff;
		--xmas-on-secondary: #172033;
		--green: var(--xmas-primary);
		--green-dark: color-mix(in srgb, var(--xmas-primary) 72%, black 28%);
		--red: #b93d3b;
		--red-dark: #812322;
		--gold: color-mix(in srgb, var(--xmas-secondary) 76%, #d8a43b 24%);
		--gold-soft: color-mix(in srgb, var(--xmas-secondary) 18%, #fff4d8 82%);
		--pine: color-mix(in srgb, var(--xmas-primary) 58%, #0f3a31 42%);
		--radius-lg: 30px;
		--ease: cubic-bezier(0.2, 0.9, 0.2, 1);
	}

	button,
	input,
	textarea {
		font: inherit;
	}


	/* Custom scrollbars: page-level and modal-level */
	:global(html),
	:global(body),
	.modal {
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--xmas-primary) 62%, #ffffff 38%)
			color-mix(in srgb, var(--shell-bg-base) 70%, black 30%);
	}

	:global(html)::-webkit-scrollbar,
	:global(body)::-webkit-scrollbar,
	.modal::-webkit-scrollbar {
		width: 12px;
		height: 12px;
	}

	:global(html)::-webkit-scrollbar-track,
	:global(body)::-webkit-scrollbar-track,
	.modal::-webkit-scrollbar-track {
		background: color-mix(in srgb, var(--shell-bg-base) 70%, black 30%);
		border-radius: 999px;
	}

	:global(html)::-webkit-scrollbar-thumb,
	:global(body)::-webkit-scrollbar-thumb,
	.modal::-webkit-scrollbar-thumb {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--xmas-primary) 66%, white 34%),
			color-mix(in srgb, var(--xmas-secondary) 54%, var(--xmas-primary) 46%)
		);
		border-radius: 999px;
		border: 2px solid color-mix(in srgb, var(--shell-bg-base) 70%, black 30%);
	}

	:global(html)::-webkit-scrollbar-thumb:hover,
	:global(body)::-webkit-scrollbar-thumb:hover,
	.modal::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--xmas-primary) 76%, white 24%),
			color-mix(in srgb, var(--xmas-secondary) 64%, var(--xmas-primary) 36%)
		);
	}

	:global(html)::-webkit-scrollbar-corner,
	:global(body)::-webkit-scrollbar-corner,
	.modal::-webkit-scrollbar-corner {
		background: color-mix(in srgb, var(--shell-bg-base) 70%, black 30%);
	}


	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
	}

	.xmas-app {
		--xmas-panel: color-mix(in srgb, var(--shell-bg-base) 78%, white 22%);
		--xmas-panel-solid: color-mix(in srgb, var(--shell-bg-base) 84%, white 16%);
		--xmas-ink: var(--shell-text);
		--xmas-muted: var(--shell-muted);
		--xmas-line: var(--shell-border);
		--xmas-primary: var(--shell-spotlight-primary, #1f7a57);
		--xmas-secondary: var(--shell-spotlight-secondary, #d8a43b);
		--green: var(--xmas-primary);
		--green-dark: color-mix(in srgb, var(--xmas-primary) 72%, black 28%);
		--red: #b93d3b;
		--red-dark: #812322;
		--gold: color-mix(in srgb, var(--xmas-secondary) 76%, #d8a43b 24%);
		--gold-soft: color-mix(in srgb, var(--xmas-secondary) 18%, #fff4d8 82%);
		--pine: color-mix(in srgb, var(--xmas-primary) 58%, #0f3a31 42%);
		--radius-lg: 30px;
		--ease: cubic-bezier(0.2, 0.9, 0.2, 1);

		width: min(1180px, 100%);
		margin: 0 auto;
		overflow: hidden;
		border: 1px solid var(--shell-border);
		border-radius: 34px;
		background:
			radial-gradient(circle at top left, color-mix(in srgb, var(--xmas-secondary) 16%, transparent), transparent 34rem),
			radial-gradient(circle at 82% 14%, color-mix(in srgb, var(--xmas-primary) 14%, transparent), transparent 30rem),
			color-mix(in srgb, var(--shell-bg-base) 78%, transparent);
		box-shadow: var(--shell-shadow);
		position: relative;
	}

	.xmas-app::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			radial-gradient(circle, rgba(255, 255, 255, 0.55) 0 1.5px, transparent 1.7px),
			radial-gradient(circle, rgba(255, 255, 255, 0.35) 0 1px, transparent 1.2px);
		background-size:
			84px 84px,
			56px 56px;
		background-position:
			4px 8px,
			30px 24px;
		opacity: 0.38;
		mask-image: linear-gradient(to bottom, #000 0%, transparent 38%);
	}

	.xmas-topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 18px 20px;
		border-bottom: 1px solid var(--shell-border);
		background: color-mix(in srgb, var(--shell-bg-base) 82%, transparent);
		backdrop-filter: blur(22px);
	}

	.title-block {
		min-width: 0;
	}

	.title-block h1 {
		margin: 0;
		font-size: clamp(1.28rem, 3vw, 1.85rem);
		line-height: 1.06;
		letter-spacing: -0.045em;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-left: auto;
	}

	.content {
		position: relative;
		z-index: 1;
		padding: 22px;
	}

	.list-wrap {
		--item-column-min: 340px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--item-column-min)), 1fr));
		grid-auto-rows: 1fr;
		align-items: stretch;
		gap: 14px;
	}

	.item-card {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: stretch;
		min-width: 0;
		height: 100%;
		padding: 12px;
		border: 1px solid color-mix(in srgb, var(--shell-border) 82%, transparent);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--shell-bg-base) 76%, white 24%);
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.11);
		transition:
			transform 0.2s var(--ease),
			box-shadow 0.2s var(--ease),
			border-color 0.2s var(--ease);
	}

	.item-card.owner-card,
	.item-card.add-card {
		grid-template-columns: 42px minmax(0, 1fr);
		padding: 0 12px 0 0;
	}

	.item-card.shared-card {
		grid-template-columns: minmax(0, 1fr);
		cursor: pointer;
	}

	.item-card.dragging {
		opacity: 0.58;
		transform: scale(0.992);
	}

	.item-card.drag-over-target {
		border-color: color-mix(in srgb, var(--green) 62%, var(--shell-border));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 28%, transparent);
	}

	.drag-handle {
		width: 42px;
		min-height: 100%;
		align-self: stretch;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		background: color-mix(in srgb, var(--shell-text) 7%, transparent);
		color: color-mix(in srgb, var(--shell-text) 42%, transparent);
		cursor: grab;
		touch-action: none;
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.item-main {
		min-width: 0;
		display: grid;
		gap: 10px;
	}

	.owner-card .item-main {
		padding: 12px 0;
	}

	.item-head {
		display: flex;
		gap: 8px;
		align-items: baseline;
		min-width: 0;
	}

	.item-label {
		min-width: 0;
		overflow: hidden;
		font-size: 1.06rem;
		font-weight: 850;
		letter-spacing: -0.025em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-qty {
		flex: 0 0 auto;
		color: color-mix(in srgb, var(--shell-text) 52%, transparent);
		font-size: 0.88rem;
		font-weight: 850;
		letter-spacing: -0.015em;
		white-space: nowrap;
	}

	.item-qty::before {
		content: '·';
		margin-right: 8px;
		color: color-mix(in srgb, var(--shell-text) 28%, transparent);
		font-weight: 900;
	}

	.preview-wrap {
		position: relative;
		min-width: 0;
	}

	.preview-card {
		display: block;
		position: relative;
		isolation: isolate;
		overflow: hidden;
		min-height: var(--preview-card-height, 136px);
		min-width: 0;
		border: 1px solid rgba(255, 255, 255, 0.56);
		border-radius: 22px;
		background: var(--preview-art, linear-gradient(135deg, #e1efe6, #f9e7bd)) center / cover
			no-repeat;
		background-clip: padding-box;
		color: inherit;
		text-decoration: none;
		box-shadow: 0 16px 40px rgba(20, 28, 45, 0.14);
		transform: translateZ(0);
		-webkit-mask-image: -webkit-radial-gradient(white, black);
		transition:
			box-shadow 0.18s var(--ease),
			border-color 0.18s var(--ease);
	}

	.preview-card:hover {
		border-color: rgba(255, 255, 255, 0.56);
		box-shadow: 0 16px 40px rgba(20, 28, 45, 0.14);
	}

	.preview-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.2));
		pointer-events: none;
	}

	.preview-card.loading .preview-copy {
		opacity: 0.55;
	}

	.preview-spinner {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 34px;
		height: 34px;
		margin-top: -17px;
		margin-left: -17px;
		border: 3px solid rgba(255, 255, 255, 0.45);
		border-top-color: rgba(255, 255, 255, 0.95);
		border-radius: 50%;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
		z-index: 2;
		pointer-events: none;
		animation: previewSpin 0.75s linear infinite;
	}

	@keyframes previewSpin {
		to {
			transform: rotate(360deg);
		}
	}

	.preview-card.placeholder {
		cursor: inherit;
		pointer-events: none;
		background: linear-gradient(135deg, color-mix(in srgb, var(--xmas-primary) 6%, transparent), color-mix(in srgb, var(--xmas-secondary) 7%, transparent));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.54);
	}

	.preview-card.empty-preview-space::before {
		display: none;
	}

	.preview-empty-label {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 0.9rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		color: color-mix(in srgb, var(--shell-text) 52%, transparent);
		text-transform: none;
	}

	.preview-copy {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1;
		min-width: 0;
		padding: 12px 14px;
		overflow: hidden;
		border-top: 1px solid rgba(255, 255, 255, 0.5);
		border-radius: 0 0 21px 21px;
		background: rgba(255, 255, 255, 0.68);
		backdrop-filter: blur(18px) saturate(1.2);
		-webkit-backdrop-filter: blur(18px) saturate(1.2);
		color: #172033;
	}

	.preview-title {
		margin-bottom: 2px;
		overflow: hidden;
		font-size: 0.92rem;
		font-weight: 850;
		letter-spacing: -0.02em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview-meta {
		overflow: hidden;
		color: rgba(23, 32, 51, 0.68);
		font-size: 0.74rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.claim-float {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 3;
		display: flex;
		justify-content: flex-end;
		pointer-events: none;
	}

	.claim-float .btn {
		min-width: 106px;
		height: 38px;
		pointer-events: auto;
		background: rgba(255, 255, 255, 0.76);
		backdrop-filter: blur(16px) saturate(1.15);
		-webkit-backdrop-filter: blur(16px) saturate(1.15);
		color: #172033;
	}

	.claim-float .btn.primary {
		background: rgba(31, 122, 87, 0.92);
		color: #ffffff;
	}

	.claim-float .btn.claim-conflict {
		border-color: color-mix(in srgb, #f2a7b5 58%, transparent);
		background: rgba(255, 240, 201, 0.86);
		color: var(--red-dark);
		box-shadow:
			0 12px 26px rgba(129, 35, 34, 0.14),
			inset 0 0 0 1px rgba(255, 255, 255, 0.42);
	}

	.claim-float .btn.claim-conflict::before {
		content: '!';
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--red);
		color: white;
		font-size: 0.76rem;
		font-weight: 950;
		line-height: 1;
		box-shadow: 0 4px 10px rgba(129, 35, 34, 0.22);
	}

	.add-card {
		min-height: calc(var(--preview-card-height, 136px) + 1.3rem + 34px);
		overflow: hidden;
		border: 1.5px dashed color-mix(in srgb, var(--xmas-primary) 34%, transparent);
		background:
			radial-gradient(circle at center, color-mix(in srgb, var(--xmas-primary) 8%, transparent), transparent 62%),
			color-mix(in srgb, var(--shell-bg-base) 48%, transparent);
		color: var(--green-dark);
		box-shadow: none;
		cursor: pointer;
	}

	.add-card:hover {
		border-color: color-mix(in srgb, var(--xmas-primary) 58%, transparent);
		background:
			radial-gradient(circle at center, color-mix(in srgb, var(--xmas-primary) 12%, transparent), transparent 62%),
			color-mix(in srgb, var(--shell-bg-base) 62%, transparent);
		box-shadow: 0 16px 36px color-mix(in srgb, var(--xmas-primary) 10%, transparent);
		transform: translateY(-1px);
	}

	.add-card .add-card-rail {
		width: 42px;
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		background: transparent;
		pointer-events: none;
	}

	.add-card .add-card-main {
		position: relative;
		min-width: 0;
		pointer-events: none;
	}

	.add-card .add-card-center {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.add-card svg {
		width: 38px;
		height: 38px;
		display: block;
		opacity: 0.86;
	}

	.empty-state {
		min-height: 360px;
		grid-column: 1 / -1;
		display: grid;
		place-items: center;
		padding: 30px;
		border: 1px dashed color-mix(in srgb, var(--shell-border) 70%, transparent);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--shell-bg-base) 50%, transparent);
		text-align: center;
	}

	.empty-state.compact {
		min-height: 220px;
	}

	.empty-icon {
		margin-bottom: 12px;
		font-size: 4rem;
		line-height: 1;
	}

	.empty-title {
		margin-bottom: 5px;
		font-size: 1.35rem;
		font-weight: 900;
		letter-spacing: -0.04em;
	}

	.empty-sub {
		color: var(--shell-muted);
	}

	.btn {
		height: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 16px;
		border: 1px solid color-mix(in srgb, var(--shell-border) 78%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--shell-bg-base) 76%, white 24%);
		color: var(--shell-text);
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
		white-space: nowrap;
		user-select: none;
		transition:
			transform 0.18s var(--ease),
			box-shadow 0.18s var(--ease),
			background 0.18s var(--ease),
			color 0.18s var(--ease);
	}

	.btn:hover:not(:disabled) {
		box-shadow: 0 11px 22px rgba(0, 0, 0, 0.1);
		transform: translateY(-1px);
	}

	.btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.btn.primary {
		border-color: rgba(255, 255, 255, 0.18);
		background: var(--green, #1f7a57);
		color: var(--xmas-on-primary, #ffffff);
	}

	.btn.danger {
		border-color: rgba(255, 255, 255, 0.18);
		background: var(--red, #b93d3b);
		color: #fff;
	}

	.btn.ghost {
		background: transparent;
		box-shadow: none;
	}

	.btn:disabled {
		opacity: 0.46;
		box-shadow: none;
	}

	.btn.icon {
		width: 42px;
		min-width: 42px;
		padding: 0;
	}

	.xmas-topbar .actions .btn {
		width: 44px;
		min-width: 44px;
		height: 44px;
		padding: 0;
		border-radius: 50%;
		background: color-mix(in srgb, var(--shell-bg-base) 72%, white 28%);
		color: var(--pine);
		box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
	}

	.svg {
		width: 18px;
		height: 18px;
		display: block;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 18px;
		background: rgba(23, 31, 27, 0.34);
		backdrop-filter: blur(10px);
	}

	.modal {
		width: min(610px, 100%);
		max-height: min(88vh, 760px);
		overflow: auto;
		border: 1px solid rgba(255, 255, 255, 0.72);
		border-radius: 30px;
		background: color-mix(in srgb, var(--shell-bg-base) 88%, white 12%);
		box-shadow: 0 30px 90px rgba(23, 31, 27, 0.28);
		animation: pop 0.24s var(--ease);
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.modal-head {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px;
		border-bottom: 1px solid var(--shell-border);
		background: color-mix(in srgb, var(--shell-bg-base) 92%, transparent);
		backdrop-filter: blur(14px);
	}

	.modal-title {
		font-size: 1.18rem;
		font-weight: 900;
		letter-spacing: -0.035em;
	}

	.modal-body {
		display: grid;
		gap: 16px;
		padding: 20px;
	}

	.modal-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		padding: 16px 20px 20px;
		border-top: 1px solid var(--shell-border);
		flex-wrap: wrap;
	}

	.modal-foot .footer-left {
		margin-right: auto;
	}

	.modal-foot .footer-left.btn.icon {
		flex: 0 0 auto;
		width: 42px;
		height: 42px;
		padding: 0;
		border-radius: 50%;
	}

	.modal-foot .matched-action {
		width: 104px;
		padding-right: 0;
		padding-left: 0;
	}

	.field {
		display: grid;
		gap: 7px;
	}

	.field label {
		color: var(--shell-muted);
		font-size: 0.82rem;
		font-weight: 800;
	}

	.input-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 110px;
		gap: 10px;
	}

	.input {
		width: 100%;
		height: 46px;
		padding: 0 14px;
		border: 1px solid color-mix(in srgb, var(--shell-border) 78%, transparent);
		border-radius: 16px;
		background: color-mix(in srgb, var(--shell-bg-base) 72%, white 28%);
		color: var(--shell-text);
		outline: none;
		transition:
			border-color 0.18s var(--ease),
			box-shadow 0.18s var(--ease);
	}

	.textarea {
		width: 100%;
		min-height: 124px;
		padding: 12px 14px;
		resize: vertical;
		border: 1px solid color-mix(in srgb, var(--shell-border) 78%, transparent);
		border-radius: 16px;
		background: color-mix(in srgb, var(--shell-bg-base) 72%, white 28%);
		color: var(--shell-text);
		line-height: 1.35;
		outline: none;
		transition:
			border-color 0.18s var(--ease),
			box-shadow 0.18s var(--ease);
	}

	.input:focus,
	.textarea:focus {
		border-color: color-mix(in srgb, var(--xmas-primary) 48%, transparent);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--xmas-primary) 11%, transparent);
	}

	input[type='number']::-webkit-outer-spin-button,
	input[type='number']::-webkit-inner-spin-button {
		margin: 0;
		-webkit-appearance: none;
	}

	input[type='number'] {
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.readonly-value {
		min-height: 46px;
		display: flex;
		align-items: center;
		padding: 10px 14px;
		overflow-wrap: anywhere;
		border: 1px solid color-mix(in srgb, var(--shell-border) 64%, transparent);
		border-radius: 16px;
		background: color-mix(in srgb, var(--shell-bg-base) 46%, transparent);
		color: var(--shell-text);
		font-weight: 750;
	}

	.readonly-value.muted-value {
		color: var(--shell-muted);
		font-weight: 650;
	}

	.field-shell {
		padding: 10px;
		border: 1px solid transparent;
		border-radius: 20px;
	}

	.drop-zone {
		padding: 10px;
		border: 1px dashed color-mix(in srgb, var(--xmas-primary) 30%, transparent);
		border-radius: 20px;
		background: color-mix(in srgb, var(--xmas-primary) 4.5%, transparent);
		transition:
			border-color 0.18s var(--ease),
			background 0.18s var(--ease);
	}

	.share-row,
	.shared-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 12px;
		border: 1px solid color-mix(in srgb, var(--shell-border) 62%, transparent);
		border-radius: 18px;
		background: color-mix(in srgb, var(--shell-bg-base) 65%, transparent);
	}

	.row-action {
		width: 124px;
		padding-right: 0;
		padding-left: 0;
	}

	.person-name {
		overflow: hidden;
		font-weight: 850;
		letter-spacing: -0.02em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.person-sub {
		overflow: hidden;
		color: var(--shell-muted);
		font-size: 0.84rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.switch {
		width: 58px;
		height: 34px;
		padding: 4px;
		border: 0;
		border-radius: 999px;
		position: relative;
		background: color-mix(in srgb, var(--shell-text) 16%, transparent);
		transition: background 180ms cubic-bezier(0.2, 0.9, 0.2, 1);
	}

	.switch::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 4px;
		width: 26px;
		height: 26px;
		display: block;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.14);
		transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1);
		will-change: transform;
	}

	.switch.on {
		background: var(--green, #1f7a57);
	}

	.switch.on::before {
		transform: translateX(24px);
	}

	.bubble-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
		gap: 10px;
	}

	.bubble {
		position: relative;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border: 1px solid color-mix(in srgb, var(--shell-border) 82%, transparent);
		border-radius: 50%;
		background: color-mix(in srgb, var(--shell-bg-base) 76%, white 24%);
		color: color-mix(in srgb, var(--shell-text) 50%, transparent);
		font-weight: 950;
		transition:
			transform 0.16s var(--ease),
			background 0.16s var(--ease),
			color 0.16s var(--ease),
			border-color 0.16s var(--ease);
	}

	.bubble:not(:disabled):hover {
		transform: translateY(-1px) scale(1.02);
	}

	.bubble.mine {
		border-color: var(--green);
		background: var(--green);
		color: white;
	}

	.bubble.other {
		border-color: #d8dcd9;
		background: #d8dcd9;
		color: #8a928e;
	}

	.bubble.conflict {
		border-color: var(--red);
		background: var(--red);
		color: white;
	}

	.bubble.warn::after {
		content: '!';
		position: absolute;
		top: -2px;
		right: -2px;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		border: 1px solid color-mix(in srgb, var(--xmas-secondary) 35%, transparent);
		border-radius: 50%;
		background: var(--gold-soft);
		color: var(--red-dark);
		font-size: 0.78rem;
		box-shadow: 0 4px 10px rgba(45, 31, 18, 0.16);
	}

	.toast-stack {
		position: fixed;
		right: 18px;
		bottom: 18px;
		z-index: 200;
		display: grid;
		gap: 10px;
		width: min(360px, calc(100vw - 36px));
	}

	.toast {
		padding: 12px 14px;
		border-radius: 18px;
		background: rgba(15, 58, 49, 0.92);
		color: white;
		box-shadow: 0 18px 42px rgba(23, 31, 27, 0.25);
		animation: toastIn 0.2s var(--ease);
	}

	.toast.error {
		background: rgba(129, 35, 34, 0.94);
	}

	.toast-label {
		display: block;
		margin-bottom: 2px;
		font-size: 0.74rem;
		font-weight: 900;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		opacity: 0.76;
	}

	.toast-message {
		display: block;
		font-size: 0.94rem;
		font-weight: 750;
		letter-spacing: -0.01em;
	}

	@keyframes toastIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (max-width: 820px) {
		.xmas-app {
			border-radius: 26px;
		}

		.xmas-topbar {
			align-items: center;
			flex-direction: row;
		}

		.actions {
			width: auto;
			justify-content: flex-end;
			gap: 8px;
		}

		.xmas-topbar .actions .btn {
			width: 42px;
			min-width: 42px;
			height: 42px;
		}

		.content {
			padding: 14px;
		}

		.list-wrap {
			--item-column-min: 280px;
		}

		.item-card,
		.item-card.owner-card,
		.item-card.shared-card,
		.item-card.add-card {
			grid-template-columns: minmax(0, 1fr);
			padding: 12px;
		}

		.owner-card .item-main {
			padding: 0;
		}

		.item-card.owner-card .drag-handle,
		.drag-handle {
			width: 100%;
			height: 34px;
			min-height: 34px;
			border-radius: 18px;
		}

		.add-card .add-card-rail {
			display: none;
		}

		.claim-float {
			top: 10px;
			right: 10px;
		}

		.claim-float .btn {
			min-width: 100px;
		}

		.input-row {
			grid-template-columns: 1fr;
		}
	}
</style>
