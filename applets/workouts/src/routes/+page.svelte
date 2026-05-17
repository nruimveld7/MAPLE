<script>
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import { ShellTopbar, resolveShellTheme } from '$shell';
	import '$shell/shell.css';

	export let data;

	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const categories = ['Strength', 'Cardio', 'Speed', 'Mobility', 'HIIT', 'Other'];
	const drawerWidth = 260;
	const drawerHeight = 260;
	const narrowViewportMax = 900;
	const getCurrentDay = () => days[new Date().getDay()] ?? days[0];

	function emptySchedule() {
		return days.reduce((acc, day) => {
			acc[day] = [];
			return acc;
		}, {});
	}

	function normalizeExercises(input) {
		return Array.isArray(input) ? input : [];
	}

	function normalizeSchedule(input) {
		const normalized = emptySchedule();
		if (!input || typeof input !== 'object') return normalized;
		for (const day of days) {
			normalized[day] = Array.isArray(input[day]) ? input[day] : [];
		}
		return normalized;
	}

	let isUserMenuOpen = false;
	let themeReady = false;

	let activeTab = 'schedule';
	let scheduleView = 'daily';
	let selectedDay = getCurrentDay();
	let drawerOpen = false;
	let drawerProgress = 0;

	let categoryPopoverOpen = false;

	let exerciseName = '';
	let exerciseCategory = 'Strength';

	let prModalOpen = false;
	let detailsModalOpen = false;
	let groupModalOpen = false;
	let confirmDeleteOpen = false;

	let selectedExerciseId = '';
	let selectedScheduleDay = '';
	let selectedScheduleItemId = '';
	let selectedGroupDay = '';
	let selectedGroupId = '';

	let confirmDeleteExerciseId = '';
	let confirmDeleteMessage = [];
	let detailsDraftTargets = [];

	let dragState = null;
	let drawerDrag = null;
	let drawerSuppressClickUntil = 0;
	let ghost = null;
	let toastMessage = '';
	let daySelectorTrack;
	let tabPanelHeight = 0;
	let plannerTopOffset = 0;
	let drawerBodyEl;
	let drawerTrackEl;
	let drawerHasOverflow = false;
	let drawerThumbHeight = 0;
	let drawerThumbTop = 0;
	let libraryBodyEl;
	let libraryTrackEl;
	let libraryHasOverflow = false;
	let libraryThumbHeight = 0;
	let libraryThumbTop = 0;
	let scheduleBodyEl;
	let scheduleTrackEl;
	let scheduleHasOverflow = false;
	let scheduleThumbHeight = 0;
	let scheduleThumbTop = 0;
	let scrollbarDrag = null;
	let daySelectorFadeStart = false;
	let daySelectorFadeEnd = false;
	let previousScheduleView = scheduleView;
	let safeSelectedDay = selectedDay;
	let liveCenteredDay = selectedDay;
	let daySelectorScrollEndTimer = null;
	let daySelectorSuppressClickUntil = 0;
	let daySelectorDrag = null;
	let daySelectorMomentumFrame = null;
	let daySelectorMomentumActive = false;
	let scheduleToggleEl;
	let plannerLayoutEl;
	let scheduleViewDrag = null;
	let scheduleViewDragTeardown = null;
	let scheduleViewSuppressClickUntil = 0;
	let hasLoggedInitialDaySelection = false;
	let suppressCardOpenUntil = 0;
	let hasHydratedClientState = false;
	let isSaving = false;
	let pendingSave = false;
	let hasUnsavedChanges = false;
	let clientStateVersion = 0;
	let isNarrowViewport = false;
	const DND_DEBUG = true;

	function dndLog(eventName, details = {}) {
		if (!DND_DEBUG || !browser) return;
	}

	function observeTabPanel(node) {
		if (!browser || !node) return;
		const update = () => {
			tabPanelHeight = node.offsetHeight || 0;
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	function observePlannerTop(node) {
		if (!browser || !node) return;
		const update = () => {
			plannerTopOffset = node.offsetTop || 0;
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		if (node.parentElement) observer.observe(node.parentElement);
		window.addEventListener('resize', update);
		return {
			destroy() {
				observer.disconnect();
				window.removeEventListener('resize', update);
			}
		};
	}

	function updateDrawerScrollbar() {
		if (!drawerBodyEl) {
			drawerHasOverflow = false;
			drawerThumbHeight = 0;
			drawerThumbTop = 0;
			return;
		}
		const viewport = drawerBodyEl.clientHeight;
		const content = drawerBodyEl.scrollHeight;
		const maxScroll = content - viewport;
		drawerHasOverflow = maxScroll > 2;
		if (!drawerHasOverflow) {
			drawerThumbHeight = 0;
			drawerThumbTop = 0;
			return;
		}
		const trackHeight = Math.max(0, (drawerTrackEl?.clientHeight || viewport - 16));
		const ratio = viewport / content;
		drawerThumbHeight = Math.max(28, trackHeight * ratio);
		const travel = Math.max(0, trackHeight - drawerThumbHeight);
		drawerThumbTop = maxScroll > 0 ? (drawerBodyEl.scrollTop / maxScroll) * travel : 0;
	}

	function observeDrawerBody(node) {
		if (!browser || !node) return;
		drawerBodyEl = node;
		const update = () => updateDrawerScrollbar();
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		const content = node.querySelector('.drawer-list');
		if (content) observer.observe(content);
		window.addEventListener('resize', update);
		return {
			destroy() {
				observer.disconnect();
				window.removeEventListener('resize', update);
				if (drawerBodyEl === node) drawerBodyEl = null;
			}
		};
	}

	function updateScheduleScrollbar() {
		if (!scheduleBodyEl) {
			scheduleHasOverflow = false;
			scheduleThumbHeight = 0;
			scheduleThumbTop = 0;
			return;
		}
		const viewport = scheduleBodyEl.clientHeight;
		const content = scheduleBodyEl.scrollHeight;
		const maxScroll = content - viewport;
		scheduleHasOverflow = maxScroll > 2;
		if (!scheduleHasOverflow) {
			scheduleThumbHeight = 0;
			scheduleThumbTop = 0;
			return;
		}
		const trackHeight = Math.max(0, (scheduleTrackEl?.clientHeight || viewport - 16));
		const ratio = viewport / content;
		scheduleThumbHeight = Math.max(28, trackHeight * ratio);
		const travel = Math.max(0, trackHeight - scheduleThumbHeight);
		scheduleThumbTop = maxScroll > 0 ? (scheduleBodyEl.scrollTop / maxScroll) * travel : 0;
	}

	function updateLibraryScrollbar() {
		if (!libraryBodyEl) {
			libraryHasOverflow = false;
			libraryThumbHeight = 0;
			libraryThumbTop = 0;
			return;
		}
		const viewport = libraryBodyEl.clientHeight;
		const content = libraryBodyEl.scrollHeight;
		const maxScroll = content - viewport;
		libraryHasOverflow = maxScroll > 2;
		if (!libraryHasOverflow) {
			libraryThumbHeight = 0;
			libraryThumbTop = 0;
			return;
		}
		const trackHeight = Math.max(0, (libraryTrackEl?.clientHeight || viewport - 16));
		const ratio = viewport / content;
		libraryThumbHeight = Math.max(28, trackHeight * ratio);
		const travel = Math.max(0, trackHeight - libraryThumbHeight);
		libraryThumbTop = maxScroll > 0 ? (libraryBodyEl.scrollTop / maxScroll) * travel : 0;
	}

	function observeLibraryBody(node) {
		if (!browser || !node) return;
		libraryBodyEl = node;
		const update = () => updateLibraryScrollbar();
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		const content = node.querySelector('.exercise-list');
		if (content) observer.observe(content);
		window.addEventListener('resize', update);
		return {
			destroy() {
				observer.disconnect();
				window.removeEventListener('resize', update);
				if (libraryBodyEl === node) libraryBodyEl = null;
			}
		};
	}

	function startScrollbarThumbDrag(event, type) {
		const body = type === 'drawer' ? drawerBodyEl : type === 'schedule' ? scheduleBodyEl : libraryBodyEl;
		const track = type === 'drawer' ? drawerTrackEl : type === 'schedule' ? scheduleTrackEl : libraryTrackEl;
		if (!body || !track) return;
		const viewport = body.clientHeight;
		const content = body.scrollHeight;
		const maxScroll = content - viewport;
		if (maxScroll <= 0) return;
		const trackHeight = track.clientHeight;
		const thumbHeight =
			type === 'drawer' ? drawerThumbHeight : type === 'schedule' ? scheduleThumbHeight : libraryThumbHeight;
		const travel = Math.max(1, trackHeight - thumbHeight);
		scrollbarDrag = {
			type,
			pointerId: event.pointerId,
			startY: event.clientY,
			startScrollTop: body.scrollTop,
			maxScroll,
			travel
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}

	function handleScrollbarThumbDrag(event, type) {
		if (!scrollbarDrag || scrollbarDrag.type !== type || scrollbarDrag.pointerId !== event.pointerId) return;
		const body = type === 'drawer' ? drawerBodyEl : type === 'schedule' ? scheduleBodyEl : libraryBodyEl;
		if (!body) return;
		const deltaY = event.clientY - scrollbarDrag.startY;
		const scrollDelta = (deltaY / scrollbarDrag.travel) * scrollbarDrag.maxScroll;
		body.scrollTop = Math.max(0, Math.min(scrollbarDrag.maxScroll, scrollbarDrag.startScrollTop + scrollDelta));
	}

	function endScrollbarThumbDrag(event, type) {
		if (!scrollbarDrag || scrollbarDrag.type !== type || scrollbarDrag.pointerId !== event.pointerId) return;
		scrollbarDrag = null;
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function getScheduleViewProgress() {
		return scheduleView === 'weekly' ? 1 : 0;
	}

	function setScheduleViewFromProgress(progress) {
		scheduleView = progress >= 0.5 ? 'weekly' : 'daily';
	}

	function handleScheduleViewOptionClick(view) {
		if (Date.now() < scheduleViewSuppressClickUntil) return;
		scheduleView = view;
	}

	function startScheduleViewDrag(event) {
		if (!scheduleToggleEl) return;
		event.preventDefault();
		const rect = scheduleToggleEl.getBoundingClientRect();
		const segmentWidth = rect.width / 2;
		if (segmentWidth <= 0) return;
		scheduleViewDrag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startProgress: getScheduleViewProgress(),
			progress: getScheduleViewProgress(),
			segmentWidth,
			hasMoved: false
		};
		scheduleViewDragTeardown?.();
		const handleMove = (moveEvent) => moveScheduleViewDrag(moveEvent);
		const handleUp = (upEvent) => endScheduleViewDrag(upEvent);
		window.addEventListener('pointermove', handleMove);
		window.addEventListener('pointerup', handleUp);
		window.addEventListener('pointercancel', handleUp);
		scheduleViewDragTeardown = () => {
			window.removeEventListener('pointermove', handleMove);
			window.removeEventListener('pointerup', handleUp);
			window.removeEventListener('pointercancel', handleUp);
			scheduleViewDragTeardown = null;
		};
	}

	function moveScheduleViewDrag(event) {
		if (!scheduleViewDrag || scheduleViewDrag.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - scheduleViewDrag.startX;
		const progress = clamp(scheduleViewDrag.startProgress + (deltaX / scheduleViewDrag.segmentWidth), 0, 1);
		scheduleViewDrag.progress = progress;
		scheduleViewDrag.hasMoved = scheduleViewDrag.hasMoved || Math.abs(deltaX) > 4;
	}

	function endScheduleViewDrag(event) {
		if (!scheduleViewDrag || scheduleViewDrag.pointerId !== event.pointerId) return;
		const { progress, hasMoved } = scheduleViewDrag;
		const rect = scheduleToggleEl?.getBoundingClientRect();
		scheduleViewDrag = null;
		scheduleViewDragTeardown?.();
		if (!hasMoved && rect) {
			const midpoint = rect.left + (rect.width / 2);
			scheduleView = event.clientX >= midpoint ? 'weekly' : 'daily';
		} else {
			setScheduleViewFromProgress(progress);
		}
		if (hasMoved) scheduleViewSuppressClickUntil = Date.now() + 220;
	}

	function observeScheduleBody(node) {
		if (!browser || !node) return;
		scheduleBodyEl = node;
		const update = () => updateScheduleScrollbar();
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		const content = node.querySelector('.schedule-scroll-content');
		if (content) observer.observe(content);
		window.addEventListener('resize', update);
		return {
			destroy() {
				observer.disconnect();
				window.removeEventListener('resize', update);
				if (scheduleBodyEl === node) scheduleBodyEl = null;
			}
		};
	}

	$: theme = resolveShellTheme(data?.shellTheme);
	$: user = data?.user ?? {};
	$: userFullName = getUserFullName(user);
	$: userInitials = getUserInitials(user);
	$: sortedExercises = [...exercises].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	$: currentExercise = exercises.find((exercise) => exercise.id === selectedExerciseId);
	$: currentScheduleItem = getScheduledItem(selectedScheduleDay, selectedScheduleItemId);
	$: currentGroup = getGroup(selectedGroupDay, selectedGroupId);
	$: if (!days.includes(selectedDay)) selectedDay = getCurrentDay();
	$: safeSelectedDay = days.includes(selectedDay) ? selectedDay : getCurrentDay();
	$: if (!days.includes(liveCenteredDay)) liveCenteredDay = safeSelectedDay;
	$: selectedDayItems = schedule[safeSelectedDay] ?? [];
	$: dayItemCounts = days.reduce((acc, day) => {
		acc[day] = countDayScheduleItems(day);
		return acc;
	}, {});
	$: scheduleCount = Object.values(schedule).reduce((total, entries) => {
		return (
			total +
			entries.reduce((dayTotal, entry) => {
				if (entry.type === 'group') return dayTotal + entry.exercises.length;
				return dayTotal + 1;
			}, 0)
		);
	}, 0);
	$: if (browser) {
		exercises;
		tick().then(() => updateDrawerScrollbar());
	}
	$: if (browser) {
		scheduleView;
		schedule;
		tick().then(() => updateScheduleScrollbar());
	}
	$: scheduleViewSliderProgress = scheduleViewDrag ? scheduleViewDrag.progress : getScheduleViewProgress();

	let exercises = normalizeExercises(data?.workoutState?.exercises);
	let schedule = normalizeSchedule(data?.workoutState?.schedule);

	function buildWorkoutStatePayload() {
		return {
			exercises,
			schedule
		};
	}

	function markUnsavedChange() {
		clientStateVersion += 1;
		hasUnsavedChanges = true;
	}

	async function saveWorkoutState() {
		if (!browser || !hasHydratedClientState) return;
		if (isSaving) {
			pendingSave = true;
			return;
		}
		const saveVersion = clientStateVersion;
		isSaving = true;
		try {
			const response = await fetch('./api/workout-state', {
				method: 'PUT',
				keepalive: true,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(buildWorkoutStatePayload())
			});

			if (!response.ok) {
			} else if (saveVersion === clientStateVersion) {
				hasUnsavedChanges = false;
			}
		} catch (err) {
		} finally {
			isSaving = false;
			if (pendingSave) {
				pendingSave = false;
				void saveWorkoutState();
			}
		}
	}

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
		const handleResize = () => {
			const wasNarrowViewport = isNarrowViewport;
			isNarrowViewport = window.innerWidth <= narrowViewportMax;
			if (isNarrowViewport && !wasNarrowViewport) {
				drawerOpen = false;
				drawerProgress = 0;
			}
			updateDaySelectorFade();
		};
		document.body.classList.add('shell-theme');
		window.addEventListener('resize', handleResize);
		handleResize();
		if (isNarrowViewport) {
			drawerOpen = false;
			drawerProgress = 0;
		}
		tick().then(() => {
			if (scheduleView !== 'daily') return;
			const today = getCurrentDay();
			if (!hasLoggedInitialDaySelection) {
			}
			// Delay until after paint to avoid pre-layout centering drift.
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					selectedDay = today;
					liveCenteredDay = today;
					forceCenterDayByName(today);
					updateDaySelectorFade();
					syncSelectedDayFromCenter(true);
					if (!hasLoggedInitialDaySelection) {
						const domActiveDay =
							daySelectorTrack?.querySelector('.day-select-btn.active')?.getAttribute('data-day') ?? 'unknown';
						const activeDay =
							days.find((day) => day === liveCenteredDay) ??
							days.find((day) => day === selectedDay) ??
							safeSelectedDay ??
							'unknown';
						hasLoggedInitialDaySelection = true;
					}
				});
			});
		});
		hasHydratedClientState = true;
		const removedEmptyGroups = removeEmptyGroups();
		if (removedEmptyGroups > 0) {
			showToast(`Removed ${removedEmptyGroups} Empty Group${removedEmptyGroups === 1 ? '' : 's'}`);
		}
		const persistOnPageHide = () => {
			if (!hasUnsavedChanges) return;
			const body = JSON.stringify(buildWorkoutStatePayload());
			if (navigator.sendBeacon) {
				const blob = new Blob([body], { type: 'application/json' });
				navigator.sendBeacon('./api/workout-state', blob);
				hasUnsavedChanges = false;
				return;
			}
			void fetch('./api/workout-state', {
				method: 'PUT',
				keepalive: true,
				headers: { 'Content-Type': 'application/json' },
				body
			});
		};
		window.addEventListener('pagehide', persistOnPageHide);

		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener('resize', handleResize);
			window.clearTimeout(daySelectorScrollEndTimer);
			window.cancelAnimationFrame(daySelectorMomentumFrame);
			daySelectorMomentumActive = false;
			document.body.classList.remove('shell-theme');
			removeGhost();
			window.removeEventListener('pagehide', persistOnPageHide);
		};
	});

	$: if (browser && scheduleView !== previousScheduleView) {
		previousScheduleView = scheduleView;
		if (scheduleView === 'daily') {
			const today = getCurrentDay();
			selectedDay = today;
			liveCenteredDay = today;
			tick().then(() => {
				centerDayByName(today, 'auto');
				updateDaySelectorFade();
				syncSelectedDayFromCenter(true);
			});
		}
	}

	function updateDaySelectorFade() {
		if (!daySelectorTrack) return;
		const maxScrollLeft = daySelectorTrack.scrollWidth - daySelectorTrack.clientWidth;
		daySelectorFadeStart = daySelectorTrack.scrollLeft > 2;
		daySelectorFadeEnd = daySelectorTrack.scrollLeft < maxScrollLeft - 2;
	}

	function centerDayByName(day, behavior = 'smooth') {
		if (!daySelectorTrack || !days.includes(day)) return;
		const targetButton = daySelectorTrack.querySelector(`.day-select-btn[data-day="${day}"]`);
		if (!targetButton) return;
		targetButton.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
	}

	function forceCenterDayByName(day) {
		if (!daySelectorTrack || !days.includes(day)) return;
		const targetButton = daySelectorTrack.querySelector(`.day-select-btn[data-day="${day}"]`);
		if (!targetButton) return;
		const maxScrollLeft = Math.max(0, daySelectorTrack.scrollWidth - daySelectorTrack.clientWidth);
		const targetCenter = targetButton.offsetLeft + targetButton.offsetWidth / 2;
		const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetCenter - daySelectorTrack.clientWidth / 2));
		daySelectorTrack.scrollLeft = targetScrollLeft;
	}

	function getCenteredDay() {
		if (!daySelectorTrack) return null;
		const buttons = daySelectorTrack.querySelectorAll('.day-select-btn');
		if (!buttons.length) return null;
		const center = daySelectorTrack.scrollLeft + daySelectorTrack.clientWidth / 2;
		let closestDay = null;
		let closestDistance = Number.POSITIVE_INFINITY;

		for (const button of buttons) {
			const buttonCenter = button.offsetLeft + button.offsetWidth / 2;
			const distance = Math.abs(buttonCenter - center);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestDay = button.dataset.day ?? null;
			}
		}

		return closestDay;
	}

	function syncSelectedDayFromCenter(commit = false) {
		const centeredDay = getCenteredDay();
		if (!centeredDay || !days.includes(centeredDay)) return;
		liveCenteredDay = centeredDay;
		if (commit && centeredDay !== selectedDay) selectedDay = centeredDay;
	}

	function selectDay(day) {
		if (!days.includes(day)) return;
		if (Date.now() < daySelectorSuppressClickUntil) return;
		selectedDay = day;
		liveCenteredDay = day;
		centerDayByName(day, 'smooth');
	}

	function openScheduleTab() {
		activeTab = 'schedule';
		if (scheduleView !== 'daily') return;
		const today = getCurrentDay();
		selectedDay = today;
		liveCenteredDay = today;
		tick().then(() => {
			centerDayByName(today, 'auto');
			updateDaySelectorFade();
		});
	}

	function handleDaySelectorPointerDown(event) {
		if (!daySelectorTrack) return;
		if (event.button !== 0) return;
		if (event.pointerType === 'touch') return;
		window.cancelAnimationFrame(daySelectorMomentumFrame);
		daySelectorMomentumActive = false;
		const pressedDay =
			event.target instanceof Element
				? event.target.closest('.day-select-btn')?.getAttribute('data-day') ?? null
				: null;
		daySelectorDrag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startScrollLeft: daySelectorTrack.scrollLeft,
			moved: false,
			pressedDay,
			moveTrail: [{ x: event.clientX, t: performance.now() }]
		};
		daySelectorTrack.setPointerCapture(event.pointerId);
	}

	function handleDaySelectorPointerMove(event) {
		if (!daySelectorTrack || !daySelectorDrag || event.pointerId !== daySelectorDrag.pointerId) return;
		const deltaX = event.clientX - daySelectorDrag.startX;
		const now = performance.now();
		daySelectorDrag.moveTrail.push({ x: event.clientX, t: now });
		daySelectorDrag.moveTrail = daySelectorDrag.moveTrail.filter((point) => now - point.t <= 160);
		if (!daySelectorDrag.moved && Math.abs(deltaX) > 6) {
			daySelectorDrag.moved = true;
		}
		if (daySelectorDrag.moved) {
			event.preventDefault();
			daySelectorTrack.scrollLeft = daySelectorDrag.startScrollLeft - deltaX;
		}
	}

	function getDaySelectorReleaseVelocity(moveTrail) {
		if (!moveTrail || moveTrail.length < 2) return 0;
		const end = moveTrail[moveTrail.length - 1];
		let start = moveTrail[0];
		for (let i = moveTrail.length - 2; i >= 0; i -= 1) {
			if (end.t - moveTrail[i].t >= 85) {
				start = moveTrail[i];
				break;
			}
		}
		const dt = end.t - start.t;
		if (dt <= 0) return 0;
		const pointerVelocity = (end.x - start.x) / dt;
		// Invert pointer velocity to scroll velocity direction.
		return -pointerVelocity;
	}

	function getDaySelectorCommitTarget(direction) {
		if (!daySelectorTrack) return null;
		const buttons = Array.from(daySelectorTrack.querySelectorAll('.day-select-btn'));
		if (!buttons.length) return null;
		const center = daySelectorTrack.scrollLeft + daySelectorTrack.clientWidth / 2;
		let closestIndex = 0;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (let i = 0; i < buttons.length; i += 1) {
			const buttonCenter = buttons[i].offsetLeft + buttons[i].offsetWidth / 2;
			const distance = Math.abs(buttonCenter - center);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = i;
			}
		}
		const closestCenter = buttons[closestIndex].offsetLeft + buttons[closestIndex].offsetWidth / 2;
		let targetIndex = closestIndex;
		if (direction > 0 && closestCenter < center) targetIndex = Math.min(buttons.length - 1, closestIndex + 1);
		if (direction < 0 && closestCenter > center) targetIndex = Math.max(0, closestIndex - 1);
		const targetButton = buttons[targetIndex];
		const maxScrollLeft = Math.max(0, daySelectorTrack.scrollWidth - daySelectorTrack.clientWidth);
		const targetCenter = targetButton.offsetLeft + targetButton.offsetWidth / 2;
		const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetCenter - daySelectorTrack.clientWidth / 2));
		return { targetScrollLeft, targetDay: targetButton.getAttribute('data-day') ?? null };
	}

	function startDaySelectorDesktopMomentum(initialVelocity) {
		if (!daySelectorTrack) return;
		window.cancelAnimationFrame(daySelectorMomentumFrame);
		daySelectorMomentumActive = true;
		let velocity = Math.max(-2.2, Math.min(2.2, initialVelocity));
		let commitTargetScrollLeft = null;
		let commitTargetDay = null;
		let lastTime = performance.now();
		const step = (now) => {
			if (!daySelectorTrack) return;
			const dt = Math.min(34, now - lastTime);
			lastTime = now;
			const maxScrollLeft = Math.max(0, daySelectorTrack.scrollWidth - daySelectorTrack.clientWidth);
			const current = daySelectorTrack.scrollLeft;

			if (commitTargetScrollLeft === null) {
				const next = current + velocity * dt;
				const clamped = Math.max(0, Math.min(maxScrollLeft, next));
				daySelectorTrack.scrollLeft = clamped;
			} else {
				const delta = commitTargetScrollLeft - current;
				const direction = Math.sign(delta);
				const commitSpeed = Math.max(0.22, Math.abs(velocity));
				const stepSize = direction * commitSpeed * dt;
				if (Math.abs(stepSize) >= Math.abs(delta) || Math.abs(delta) < 0.3) {
					daySelectorTrack.scrollLeft = commitTargetScrollLeft;
				} else {
					daySelectorTrack.scrollLeft = current + stepSize;
				}
			}
			updateDaySelectorFade();
			syncSelectedDayFromCenter(false);

			const clamped = daySelectorTrack.scrollLeft;
			const atEdge = clamped <= 0 || clamped >= maxScrollLeft;
			velocity *= Math.pow(0.94, dt / 16);

			// Start commit while momentum is still alive to avoid a stop-then-snap feeling.
			if (commitTargetScrollLeft === null && (Math.abs(velocity) < 0.14 || atEdge)) {
				const commitTarget = getDaySelectorCommitTarget(Math.sign(velocity || 1));
				if (commitTarget) {
					commitTargetScrollLeft = commitTarget.targetScrollLeft;
					commitTargetDay = commitTarget.targetDay;
					if (commitTargetScrollLeft > clamped) velocity = Math.max(velocity, 0.28);
					if (commitTargetScrollLeft < clamped) velocity = Math.min(velocity, -0.28);
				} else {
					daySelectorMomentumActive = false;
					syncSelectedDayFromCenter(true);
					return;
				}
			}

			if (commitTargetScrollLeft !== null && Math.abs(daySelectorTrack.scrollLeft - commitTargetScrollLeft) < 0.3) {
				daySelectorTrack.scrollLeft = commitTargetScrollLeft;
				daySelectorMomentumActive = false;
				if (commitTargetDay && days.includes(commitTargetDay)) {
					liveCenteredDay = commitTargetDay;
					selectedDay = commitTargetDay;
				} else {
					syncSelectedDayFromCenter(true);
				}
				return;
			}
			daySelectorMomentumFrame = window.requestAnimationFrame(step);
		};
		daySelectorMomentumFrame = window.requestAnimationFrame(step);
	}

	function finishDaySelectorPointer(pointerId) {
		if (!daySelectorTrack || !daySelectorDrag || pointerId !== daySelectorDrag.pointerId) return;
		const moved = daySelectorDrag.moved;
		const pressedDay = daySelectorDrag.pressedDay;
		const moveTrail = daySelectorDrag.moveTrail;
		try {
			daySelectorTrack.releasePointerCapture(pointerId);
		} catch {
			// Pointer capture may already be released.
		}
		daySelectorDrag = null;
		if (!moved) {
			if (pressedDay && days.includes(pressedDay)) selectDay(pressedDay);
			return;
		}
		daySelectorSuppressClickUntil = Date.now() + 220;
		const releaseVelocity = getDaySelectorReleaseVelocity(moveTrail);
		if (Math.abs(releaseVelocity) > 0.02) {
			startDaySelectorDesktopMomentum(releaseVelocity);
			return;
		}
		const centeredDay = getCenteredDay();
		if (!centeredDay || !days.includes(centeredDay)) return;
		liveCenteredDay = centeredDay;
		selectedDay = centeredDay;
		centerDayByName(centeredDay, 'smooth');
	}

	function handleDaySelectorPointerUp(event) {
		finishDaySelectorPointer(event.pointerId);
	}

	function handleDaySelectorPointerCancel(event) {
		finishDaySelectorPointer(event.pointerId);
	}

	function handleDaySelectorClickCapture(event) {
		if (Date.now() >= daySelectorSuppressClickUntil) return;
		event.preventDefault();
		event.stopPropagation();
	}

	function handleDaySelectorScroll() {
		updateDaySelectorFade();
		syncSelectedDayFromCenter(false);
		window.clearTimeout(daySelectorScrollEndTimer);
		daySelectorScrollEndTimer = window.setTimeout(() => {
			syncSelectedDayFromCenter(true);
		}, 90);
	}

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

	function createTarget(label = '', value = '', unit = '') {
		return { id: crypto.randomUUID(), label, value, unit };
	}

	function createScheduleExercise(exerciseId, targets = []) {
		return { id: crypto.randomUUID(), type: 'exercise', exerciseId, targets };
	}

	function createExerciseGroup(sets = '3') {
		return { id: crypto.randomUUID(), type: 'group', sets, exercises: [] };
	}

	function touchExercises() {
		markUnsavedChange();
		exercises = [...exercises];
		void saveWorkoutState();
	}

	function touchSchedule({ saveNow = false } = {}) {
		markUnsavedChange();
		schedule = { ...schedule };
		if (saveNow) void saveWorkoutState();
	}

	function removeEmptyGroups() {
		let removed = 0;
		for (const day of days) {
			const before = schedule[day].length;
			schedule[day] = schedule[day].filter((entry) => {
				if (entry.type !== 'group') return true;
				return (entry.exercises?.length ?? 0) > 0;
			});
			removed += before - schedule[day].length;
		}
		if (removed > 0) touchSchedule({ saveNow: true });
		return removed;
	}

	function showToast(message) {
		toastMessage = message;
		window.clearTimeout(showToast.timer);
		showToast.timer = window.setTimeout(() => {
			toastMessage = '';
		}, 1800);
	}

	function getExercise(id) {
		return exercises.find((exercise) => exercise.id === id);
	}

	function getGroup(day, groupId) {
		return schedule[day]?.find((entry) => entry.type === 'group' && entry.id === groupId) ?? null;
	}

	function countDayScheduleItems(day) {
		const entries = schedule[day] ?? [];
		return entries.reduce((total, entry) => {
			if (entry?.type === 'group') return total + (entry.exercises?.length ?? 0);
			return total + 1;
		}, 0);
	}

	function findScheduledEntry(day, itemId) {
		for (const entry of schedule[day] ?? []) {
			if (entry.id === itemId) return { item: entry, parent: schedule[day], group: null };

			if (entry.type === 'group') {
				const child = entry.exercises.find((exercise) => exercise.id === itemId);
				if (child) return { item: child, parent: entry.exercises, group: entry };
			}
		}

		return null;
	}

	function getScheduledItem(day, itemId) {
		return findScheduledEntry(day, itemId)?.item ?? null;
	}

	function targetText(target) {
		const label = target.label || 'Metric';
		const value = target.value || '';
		const unit = target.unit || '';
		return [label, [value, unit].filter(Boolean).join(' ')].filter(Boolean).join(': ');
	}

	function metricText(metric) {
		const name = metric.name || 'Metric';
		const value = metric.value || '';
		const unit = metric.unit || '';
		return [name, [value, unit].filter(Boolean).join(' ')].filter(Boolean).join(': ');
	}

	function addExercise() {
		const name = exerciseName.trim();
		if (!name) return;

		exercises = [
			...exercises,
			{
				id: crypto.randomUUID(),
				name,
				category: exerciseCategory,
				metrics: []
			}
		];

		exerciseName = '';
		exerciseCategory = 'Strength';
		touchExercises();
		showToast('Exercise Added');
	}

	function requestDeleteExercise(id) {
		const exercise = getExercise(id);
		if (!exercise) return;

		const scheduledCount = days.reduce((total, day) => {
			return total + countExerciseUses(schedule[day], id);
		}, 0);

		const hasPrTracking = exercise.metrics.length > 0;

		if (!scheduledCount && !hasPrTracking) {
			deleteExercise(id);
			return;
		}

		const reasons = [];
		if (scheduledCount) reasons.push(`${scheduledCount} scheduled entr${scheduledCount === 1 ? 'y' : 'ies'}`);
		if (hasPrTracking) reasons.push('PR tracking data');

		confirmDeleteExerciseId = id;
		confirmDeleteMessage = [
			`${exercise.name} has ${reasons.join(' and ')}.`,
			'Deleting it will remove the exercise from the library.',
			'It will also remove it from every scheduled day.',
			'Its PR tracking will be deleted.'
		];
		confirmDeleteOpen = true;
	}

	function countExerciseUses(entries, exerciseId) {
		return entries.reduce((total, entry) => {
			if (entry.type === 'group') {
				return total + entry.exercises.filter((exercise) => exercise.exerciseId === exerciseId).length;
			}

			return total + (entry.exerciseId === exerciseId ? 1 : 0);
		}, 0);
	}

	function deleteExercise(id) {
		let removedScheduleCount = 0;

		for (const day of days) {
			const beforeTopLevel = schedule[day].length;

			schedule[day] = schedule[day]
				.map((entry) => {
					if (entry.type !== 'group') return entry;

					const beforeGroup = entry.exercises.length;
					entry.exercises = entry.exercises.filter((exercise) => exercise.exerciseId !== id);
					removedScheduleCount += beforeGroup - entry.exercises.length;
					return entry;
				})
				.filter((entry) => entry.type === 'group' || entry.exerciseId !== id);

			removedScheduleCount += beforeTopLevel - schedule[day].length;
		}

		exercises = exercises.filter((exercise) => exercise.id !== id);
		confirmDeleteOpen = false;
		confirmDeleteExerciseId = '';
		touchSchedule({ saveNow: true });

		showToast(
			removedScheduleCount
				? `Exercise Deleted · Removed From ${removedScheduleCount} Schedule Entr${removedScheduleCount === 1 ? 'y' : 'ies'}`
				: 'Exercise Deleted'
		);
	}

	function openPrModal(exerciseId) {
		selectedExerciseId = exerciseId;
		prModalOpen = true;
	}

	function closePrModal() {
		prModalOpen = false;
		selectedExerciseId = '';
	}

	function addPrMetric() {
		if (!currentExercise) return;
		currentExercise.metrics = [
			...currentExercise.metrics,
			{ id: crypto.randomUUID(), name: '', value: '', unit: '' }
		];
		touchExercises();
	}

	function removePrMetric(metricId) {
		if (!currentExercise || currentExercise.metrics.length <= 1) return;
		currentExercise.metrics = currentExercise.metrics.filter((metric) => metric.id !== metricId);
		touchExercises();
	}

	function updatePrMetric(metricId, field, value) {
		if (!currentExercise) return;
		currentExercise.metrics = currentExercise.metrics.map((metric) => {
			if (metric.id !== metricId) return metric;
			return { ...metric, [field]: value };
		});
		touchExercises();
	}

	function savePrModal() {
		if (!currentExercise) return;
		currentExercise.metrics = currentExercise.metrics.filter(
			(metric) => metric.name.trim() || metric.value.trim() || metric.unit.trim()
		);
		touchExercises();
		closePrModal();
		showToast('PR Updated');
	}

	function openDetailsModal(day, itemId) {
		if (Date.now() < suppressCardOpenUntil) return;
		selectedScheduleDay = day;
		selectedScheduleItemId = itemId;
		detailsModalOpen = true;

		const item = getScheduledItem(day, itemId);
		detailsDraftTargets = (item?.targets ?? []).map((target) => ({
			id: target.id,
			label: target.label ?? '',
			value: target.value ?? '',
			unit: target.unit ?? ''
		}));
	}

	function closeDetailsModal() {
		detailsModalOpen = false;
		selectedScheduleDay = '';
		selectedScheduleItemId = '';
		detailsDraftTargets = [];
	}

	function addDetail() {
		detailsDraftTargets = [...detailsDraftTargets, createTarget('', '', '')];
	}

	function removeDetail(targetId) {
		if (detailsDraftTargets.length <= 1) return;
		detailsDraftTargets = detailsDraftTargets.filter((target) => target.id !== targetId);
	}

	function updateDetail(targetId, field, value) {
		detailsDraftTargets = detailsDraftTargets.map((target) => {
			if (target.id !== targetId) return target;
			return { ...target, [field]: value };
		});
	}

	function saveDetailsModal() {
		if (!currentScheduleItem) return;

		currentScheduleItem.targets = detailsDraftTargets
			.filter((target) => target.label.trim() || target.value.trim() || target.unit.trim())
			.map((target) => ({ ...target, label: target.label || 'Metric' }));

		touchSchedule({ saveNow: true });
		closeDetailsModal();
		showToast('Details Updated');
	}

	function openGroupModal(day, groupId) {
		if (Date.now() < suppressCardOpenUntil) return;
		selectedGroupDay = day;
		selectedGroupId = groupId;
		groupModalOpen = true;
	}

	function closeGroupModal() {
		groupModalOpen = false;
		selectedGroupDay = '';
		selectedGroupId = '';
	}

	function updateGroupSets(value) {
		if (!currentGroup) return;
		currentGroup.sets = value;
		touchSchedule();
	}

	function saveGroupModal() {
		if (!currentGroup) return;
		currentGroup.sets = currentGroup.sets?.trim() || '3';
		touchSchedule({ saveNow: true });
		closeGroupModal();
		showToast('Group Updated');
	}

	function addExerciseToDay(day, exerciseId, index = null) {
		const entry = createScheduleExercise(exerciseId, []);
		const list = schedule[day];

		if (index === null || index >= list.length) list.push(entry);
		else list.splice(index, 0, entry);

		touchSchedule({ saveNow: true });
		showToast(`Added To ${day}`);
	}

	function addGroupToDay(day) {
		schedule[day] = [...schedule[day], createExerciseGroup('3')];
		touchSchedule({ saveNow: true });
		showToast('Group Added');
	}

	function addExerciseToGroup(day, groupId, exerciseId, index = null) {
		const group = getGroup(day, groupId);
		if (!group) return;

		const entry = createScheduleExercise(exerciseId, [createTarget('Reps', '', '')]);

		if (index === null || index >= group.exercises.length) group.exercises.push(entry);
		else group.exercises.splice(index, 0, entry);

		touchSchedule({ saveNow: true });
		showToast('Added To Group');
	}

	function deleteScheduled(day, itemId) {
		const found = findScheduledEntry(day, itemId);
		if (!found) return;

		found.parent.splice(
			found.parent.findIndex((entry) => entry.id === itemId),
			1
		);

		touchSchedule({ saveNow: true });
		showToast('Removed From Schedule');
	}

	function moveScheduled(sourceDay, targetDay, itemId, targetIndex) {
		const found = findScheduledEntry(sourceDay, itemId);
		if (!found) return;

		const sourceIndex = found.parent.findIndex((entry) => entry.id === itemId);
		if (sourceIndex < 0) return;

		const [item] = found.parent.splice(sourceIndex, 1);
		const safeIndex = Math.max(0, Math.min(targetIndex, schedule[targetDay].length));
		schedule[targetDay].splice(safeIndex, 0, item);
		touchSchedule({ saveNow: true });
	}

	function moveScheduledIntoGroup(sourceDay, targetDay, groupId, itemId, targetIndex = null) {
		const found = findScheduledEntry(sourceDay, itemId);
		const group = getGroup(targetDay, groupId);
		if (!found || !group || found.item.id === groupId) return;

		const sourceIndex = found.parent.findIndex((entry) => entry.id === itemId);
		if (sourceIndex < 0) return;

		const [item] = found.parent.splice(sourceIndex, 1);
		const safeIndex =
			targetIndex === null ? group.exercises.length : Math.max(0, Math.min(targetIndex, group.exercises.length));

		group.exercises.splice(safeIndex, 0, item);
		touchSchedule({ saveNow: true });
	}

	function toggleDrawer() {
		if (Date.now() < drawerSuppressClickUntil) return;
		snapDrawer(!drawerOpen);
	}

	function snapDrawer(open) {
		if (!open) removeEmptyGroups();
		drawerOpen = open;
		drawerProgress = open ? 1 : 0;
	}

	function startDrawerDrag(event) {
		event.preventDefault();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		const computedTravel = plannerLayoutEl
			? Number.parseFloat(window.getComputedStyle(plannerLayoutEl).getPropertyValue('--drawer-travel'))
			: NaN;
		const extent = Number.isFinite(computedTravel) && computedTravel > 0
			? computedTravel
			: (isNarrowViewport ? drawerHeight : drawerWidth);

		drawerDrag = {
			pointerId: event.pointerId,
			startCoord: isNarrowViewport ? event.clientY : event.clientX,
			extent,
			startProgress: drawerProgress,
			didMove: false
		};
	}

	function moveDrawerDrag(event) {
		if (!drawerDrag || drawerDrag.pointerId !== event.pointerId) return;

		const pointerCoord = isNarrowViewport ? event.clientY : event.clientX;
		const delta = pointerCoord - drawerDrag.startCoord;
		if (Math.abs(delta) > 6) drawerDrag.didMove = true;
		drawerProgress = Math.max(0, Math.min(1, drawerDrag.startProgress + delta / drawerDrag.extent));
	}

	function finishDrawerDrag(event) {
		if (!drawerDrag || drawerDrag.pointerId !== event.pointerId) return;

		if (!drawerDrag.didMove) {
			drawerDrag = null;
			return;
		}

		const shouldOpen = drawerProgress >= 0.5;
		drawerDrag = null;
		drawerSuppressClickUntil = Date.now() + 180;
		snapDrawer(shouldOpen);
	}

	function startDrag(event, type, payload) {
		if (type === 'library' && !drawerOpen) return;

		const sourceElement = event.currentTarget.closest('[data-drag-source]');
		if (!sourceElement) {
			dndLog('startDrag:missing-source', {
				type,
				pointerId: event.pointerId,
				targetClass: event.currentTarget?.className
			});
			return;
		}

		event.preventDefault();
		event.currentTarget.setPointerCapture?.(event.pointerId);

		dragState = {
			type,
			...payload,
			pointerId: event.pointerId
		};

		dndLog('startDrag', {
			type,
			pointerId: event.pointerId,
			drawerOpen,
			payload,
			sourceTag: sourceElement.tagName,
			sourceClass: sourceElement.className
		});

		createGhost(sourceElement, event.clientX, event.clientY);
		sourceElement.classList.add('dragging');
	}

	function createGhost(sourceElement, pointerX, pointerY) {
		removeGhost();

		const rect = sourceElement.getBoundingClientRect();
		const offsetX = pointerX - rect.left;
		const offsetY = pointerY - rect.top;

		ghost = document.createElement('div');
		ghost.className = 'drag-preview';
		ghost.style.width = `${rect.width}px`;
		ghost.style.height = `${rect.height}px`;
		ghost.style.position = 'fixed';
		ghost.style.left = '0px';
		ghost.style.top = '0px';
		ghost.style.margin = '0';
		ghost.style.pointerEvents = 'none';
		ghost.style.zIndex = '10000';
		ghost.style.willChange = 'transform';
		ghost.dataset.offsetX = String(offsetX);
		ghost.dataset.offsetY = String(offsetY);

		const clone = sourceElement.cloneNode(true);
		clone.classList.remove('dragging');
		const sourceStyle = window.getComputedStyle(sourceElement);
		const copiedProps = [
			'grid-template-columns',
			'grid-template-rows',
			'align-items',
			'justify-items',
			'gap',
			'padding',
			'border',
			'border-radius',
			'background',
			'box-shadow',
			'color',
			'font',
			'line-height',
			'text-align'
		];
		for (const prop of copiedProps) {
			clone.style.setProperty(prop, sourceStyle.getPropertyValue(prop));
		}
		clone.style.display = sourceStyle.display || 'block';
		clone.style.width = '100%';
		clone.style.height = '100%';
		clone.style.margin = '0';
		ghost.appendChild(clone);

		document.body.appendChild(ghost);
		moveGhost(pointerX, pointerY);
		dndLog('createGhost', {
			pointerX,
			pointerY,
			width: rect.width,
			height: rect.height,
			offsetX,
			offsetY
		});
	}

	function moveGhost(pointerX, pointerY) {
		if (!ghost) return;
		const offsetX = Number(ghost.dataset.offsetX || 0);
		const offsetY = Number(ghost.dataset.offsetY || 0);
		const nextX = Math.round(pointerX - offsetX);
		const nextY = Math.round(pointerY - offsetY);
		ghost.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
	}

	function removeGhost() {
		if (ghost) ghost.remove();
		ghost = null;
	}

	function handlePointerMove(event) {
		moveScheduleViewDrag(event);
		moveDrawerDrag(event);

		if (!dragState || dragState.pointerId !== event.pointerId) return;

		event.preventDefault();
		moveGhost(event.clientX, event.clientY);

		const zone = getDropZone(event.clientX, event.clientY);
		clearMarkers();

		if (!zone) return;

		if (zone.dataset.dropType === 'group' && dragState.type === 'group') return;
		if (zone.dataset.dropType === 'drawer-remove' && dragState.type === 'library') return;

		renderDropMarker(zone, event.clientX, event.clientY);
	}

	function handlePointerUp(event) {
		endScheduleViewDrag(event);
		finishDrawerDrag(event);

		if (!dragState || dragState.pointerId !== event.pointerId) return;
		suppressCardOpenUntil = Date.now() + 220;

		const drag = { ...dragState };
		const zone = getDropZone(event.clientX, event.clientY);
		const index = zone ? getDropIndex(zone, event.clientX, event.clientY) : null;
		if (zone) {
			const computed = window.getComputedStyle(zone);
		} else {
		}
		dndLog('pointerUp', {
			type: drag.type,
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			zoneDay: zone?.dataset?.day ?? null,
			zoneType: zone?.dataset?.dropType ?? 'day',
			dropIndex: index
		});

		cleanupDrag();

		if (!zone) return;

		const targetDay = zone.dataset.day;
		const targetGroupId = zone.dataset.groupId;
		const zoneType = zone.dataset.dropType ?? 'day';
		const isGroupZone = zoneType === 'group';

		if (zoneType === 'drawer-remove') {
			if (drag.type === 'scheduled') deleteScheduled(drag.sourceDay, drag.itemId);
			else if (drag.type === 'group') deleteScheduled(drag.sourceDay, drag.groupId);
			return;
		}

		if (drag.type === 'library' && isGroupZone) addExerciseToGroup(targetDay, targetGroupId, drag.exerciseId, index);
		else if (drag.type === 'library') addExerciseToDay(targetDay, drag.exerciseId, index);
		else if (drag.type === 'scheduled' && isGroupZone)
			moveScheduledIntoGroup(drag.sourceDay, targetDay, targetGroupId, drag.itemId, index);
		else if (drag.type === 'scheduled') moveScheduled(drag.sourceDay, targetDay, drag.itemId, index);
		else if (drag.type === 'group' && !isGroupZone) moveScheduled(drag.sourceDay, targetDay, drag.groupId, index);
	}

	function cleanupDrag() {
		document.querySelectorAll('.dragging').forEach((element) => element.classList.remove('dragging'));
		clearMarkers();
		removeGhost();
		dndLog('cleanupDrag');
		dragState = null;
	}

	function getDropZone(pointerX, pointerY) {
		if (ghost) ghost.style.display = 'none';
		const element = document.elementFromPoint(pointerX, pointerY);
		if (ghost) ghost.style.display = '';
		if (!element) dndLog('getDropZone:no-element', { pointerX, pointerY });
		return element?.closest('[data-drop-zone]') ?? null;
	}

	function clearMarkers() {
		const markers = document.querySelectorAll('.drop-marker');
		const activeZones = document.querySelectorAll('.drag-active');
		markers.forEach((marker) => marker.remove());
		activeZones.forEach((zone) => zone.classList.remove('drag-active'));
		document
			.querySelectorAll('.panel-body.drawer-body.drawer-drop-zone')
			.forEach((element) => {
				element.classList.remove('drawer-drop-zone');
				element.style.removeProperty('outline');
				element.style.removeProperty('outline-offset');
				element.style.removeProperty('background');
				element.style.removeProperty('box-shadow');
			});
		document
			.querySelectorAll('.drawer-scroll-viewport.drag-active-drop')
			.forEach((element) => element.classList.remove('drag-active-drop'));
	}

	function renderDropMarker(zone, pointerX, pointerY) {
		if (
			zone.dataset.dropType === 'drawer-remove' ||
			zone.classList.contains('empty') ||
			zone.classList.contains('group-empty')
		) {
			zone.classList.add('drag-active');
			if (zone.dataset.dropType === 'drawer-remove') {
				zone.classList.add('drawer-drop-zone');
				zone.style.outline = '2px dashed color-mix(in srgb, var(--shell-spotlight-primary) 52%, transparent)';
				zone.style.outlineOffset = '-8px';
				zone.style.background = 'color-mix(in srgb, var(--shell-spotlight-primary) 10%, transparent)';
				zone.style.boxShadow = 'inset 0 0 0 2px color-mix(in srgb, var(--shell-spotlight-primary) 14%, transparent)';
				zone.querySelector('.drawer-scroll-viewport')?.classList.add('drag-active-drop');
			}
			return;
		}

		const marker = document.createElement('div');
		marker.className = 'drop-marker';
		const items = getDropItems(zone);

		if (!items.length) marker.classList.add('empty-drop-marker');

		const index = getDropIndex(zone, pointerX, pointerY);
		const next = items[index] ?? null;
		marker.dataset.dropIndex = String(index);
		zone.classList.add('drag-active');

		if (next && next.parentNode === zone) zone.insertBefore(marker, next);
		else zone.appendChild(marker);
	}

	function getDropItems(zone) {
		return [...zone.children].filter((child) => {
			if (
				child.classList.contains('drop-marker') ||
				child.classList.contains('empty') ||
				child.classList.contains('add-group-btn') ||
				child.classList.contains('group-empty')
			) {
				return false;
			}

			return child.matches('[data-drag-source]');
		});
	}

	function getDropIndex(zone, pointerX, pointerY) {
		const items = getDropItems(zone);
		const horizontal = scheduleView === 'weekly';

		if (!horizontal) {
			const next = items.find((item) => {
				const rect = item.getBoundingClientRect();
				return pointerY <= rect.top + rect.height / 2;
			});

			return next ? items.indexOf(next) : items.length;
		}

		const next = items.find((item) => {
			const rect = item.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			const midX = rect.left + rect.width / 2;
			return pointerY < midY || (pointerY <= rect.bottom && pointerX <= midX);
		});

		return next ? items.indexOf(next) : items.length;
	}

	function closeAllModals() {
		prModalOpen = false;
		detailsModalOpen = false;
		groupModalOpen = false;
		confirmDeleteOpen = false;
	}

	function escapeKey(event) {
		if (event.key === 'Escape') {
			closeUserMenu();
			closeAllModals();
		}
	}
</script>

<svelte:head>
	<title>Workouts</title>
</svelte:head>

<svelte:window on:click={closeUserMenu} on:keydown={escapeKey} on:pointermove={handlePointerMove} on:pointerup={handlePointerUp} />

{#if themeReady}
	<main class="page-shell">
		<ShellTopbar
			title="Workouts"
			initials={userInitials}
			isMenuOpen={isUserMenuOpen}
			userName={userFullName}
			userMeta={user?.email ? `Signed in as ${user.email}` : ''}
			onToggleMenu={toggleUserMenu}
			onManageAccount={manageAccount}
			onLogout={logOut}
		/>

		<section class="workout-app" aria-label="Workout planner">
			<aside class="app-tabs" aria-label="Workout navigation" use:observeTabPanel>

				<nav class="tab-list" aria-label="Workout sections">
					<button class:active={activeTab === 'library'} type="button" on:click={() => (activeTab = 'library')}>
						Library
					</button>
					<button class:active={activeTab === 'schedule'} type="button" on:click={openScheduleTab}>
						Schedule
					</button>
				</nav>
			</aside>

			<section class="app-content">
				{#if activeTab === 'library'}
					<header class="page-header">
						<div>
							<h2>Exercise Library</h2>
						</div>
					</header>

					<div class="library-grid">
						<section class="panel">
							<div class="panel-body">
								<form class="form" on:submit|preventDefault={addExercise}>
									<div class="field">
										<label for="exerciseName">Exercise Name</label>
										<input id="exerciseName" bind:value={exerciseName} placeholder="Bench Press" />
									</div>

									<div class="field">
										<label>Category</label>
										<div class="custom-select" class:open={categoryPopoverOpen}>
											<button
												class="select-trigger"
												type="button"
												on:click={() => (categoryPopoverOpen = !categoryPopoverOpen)}
											>
												<span>{exerciseCategory}</span>
												<span class="select-chevron">⌄</span>
											</button>

											{#if categoryPopoverOpen}
												<div class="select-options">
													{#each categories as category}
														<button
															type="button"
															class="select-option"
															on:click={() => {
																exerciseCategory = category;
																categoryPopoverOpen = false;
															}}
														>
															{category}
														</button>
													{/each}
												</div>
											{/if}
										</div>
									</div>

									<button class="btn primary" type="submit">Add Exercise</button>
								</form>
							</div>
						</section>

						<section class="panel library-list-panel">
							<div class="panel-body library-list-body">
								<div class="library-scroll-viewport" use:observeLibraryBody on:scroll={updateLibraryScrollbar}>
									<div class="exercise-list">
									{#each sortedExercises as exercise}
										<article
											class="exercise-row is-clickable"
											role="button"
											tabindex="0"
											on:click={() => openPrModal(exercise.id)}
											on:keydown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') openPrModal(exercise.id);
											}}
										>
											<div class="exercise-main">
												<div class="exercise-name">
													{exercise.name}
													<span class="exercise-type">- {exercise.category}</span>
												</div>

												<div class="metric-chip-row library-prs">
													{#if exercise.metrics.length}
														{#each exercise.metrics as metric}
															<span class="card-chip pr-chip">{metricText(metric)}</span>
														{/each}
													{:else}
														<span class="card-chip pr-chip">No PR Recorded</span>
													{/if}
												</div>
											</div>

											<div class="row-actions">
												<button
													class="btn danger small icon-btn"
													type="button"
													aria-label="Delete Exercise"
													title="Delete Exercise"
													on:click|stopPropagation={() => requestDeleteExercise(exercise.id)}
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
													>
														<path d="M3 6h18" />
														<path d="M8 6V4h8v2" />
														<path d="M19 6l-1 14H6L5 6" />
														<path d="M10 11v5" />
														<path d="M14 11v5" />
													</svg>
												</button>
											</div>
										</article>
									{/each}
									</div>
								</div>
								{#if libraryHasOverflow}
									<div class="library-scrollbar" bind:this={libraryTrackEl} aria-hidden="true">
										<div
											class="library-scrollbar-thumb"
											style={`height:${libraryThumbHeight}px; transform:translateY(${libraryThumbTop}px);`}
											on:pointerdown={(event) => startScrollbarThumbDrag(event, 'library')}
											on:pointermove={(event) => handleScrollbarThumbDrag(event, 'library')}
											on:pointerup={(event) => endScrollbarThumbDrag(event, 'library')}
											on:pointercancel={(event) => endScrollbarThumbDrag(event, 'library')}
										></div>
									</div>
								{/if}
							</div>
						</section>
					</div>
				{:else}
					<div class="schedule-pane" class:drawer-dragging={drawerDrag} style={`--drawer-progress:${drawerProgress}; --drawer-width:${drawerWidth}px; --drawer-height:${drawerHeight}px;`}>
						<header class="page-header">
							<div>
								<h2>Schedule</h2>
							</div>

							<div class="schedule-header-actions">
								<div
									class="schedule-view-toggle"
									class:schedule-view-dragging={!!scheduleViewDrag}
									role="group"
									aria-label="Schedule view"
									bind:this={scheduleToggleEl}
									style={`--schedule-view-progress:${scheduleViewSliderProgress};`}
									on:pointerdown={startScheduleViewDrag}
									on:pointermove={moveScheduleViewDrag}
									on:pointerup={endScheduleViewDrag}
									on:pointercancel={endScheduleViewDrag}
								>
									<span class="schedule-view-slider" aria-hidden="true"></span>
									<button
										class="schedule-view-option"
										class:active={scheduleViewSliderProgress < 0.5}
										type="button"
										aria-pressed={scheduleView === 'daily'}
										on:click={() => handleScheduleViewOptionClick('daily')}
									>
										Daily
									</button>
									<button
										class="schedule-view-option"
										class:active={scheduleViewSliderProgress >= 0.5}
										type="button"
										aria-pressed={scheduleView === 'weekly'}
										on:click={() => handleScheduleViewOptionClick('weekly')}
									>
										Weekly
									</button>
								</div>
							</div>
						</header>

						<div
							class="planner-layout"
							use:observePlannerTop
							bind:this={plannerLayoutEl}
							class:view-mode={!drawerOpen}
							class:drawer-dragging={drawerDrag}
							style={`--drawer-progress:${drawerProgress}; --drawer-width:${drawerWidth}px; --drawer-height:${drawerHeight}px; --tab-panel-height:${tabPanelHeight}px; --planner-top-offset:${plannerTopOffset}px;`}
						>
						<section
							class="panel drawer-panel"
							aria-label="Exercise drawer"
						>
							<div class="panel-head">
								<h3>Exercises</h3>
							</div>

							<div class="panel-body drawer-body" data-drop-zone data-drop-type="drawer-remove">
								<div class="drawer-scroll-viewport" use:observeDrawerBody on:scroll={updateDrawerScrollbar}>
									<div class="drawer-list">
										{#each sortedExercises as exercise}
											<article class="exercise-row" data-drag-source>
												<div class="exercise-main">
													<div class="exercise-name">
														{exercise.name}
														<span class="exercise-type">- {exercise.category}</span>
													</div>
												</div>

												<div class="row-actions">
													<span
														class="handle"
														role="button"
														tabindex="0"
														title="Drag Exercise"
														on:pointerdown={(event) =>
															startDrag(event, 'library', { exerciseId: exercise.id })}
													>
														⋮⋮
													</span>
												</div>
											</article>
										{/each}
									</div>
								</div>
								{#if drawerHasOverflow}
									<div class="drawer-scrollbar" bind:this={drawerTrackEl} aria-hidden="true">
										<div
											class="drawer-scrollbar-thumb"
											style={`height:${drawerThumbHeight}px; transform:translateY(${drawerThumbTop}px);`}
											on:pointerdown={(event) => startScrollbarThumbDrag(event, 'drawer')}
											on:pointermove={(event) => handleScrollbarThumbDrag(event, 'drawer')}
											on:pointerup={(event) => endScrollbarThumbDrag(event, 'drawer')}
											on:pointercancel={(event) => endScrollbarThumbDrag(event, 'drawer')}
										></div>
									</div>
								{/if}
							</div>

							<button
								class="drawer-handle"
								type="button"
								aria-label={drawerOpen ? 'Close Exercise Drawer' : 'Open Exercise Drawer'}
								aria-expanded={drawerOpen}
								on:click={toggleDrawer}
								on:pointerdown={startDrawerDrag}
							>
								<span class="drawer-grip" aria-hidden="true">⠿</span>
							</button>
						</section>

						<section class="panel schedule-panel">
							<div class="panel-body schedule-body">
								<div class="schedule-scroll-viewport" use:observeScheduleBody on:scroll={updateScheduleScrollbar}>
									<div class="schedule-scroll-content">
								{#if scheduleView === 'daily'}
									<div class="day-selector-wrap">
										<div
											class="day-selector"
											class:fade-start={daySelectorFadeStart}
											class:fade-end={daySelectorFadeEnd}
											aria-label="Select day of week"
										>
												<div
													class="day-selector-track"
													class:day-selector-pointer-dragging={(daySelectorDrag && daySelectorDrag.moved) || daySelectorMomentumActive}
													bind:this={daySelectorTrack}
													on:scroll={handleDaySelectorScroll}
													on:pointerdown={handleDaySelectorPointerDown}
													on:pointermove={handleDaySelectorPointerMove}
													on:pointerup={handleDaySelectorPointerUp}
													on:pointercancel={handleDaySelectorPointerCancel}
													on:click|capture={handleDaySelectorClickCapture}
												>
													<div class="day-select-spacer" aria-hidden="true"></div>
													{#each days as day}
														<button
															class="day-select-btn"
															class:active={liveCenteredDay === day}
															data-day={day}
															type="button"
															aria-pressed={liveCenteredDay === day}
															on:click={() => selectDay(day)}
														>
														<span class="day-select-name">{day.slice(0, 3)}</span>
														<span class="day-select-count">
															{dayItemCounts[day]} Item{dayItemCounts[day] === 1 ? '' : 's'}
														</span>
														</button>
													{/each}
													<div class="day-select-spacer" aria-hidden="true"></div>
												</div>
										</div>
									</div>
								{/if}

									<div class="week-grid" class:full-week={scheduleView === 'weekly'}>
										{#each scheduleView === 'weekly' ? days : [safeSelectedDay] as day}
										<section class="day" class:daily-focus={scheduleView === 'daily'} data-day={day}>
											{#if scheduleView === 'weekly'}
												<div class="day-head">
													<span class="day-name">{day}</span>
													<span class="day-total">{schedule[day].length}</span>
												</div>
											{/if}

											<div class="drop-zone" data-drop-zone data-day={day}>
												<button class="btn secondary add-group-btn" type="button" on:click={() => addGroupToDay(day)}>
													+ Add Group
												</button>

												{#if schedule[day].length}
													{#each schedule[day] as entry}
														{#if entry.type === 'group'}
															<article class="exercise-group-card" data-drag-source>
																<div
																	class="group-head"
																	role="button"
																	tabindex="0"
																	on:click={() => openGroupModal(day, entry.id)}
																>
																	<span class="card-controls group-drag-control">
																		<span
																			class="handle"
																			title="Drag Group"
																			on:pointerdown={(event) =>
																				startDrag(event, 'group', { sourceDay: day, groupId: entry.id })}
																		>
																			⋮⋮
																		</span>
																	</span>
																	<span class="group-title">{entry.sets || '3'} Sets</span>
																</div>

																<div
																	class="group-drop-zone"
																	data-drop-zone
																	data-drop-type="group"
																	data-day={day}
																	data-group-id={entry.id}
																>
																	{#if entry.exercises.length}
																		{#each entry.exercises as groupExercise}
																			<article
																				class="workout-card"
																				data-drag-source
																				role="button"
																				tabindex="0"
																				on:click={() => openDetailsModal(day, groupExercise.id)}
																			>
																				<span class="card-controls">
																					<span
																						class="handle"
																						title="Drag Exercise"
																						on:pointerdown={(event) =>
																							startDrag(event, 'scheduled', {
																								sourceDay: day,
																								itemId: groupExercise.id
																							})}
																					>
																						⋮⋮
																					</span>
																				</span>
																				<div class="card-data">
																					<div class="workout-title">
																						{getExercise(groupExercise.exerciseId)?.name ?? 'Unknown Exercise'}
																					</div>
																					{#if groupExercise.targets?.length}
																						<div class="metric-group">
																							<div class="metric-chip-row">
																								{#each groupExercise.targets as target}
																									<span class="card-chip target-chip">{targetText(target)}</span>
																								{/each}
																							</div>
																						</div>
																					{/if}
																				</div>
																			</article>
																		{/each}
																	{/if}
																</div>
															</article>
														{:else}
															<article
																class="workout-card"
																data-drag-source
																role="button"
																tabindex="0"
																on:click={() => openDetailsModal(day, entry.id)}
															>
																<span class="card-controls">
																	<span
																		class="handle"
																		title="Drag Exercise"
																		on:pointerdown={(event) =>
																			startDrag(event, 'scheduled', { sourceDay: day, itemId: entry.id })}
																	>
																		⋮⋮
																	</span>
																</span>
																<div class="card-data">
																	<div class="workout-title">{getExercise(entry.exerciseId)?.name ?? 'Unknown Exercise'}</div>
																	{#if entry.targets?.length}
																		<div class="metric-group">
																			<div class="metric-chip-row">
																				{#each entry.targets as target}
																					<span class="card-chip target-chip">{targetText(target)}</span>
																				{/each}
																			</div>
																		</div>
																	{/if}
																</div>
															</article>
														{/if}
													{/each}
												{:else if !drawerOpen}
													<article class="rest-card" aria-label="Rest day">
														<div class="rest-title">Rest</div>
													</article>
												{/if}
											</div>
										</section>
										{/each}
								</div>
								</div>
								</div>
								{#if scheduleHasOverflow}
									<div class="schedule-scrollbar" bind:this={scheduleTrackEl} aria-hidden="true">
										<div
											class="schedule-scrollbar-thumb"
											style={`height:${scheduleThumbHeight}px; transform:translateY(${scheduleThumbTop}px);`}
											on:pointerdown={(event) => startScrollbarThumbDrag(event, 'schedule')}
											on:pointermove={(event) => handleScrollbarThumbDrag(event, 'schedule')}
											on:pointerup={(event) => endScrollbarThumbDrag(event, 'schedule')}
											on:pointercancel={(event) => endScrollbarThumbDrag(event, 'schedule')}
										></div>
									</div>
								{/if}
							</div>
						</section>
						</div>
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

{#if prModalOpen && currentExercise}
	<div class="modal-backdrop open" aria-hidden="false" on:pointerdown={(event) => event.target === event.currentTarget && closePrModal()}>
		<div class="modal" role="dialog" aria-modal="true">
			<div class="modal-head">
				<div>
					<h3>{currentExercise.name} - PR</h3>
				</div>
				<button class="close" type="button" aria-label="Close" on:click={closePrModal}>×</button>
			</div>

			<form class="modal-body form" on:submit|preventDefault={savePrModal}>
				<div class="metric-builder">
					{#each currentExercise.metrics as metric, index}
						<div class="metric-row">
							<div>
								{#if index === 0}<div class="metric-label">Metric</div>{/if}
								<input
									value={metric.name}
									placeholder="Metric"
									on:input={(event) => updatePrMetric(metric.id, 'name', event.currentTarget.value)}
								/>
							</div>
							<div>
								{#if index === 0}<div class="metric-label">Value</div>{/if}
								<input
									value={metric.value}
									placeholder="Value"
									on:input={(event) => updatePrMetric(metric.id, 'value', event.currentTarget.value)}
								/>
							</div>
							<div>
								{#if index === 0}<div class="metric-label">Unit</div>{/if}
								<input
									value={metric.unit}
									placeholder="Unit"
									on:input={(event) => updatePrMetric(metric.id, 'unit', event.currentTarget.value)}
								/>
							</div>
							<div class="metric-remove-slot" class:is-hidden={index === 0}>
								<button class="btn secondary small" type="button" title="Remove Metric" on:click={() => removePrMetric(metric.id)}>
									×
								</button>
							</div>
						</div>
					{/each}
				</div>

				<button class="btn secondary small add-metric-wide" type="button" on:click={addPrMetric}>
					+ Add Another Metric
				</button>
				<button class="btn primary" type="submit">Save PR</button>
			</form>
		</div>
	</div>
{/if}

{#if detailsModalOpen && currentScheduleItem}
	<div
		class="modal-backdrop open"
		aria-hidden="false"
		on:pointerdown={(event) => event.target === event.currentTarget && closeDetailsModal()}
	>
		<div class="modal" role="dialog" aria-modal="true">
			<div class="modal-head">
				<div>
					<h3>
						{getExercise(currentScheduleItem.exerciseId)?.name ?? 'Exercise'} - Details
					</h3>
				</div>
				<button class="close" type="button" aria-label="Close" on:click={closeDetailsModal}>×</button>
			</div>

			<form class="modal-body form" on:submit|preventDefault={saveDetailsModal}>
				<div class="metric-builder">
					{#each detailsDraftTargets as target, index}
						<div class="target-edit-row">
							<div>
								{#if index === 0}<div class="target-label">Metric</div>{/if}
								<input
									value={target.label}
									placeholder="Metric"
									on:input={(event) => updateDetail(target.id, 'label', event.currentTarget.value)}
								/>
							</div>
							<div>
								{#if index === 0}<div class="target-label">Value</div>{/if}
								<input
									value={target.value}
									placeholder="Value"
									on:input={(event) => updateDetail(target.id, 'value', event.currentTarget.value)}
								/>
							</div>
							<div>
								{#if index === 0}<div class="target-label">Unit</div>{/if}
								<input
									value={target.unit}
									placeholder="Unit"
									on:input={(event) => updateDetail(target.id, 'unit', event.currentTarget.value)}
								/>
							</div>
							<span class="target-remove-slot" class:is-hidden={index === 0}>
								<button class="btn secondary small" type="button" on:click={() => removeDetail(target.id)}>×</button>
							</span>
						</div>
					{/each}
				</div>

				<button class="btn secondary small add-target-btn" type="button" on:click={addDetail}>+ Add Detail</button>
				<button class="btn primary" type="submit">Save Details</button>
			</form>
		</div>
	</div>
{/if}

{#if groupModalOpen && currentGroup}
	<div class="modal-backdrop open" aria-hidden="false" on:pointerdown={(event) => event.target === event.currentTarget && closeGroupModal()}>
		<div class="modal" role="dialog" aria-modal="true">
			<div class="modal-head">
				<div>
					<h3>Group Details</h3>
				</div>
				<button class="close" type="button" aria-label="Close" on:click={closeGroupModal}>×</button>
			</div>

			<form class="modal-body form" on:submit|preventDefault={saveGroupModal}>
				<div class="field">
					<label for="groupSets">Sets</label>
					<input
						id="groupSets"
						value={currentGroup.sets}
						inputmode="numeric"
						placeholder="3"
						on:input={(event) => updateGroupSets(event.currentTarget.value)}
					/>
				</div>

				<button class="btn primary" type="submit">Save Group</button>
			</form>
		</div>
	</div>
{/if}

{#if confirmDeleteOpen}
	<div
		class="modal-backdrop open"
		aria-hidden="false"
		on:pointerdown={(event) => event.target === event.currentTarget && (confirmDeleteOpen = false)}
	>
		<div class="modal confirm-modal" role="dialog" aria-modal="true">
			<div class="modal-head">
				<div>
					<h3>Are You Sure?</h3>
					<p>Confirm exercise deletion.</p>
				</div>
				<button class="close" type="button" aria-label="Close" on:click={() => (confirmDeleteOpen = false)}>×</button>
			</div>

			<div class="modal-body confirm-body">
				<p class="confirm-message">
					{#each confirmDeleteMessage as sentence}
						<span>{sentence}</span>
					{/each}
				</p>

				<div class="confirm-actions">
					<button class="btn secondary" type="button" on:click={() => (confirmDeleteOpen = false)}>Cancel</button>
					<button class="btn danger" type="button" on:click={() => deleteExercise(confirmDeleteExerciseId)}>
						Delete Exercise
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if toastMessage}
	<div class="toast">{toastMessage}</div>
{/if}

<svelte:component
	this={null}
/>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body.shell-theme) {
		overflow-x: hidden;
	}

	.page-shell {
		--viewport-bottom-gap: 24px;
		height: 100vh;
		height: 100dvh;
		padding-bottom: var(--viewport-bottom-gap);
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.page-shell :global(.user-menu-shell) {
		z-index: 20001;
	}

	.page-shell :global(.user-menu) {
		z-index: 2147483647;
		background: var(--shell-bg-base);
		backdrop-filter: none;
	}

	.page-shell :global(.user-menu::before) {
		background: var(--shell-bg-base);
	}

	.workout-app {
		/* Layering: body (darkest) -> content/drawer -> panel/card foreground -> tabs (lightest) */
		--surface-0: color-mix(in srgb, var(--shell-bg-base) 50%, black 50%);
		--surface-1: color-mix(in srgb, var(--shell-bg-base) 68%, black 32%);
		--surface-2: color-mix(in srgb, var(--shell-bg-base) 90%, black 10%);
		--surface-3: color-mix(in srgb, var(--shell-bg-base) 96%, white 4%);
		width: 100%;
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 172px minmax(0, 1fr);
		border: 1px solid var(--shell-border);
		border-radius: 28px;
		background: var(--surface-0);
		box-shadow: var(--shell-shadow);
		overflow: hidden;
	}

	.app-tabs {
		position: relative;
		z-index: 30;
		padding: 22px 16px;
		border-right: 1px solid var(--shell-border);
		background: var(--surface-3);
		box-shadow: 8px 0 22px rgba(0, 0, 0, 0.12);
		max-height: 100%;
		overflow: auto;
	}

	.brand-block {
		display: flex;
		justify-content: center;
		margin-bottom: 24px;
	}

	.brand-mark {
		width: 42px;
		height: 42px;
		border-radius: 16px;
		display: grid;
		place-items: center;
		font-weight: 950;
		background: color-mix(in srgb, var(--shell-spotlight-primary) 24%, transparent);
		border: 1px solid var(--shell-border);
	}

	.tab-list {
		display: grid;
		gap: 8px;
	}

	.tab-list button {
		height: 42px;
		border: 1px solid transparent;
		border-radius: 14px;
		background: transparent;
		color: var(--shell-text);
		font-weight: 850;
		cursor: pointer;
	}

	.tab-list button.active,
	.tab-list button:hover {
		border-color: var(--shell-border);
		background: color-mix(in srgb, var(--shell-spotlight-primary) 14%, transparent);
	}

	.app-content {
		--content-pad-x: 42px;
		min-width: 0;
		padding: 28px var(--content-pad-x);
		background: var(--surface-1);
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		margin-bottom: 20px;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		font-size: clamp(1.4rem, 2vw, 2rem);
		letter-spacing: -0.04em;
	}

	.panel {
		border: 1px solid var(--shell-border);
		border-radius: 20px;
		background: var(--surface-1);
		overflow: visible;
	}

	.panel-head {
		height: 58px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--shell-border);
		justify-content: center;
	}

	.panel-body {
		padding: 16px;
		background: var(--surface-2);
		border-radius: 20px;
	}

	.library-grid {
		display: grid;
		grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
		min-height: 0;
		height: max(0px, calc(100dvh - 250px));
	}

	.library-list-panel {
		min-height: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.library-list-body {
		position: relative;
		padding-right: 0;
		overflow: hidden;
		flex: 1;
		min-height: 0;
		max-height: none;
	}

	.library-scroll-viewport {
		height: 100%;
		overflow: auto;
		padding-right: 18px;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.library-scroll-viewport::-webkit-scrollbar {
		width: 0;
		height: 0;
	}

	.library-scrollbar {
		position: absolute;
		top: 20.5px;
		bottom: 20.5px;
		right: 6px;
		width: 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--shell-text) 14%, transparent);
		pointer-events: auto;
	}

	.library-scrollbar-thumb {
		width: 100%;
		border-radius: inherit;
		cursor: grab;
		touch-action: none;
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--shell-spotlight-primary) 78%, white 22%),
				color-mix(in srgb, var(--shell-spotlight-secondary) 72%, black 28%)
			);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--shell-border) 65%, transparent);
	}

	.library-list-body:hover .library-scrollbar-thumb {
		filter: brightness(1.08);
	}

	.form {
		display: grid;
		gap: 12px;
	}

	.field {
		display: grid;
		gap: 6px;
	}

	label,
	.metric-label,
	.target-label {
		font-size: 0.75rem;
		font-weight: 900;
		color: color-mix(in srgb, var(--shell-text) 62%, transparent);
		text-align: center;
	}

	input {
		width: 100%;
		height: 42px;
		padding: 0 11px;
		border: 1px solid var(--shell-border);
		border-radius: 12px;
		background: color-mix(in srgb, var(--shell-bg-base) 90%, black 10%);
		color: var(--shell-text);
		text-align: center;
		outline: none;
	}

	input:focus {
		border-color: var(--shell-spotlight-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--shell-spotlight-primary) 18%, transparent);
	}

	input:focus::placeholder {
		color: transparent;
	}

	.btn {
		border: 0;
		border-radius: 12px;
		height: 38px;
		padding: 0 14px;
		font-weight: 850;
		cursor: pointer;
		color: var(--shell-text);
		background: color-mix(in srgb, var(--shell-bg-base) 84%, white 16%);
	}

	.btn:hover {
		filter: brightness(1.05);
	}

	.btn.primary {
		color: white;
		background: var(--shell-spotlight-primary);
	}

	.btn.secondary {
		border: 1px solid var(--shell-border);
		background: color-mix(in srgb, var(--shell-bg-base) 90%, black 10%);
	}

	.btn.danger {
		color: #dc2626;
		background: color-mix(in srgb, #dc2626 12%, transparent);
		border: 1px solid color-mix(in srgb, #dc2626 28%, transparent);
	}

	.btn.small {
		height: 34px;
		font-size: 0.78rem;
	}

	.icon-btn {
		width: 34px;
		min-width: 34px;
		height: 34px;
		padding: 0;
		display: grid;
		place-items: center;
	}

	.icon-btn svg {
		width: 16px;
		height: 16px;
		stroke: currentColor;
	}

	.custom-select {
		position: relative;
		z-index: 5;
	}

	.select-trigger {
		width: 100%;
		height: 42px;
		border: 1px solid var(--shell-border);
		border-radius: 12px;
		background: color-mix(in srgb, var(--shell-bg-base) 90%, black 10%);
		color: var(--shell-text);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		cursor: pointer;
	}

	.select-trigger span:first-child {
		grid-column: 2;
	}

	.select-chevron {
		grid-column: 3;
		justify-self: end;
		padding-right: 10px;
	}

	.select-options {
		position: absolute;
		z-index: 100;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		padding: 6px;
		border: 1px solid var(--shell-border);
		border-radius: 14px;
		background: color-mix(in srgb, var(--shell-bg-base) 92%, black 8%);
		box-shadow: var(--shell-shadow);
	}

	.select-option {
		width: 100%;
		height: 34px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--shell-text);
		text-align: center;
		cursor: pointer;
	}

	.select-option:hover {
		background: color-mix(in srgb, var(--shell-spotlight-primary) 14%, transparent);
	}

	.exercise-list,
	.drawer-list {
		display: grid;
		gap: 8px;
	}

	.exercise-row {
		min-width: 0;
		padding: 10px;
		border: 1px solid var(--shell-border);
		border-radius: 14px;
		background: var(--surface-2);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
	}

	.exercise-row.is-clickable {
		cursor: pointer;
	}

	.exercise-name {
		font-weight: 900;
		text-align: center;
	}

	.exercise-type {
		font-weight: 500;
		color: color-mix(in srgb, var(--shell-text) 58%, transparent);
	}

	.row-actions {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.library-prs {
		margin-top: 6px;
		justify-content: center;
	}

	.planner-layout {
		position: relative;
		--drawer-progress: 0;
		--drawer-width: 260px;
		--drawer-size: var(--drawer-width);
		--drawer-handle-peek: 0px;
		--drawer-handle-gap: var(--content-pad-x);
		--drawer-outer-gap: 22px;
		--drawer-bottom-gap: 22px;
		--drawer-travel: calc(var(--drawer-size) - (2 * var(--drawer-handle-peek)));
		--drawer-reveal: calc(var(--drawer-handle-peek) + (var(--drawer-progress) * var(--drawer-travel)));
		min-height: 0;
	}

	.drawer-panel {
		position: absolute;
		top: var(--drawer-outer-gap);
		height: max(
			0px,
			calc(
				var(--tab-panel-height, 0px) -
					var(--planner-top-offset, 0px) -
					var(--drawer-outer-gap) -
					var(--drawer-bottom-gap)
			)
		);
		margin: 0;
		left: calc(-1 * var(--drawer-size) - var(--drawer-handle-gap) + var(--drawer-reveal));
		z-index: 3;
		width: var(--drawer-size);
		transition: left 260ms cubic-bezier(0.16, 1, 0.3, 1);
		border-radius: 0 20px 20px 0;
		display: flex;
		flex-direction: column;
		overflow: visible;
		background: var(--surface-2);
	}

	.drawer-body {
		height: calc(100% - 58px);
		overflow: hidden;
		position: relative;
		padding-right: 0;
		isolation: isolate;
	}

	.drawer-scroll-viewport {
		height: 100%;
		overflow: auto;
		padding-right: 18px;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.drawer-scroll-viewport::-webkit-scrollbar {
		width: 0;
		height: 0;
	}

	.drawer-scrollbar {
		position: absolute;
		top: 20.5px;
		bottom: 20.5px;
		right: 6px;
		width: 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--shell-text) 14%, transparent);
		pointer-events: auto;
	}

	.drawer-scrollbar-thumb {
		width: 100%;
		border-radius: inherit;
		cursor: grab;
		touch-action: none;
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--shell-spotlight-primary) 78%, white 22%),
				color-mix(in srgb, var(--shell-spotlight-secondary) 72%, black 28%)
			);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--shell-border) 65%, transparent);
	}

	.drawer-body:hover .drawer-scrollbar-thumb {
		filter: brightness(1.08);
	}

	.drawer-handle {
		position: absolute;
		top: 50%;
		right: -22px;
		width: 22px;
		height: 74px;
		transform: translateY(-50%);
		border: 0;
		border-radius: 0 999px 999px 0;
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--shell-spotlight-primary) 78%, white 22%),
				color-mix(in srgb, var(--shell-spotlight-primary) 72%, black 28%)
			);
		color: rgba(255, 255, 255, 0.86);
		display: grid;
		place-items: center;
		cursor: grab;
		z-index: 31;
		overflow: hidden;
		isolation: isolate;
	}

	.drawer-handle::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--shell-spotlight-primary) 82%, white 18%),
				color-mix(in srgb, var(--shell-spotlight-secondary) 80%, black 20%)
			);
		transform: scaleY(0);
		transform-origin: bottom;
		transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
		z-index: 0;
	}

	.drawer-handle:hover {
		cursor: grab;
	}

	.drawer-dragging .drawer-handle {
		cursor: grabbing;
	}

	.drawer-dragging .drawer-handle * {
		cursor: grabbing !important;
	}

	.drawer-handle:hover::before,
	.drawer-dragging .drawer-handle::before {
		transform: scaleY(1);
	}

	.drawer-grip {
		font-size: 16px;
		line-height: 1;
		pointer-events: none;
		position: relative;
		z-index: 1;
	}

	.schedule-panel {
		position: relative;
		z-index: 12;
		height: max(0px, calc(var(--tab-panel-height, 0px) - var(--planner-top-offset, 0px)));
		min-height: 0;
		overflow: hidden;
		margin-left: 0;
	}

	.schedule-body {
		height: 100%;
		overflow: hidden;
		position: relative;
		padding-right: 0;
	}

	.schedule-scroll-viewport {
		height: 100%;
		overflow: auto;
		padding-right: 18px;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.schedule-scroll-content {
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	.schedule-scroll-viewport::-webkit-scrollbar {
		width: 0;
		height: 0;
	}

	.schedule-scrollbar {
		position: absolute;
		top: 20.5px;
		bottom: 20.5px;
		right: 6px;
		width: 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--shell-text) 14%, transparent);
		pointer-events: auto;
	}

	.schedule-scrollbar-thumb {
		width: 100%;
		border-radius: inherit;
		cursor: grab;
		touch-action: none;
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--shell-spotlight-primary) 78%, white 22%),
				color-mix(in srgb, var(--shell-spotlight-secondary) 72%, black 28%)
			);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--shell-border) 65%, transparent);
	}

	.schedule-body:hover .schedule-scrollbar-thumb {
		filter: brightness(1.08);
	}

	.drawer-dragging .schedule-panel {
		transition: none;
	}

	.drawer-dragging .drawer-panel {
		transition: none;
	}

	.panel-body.drawer-body.drag-active {
		background: color-mix(in srgb, var(--shell-spotlight-primary) 8%, var(--surface-2));
	}

	.panel-body.drawer-body.drag-active,
	.panel-body.drawer-body.drawer-drop-zone,
	.panel-body.drawer-body.drag-active .drawer-scroll-viewport,
	.drawer-scroll-viewport.drag-active-drop {
		background: color-mix(in srgb, var(--shell-spotlight-primary) 10%, transparent);
		border: 2px dashed color-mix(in srgb, var(--shell-spotlight-primary) 52%, transparent);
		border-radius: 12px;
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--shell-spotlight-primary) 14%, transparent);
	}

	.schedule-header-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.schedule-pane {
		min-height: 0;
		--drawer-size: var(--drawer-width, 260px);
		--drawer-handle-peek: 0px;
		--drawer-travel: calc(var(--drawer-size) - (2 * var(--drawer-handle-peek)));
		--drawer-reveal: calc(var(--drawer-handle-peek) + (var(--drawer-progress) * var(--drawer-travel)));
		--content-shift-x: calc(var(--drawer-reveal) - var(--drawer-handle-peek));
		--content-shift-y: 0px;
	}

	.schedule-pane > .page-header,
	.schedule-pane .schedule-panel {
		transform: translate(var(--content-shift-x), var(--content-shift-y));
		width: calc(100% - var(--content-shift-x));
		max-width: calc(100% - var(--content-shift-x));
		transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
		will-change: transform;
	}

		.schedule-pane.drawer-dragging > .page-header,
		.schedule-pane.drawer-dragging .schedule-panel,
		.schedule-pane.drawer-dragging .drawer-panel {
			transition: none;
		}

	.schedule-view-toggle {
		--toggle-pad: 5px;
		--toggle-gap: 6px;
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: center;
		gap: var(--toggle-gap);
		padding: var(--toggle-pad);
		min-width: 188px;
		border-radius: 999px;
		border: 1px solid var(--shell-border);
		background: color-mix(in srgb, var(--surface-2) 90%, black 10%);
		box-shadow: var(--shell-shadow);
		touch-action: none;
		user-select: none;
		cursor: grab;
	}

	.schedule-view-toggle.schedule-view-dragging {
		cursor: grabbing;
	}

	.schedule-view-toggle.schedule-view-dragging * {
		cursor: grabbing !important;
	}

	.schedule-view-slider {
		position: absolute;
		top: var(--toggle-pad);
		left: var(--toggle-pad);
		height: 32px;
		width: calc((100% - (2 * var(--toggle-pad)) - var(--toggle-gap)) / 2);
		border-radius: 999px;
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--shell-spotlight-primary) 24%, transparent),
				color-mix(in srgb, var(--shell-spotlight-secondary) 22%, transparent)
			),
			color-mix(in srgb, var(--surface-1) 82%, black 18%);
		border: 1px solid color-mix(in srgb, var(--shell-spotlight-primary) 36%, transparent);
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--shell-spotlight-primary) 20%, transparent),
			0 8px 18px color-mix(in srgb, var(--shell-spotlight-primary) 12%, transparent);
		transform: translateX(calc(var(--schedule-view-progress, 0) * (100% + var(--toggle-gap))));
		transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
		pointer-events: none;
	}

	.schedule-view-option {
		height: 32px;
		width: 100%;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: color-mix(in srgb, var(--shell-text) 74%, transparent);
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.02em;
		transition: background 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease,
			transform 120ms ease;
		position: relative;
		z-index: 1;
		cursor: pointer;
	}

	.schedule-view-option:hover {
		color: var(--shell-text);
		border-color: color-mix(in srgb, var(--shell-spotlight-primary) 18%, transparent);
	}

	.schedule-view-option:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--shell-spotlight-primary) 18%, transparent);
	}

	.schedule-view-option.active {
		color: color-mix(in srgb, var(--shell-spotlight-primary) 82%, white 18%);
		border-color: transparent;
	}

	.schedule-view-option:active {
		transform: translateY(1px);
	}

	.day-selector-wrap {
		margin-bottom: 16px;
	}

	.day-selector {
		position: relative;
		height: 104px;
		border: 1px solid var(--shell-border);
		border-radius: 24px;
		overflow: hidden;
		background:
			radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--shell-spotlight-primary) 14%, transparent), transparent 48%),
			var(--surface-2);
	}

	.day-selector::before,
	.day-selector::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 44px;
		z-index: 2;
		pointer-events: none;
		opacity: 0;
		transition: opacity 180ms ease;
	}

	.day-selector::before {
		left: 0;
		background: linear-gradient(to right, color-mix(in srgb, var(--shell-bg-base) 92%, black 8%), transparent);
	}

	.day-selector::after {
		right: 0;
		background: linear-gradient(to left, color-mix(in srgb, var(--shell-bg-base) 92%, black 8%), transparent);
	}

	.day-selector.fade-start::before {
		opacity: 1;
	}

	.day-selector.fade-end::after {
		opacity: 1;
	}

	.day-selector-track {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 18px;
		padding: 0 18px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-behavior: smooth;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
		touch-action: pan-x pinch-zoom;
		cursor: grab;
	}

	.day-selector-track::-webkit-scrollbar {
		display: none;
	}

	.day-selector-track.day-selector-pointer-dragging {
		cursor: grabbing;
		scroll-snap-type: none;
		scroll-behavior: auto;
	}

	.day-select-spacer {
		flex: 0 0 calc(50% - 56px);
		height: 1px;
		pointer-events: none;
	}

	.day-select-btn {
		flex: 0 0 auto;
		width: 112px;
		height: 62px;
		border-radius: 18px;
		border: 1px solid var(--shell-border);
		background: color-mix(in srgb, var(--shell-bg-base) 92%, black 8%);
		color: color-mix(in srgb, var(--shell-text) 70%, transparent);
		display: grid;
		place-items: center;
		gap: 3px;
		cursor: pointer;
		font-weight: 850;
		opacity: 0.66;
		scroll-snap-align: center;
		scroll-snap-stop: always;
		user-select: none;
	}

	.day-select-btn.active {
		opacity: 1;
		color: var(--shell-spotlight-primary);
		border-color: color-mix(in srgb, var(--shell-spotlight-primary) 42%, transparent);
		box-shadow: 0 0 0 5px color-mix(in srgb, var(--shell-spotlight-primary) 10%, transparent);
	}

	.day-select-count {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: color-mix(in srgb, var(--shell-text) 50%, transparent);
	}

	.week-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 10px;
		min-height: 100%;
	}

	.schedule-scroll-content > .week-grid:not(.full-week) {
		flex: 1;
	}

	.week-grid.full-week {
		gap: 12px;
	}

	.week-grid:not(.full-week) {
		min-height: 100%;
	}

	.day {
		min-width: 0;
		border: 1px solid var(--shell-border);
		border-radius: 16px;
		background: var(--surface-1);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.day.daily-focus {
		min-height: 100%;
		border: 0;
		background: transparent;
		overflow: visible;
	}

	.week-grid:not(.full-week) .day {
		min-height: 100%;
	}

	.day-head {
		height: 40px;
		padding: 0 12px;
		border-bottom: 1px solid var(--shell-border);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
	}

	.day-name {
		grid-column: 2;
		font-weight: 950;
	}

	.day-total {
		grid-column: 3;
		justify-self: end;
		min-width: 26px;
		height: 24px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--shell-bg-base) 70%, black 30%);
		font-size: 0.75rem;
		font-weight: 900;
	}

	.drop-zone {
		padding: 8px;
		display: grid;
		gap: 8px;
		flex: 1;
		align-content: start;
	}

	.day:not(.daily-focus) .drop-zone {
		min-height: 96px;
	}

	.daily-focus .drop-zone {
		padding: 0;
		gap: 10px;
		min-height: 100%;
	}

	.week-grid.full-week .drop-zone {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-content: flex-start;
		align-items: stretch;
		gap: 8px;
	}

	.add-group-btn {
		justify-self: center;
		min-width: 160px;
		height: 34px;
		margin-bottom: 2px;
	}

	.view-mode .add-group-btn {
		display: none;
	}

	.week-grid.full-week .add-group-btn {
		flex: 0 0 100%;
		width: 100%;
	}

	.workout-card {
		position: relative;
		min-width: 0;
		padding: 10px 40px;
		border: 1px solid var(--shell-border);
		border-radius: 14px;
		background: var(--surface-3);
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, white 14%, transparent),
			0 6px 18px rgba(0, 0, 0, 0.2);
		display: flex;
		flex-direction: column;
		gap: 7px;
		text-align: center;
		cursor: pointer;
	}

	.daily-focus .workout-card {
		padding: 10px 40px;
	}

	.view-mode .day.daily-focus .workout-card {
		min-height: 0;
		height: auto;
		padding-top: 8px;
		padding-bottom: 8px;
		gap: 4px;
		align-content: start;
	}

	.view-mode .day.daily-focus .card-data {
		gap: 3px;
	}

	.week-grid.full-week .workout-card {
		flex: 0 0 260px;
		width: 260px;
		max-width: 260px;
		min-height: 72px;
	}

	.workout-title {
		font-weight: 950;
		letter-spacing: -0.02em;
		text-align: center;
	}

	.rest-card {
		min-width: 0;
		min-height: 72px;
		padding: 10px 14px;
		border: 1px dashed color-mix(in srgb, var(--shell-border) 78%, transparent);
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface-2) 76%, transparent);
		color: color-mix(in srgb, var(--shell-text) 62%, transparent);
		display: grid;
		place-items: center;
		text-align: center;
		pointer-events: none;
		user-select: none;
	}

	.rest-title {
		font-weight: 800;
		letter-spacing: 0.02em;
	}

	.card-controls {
		position: absolute;
		left: 10px;
		top: 0;
		bottom: 0;
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.view-mode .drop-zone .card-controls {
		opacity: 0;
		pointer-events: none;
	}


	.handle {
		color: color-mix(in srgb, var(--shell-text) 50%, transparent);
		font-weight: 950;
		cursor: grab;
		touch-action: none;
		user-select: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.card-data {
		display: grid;
		gap: 5px;
	}

	.metric-group {
		display: grid;
		min-width: 0;
	}

	.metric-chip-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 5px;
	}

	.card-chip {
		max-width: 100%;
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--shell-border);
		border-radius: 999px;
		background: var(--surface-2);
		color: color-mix(in srgb, var(--shell-text) 72%, transparent);
		font-size: 0.72rem;
		font-weight: 750;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.target-chip {
		background: color-mix(in srgb, var(--shell-spotlight-primary) 12%, transparent);
		border-color: color-mix(in srgb, var(--shell-spotlight-primary) 24%, transparent);
		color: var(--shell-spotlight-primary);
	}

	.exercise-group-card {
		border: 1px solid var(--shell-border);
		border-radius: 16px;
		background: var(--surface-2);
		overflow: hidden;
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, white 8%, transparent),
			0 8px 22px rgba(0, 0, 0, 0.18);
	}

	.week-grid.full-week .exercise-group-card {
		flex: 0 0 100%;
		width: 100%;
	}

	.group-head {
		position: relative;
		min-height: 46px;
		padding: 10px 14px 10px 40px;
		display: grid;
		place-items: center;
		background: var(--surface-1);
		border-bottom: 1px solid var(--shell-border);
		cursor: pointer;
	}

	.group-title {
		font-size: 0.9rem;
		font-weight: 950;
	}

	.group-drop-zone {
		padding: 10px;
		min-height: 70px;
		display: grid;
		gap: 8px;
		background: var(--surface-1);
	}

	.week-grid.full-week .group-drop-zone {
		display: flex;
		flex-flow: row wrap;
		justify-content: center;
		align-content: flex-start;
		gap: 8px;
	}

	.week-grid.full-week .group-drop-zone .workout-card {
		flex: 1 1 240px;
		min-width: 240px;
		max-width: none;
	}

	.group-empty,
	.empty {
		min-height: 72px;
		border: 1px dashed var(--shell-border);
		border-radius: 14px;
		display: grid;
		place-items: center;
		color: color-mix(in srgb, var(--shell-text) 50%, transparent);
		text-align: center;
		transition:
			border-color 140ms ease,
			background-color 140ms ease,
			color 140ms ease;
	}

	.group-empty.drag-active,
	.empty.drag-active {
		border-color: color-mix(in srgb, var(--shell-spotlight-primary) 42%, transparent);
		background: color-mix(in srgb, var(--shell-spotlight-primary) 12%, transparent);
		color: transparent;
	}

	.empty-label {
		transition: opacity 120ms ease;
	}

	.empty.drag-active .empty-label {
		opacity: 0;
	}

	:global(.drop-marker) {
		height: 4px;
		border-radius: 999px;
		background: var(--shell-spotlight-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--shell-spotlight-primary) 12%, transparent);
	}

	.week-grid.full-week :global(.drop-marker) {
		width: 4px;
		min-height: 72px;
		height: auto;
		align-self: stretch;
	}

	.week-grid.full-week :global(.empty-drop-marker) {
		width: 100%;
		flex: 1 0 100%;
		min-height: 64px;
		align-self: auto;
	}

	:global(.empty-drop-marker) {
		height: 64px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--shell-spotlight-primary) 12%, transparent);
		border: 1px dashed color-mix(in srgb, var(--shell-spotlight-primary) 42%, transparent);
	}

	:global(.dragging) {
		display: none !important;
	}

	:global(.drag-preview) {
		position: fixed;
		top: -9999px;
		left: -9999px;
		pointer-events: none;
		z-index: 10000;
	}

	:global(.drag-preview) > * {
		width: 100%;
		height: 100%;
		margin: 0;
		box-shadow: 0 14px 34px rgba(0, 0, 0, 0.24);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.54);
		display: grid;
		place-items: center;
		padding: 22px;
	}

	.modal {
		width: min(560px, 100%);
		border: 1px solid var(--shell-border);
		border-radius: 22px;
		background: color-mix(in srgb, var(--shell-bg-base) 92%, black 8%);
		box-shadow: var(--shell-shadow);
		overflow: hidden;
	}

	.modal-head {
		min-height: 68px;
		padding: 14px 16px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		text-align: center;
		border-bottom: 1px solid var(--shell-border);
	}

	.modal-head h3 {
		font-size: 1.05rem;
	}

	.modal-head p {
		margin-top: 4px;
		color: color-mix(in srgb, var(--shell-text) 55%, transparent);
		font-size: 0.85rem;
	}

	.close {
		width: 34px;
		height: 34px;
		border: 1px solid var(--shell-border);
		border-radius: 10px;
		background: transparent;
		color: var(--shell-text);
		font-size: 1.3rem;
		cursor: pointer;
	}

	.modal-body {
		padding: 16px;
	}

	.metric-builder {
		display: grid;
		gap: 10px;
	}

	.modal-body.form .metric-builder:empty {
		display: none;
	}

	.metric-row,
	.target-edit-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 0.72fr) minmax(0, 0.55fr) 34px;
		gap: 8px;
		align-items: end;
	}

	.metric-remove-slot,
	.target-remove-slot {
		height: 42px;
		display: grid;
		place-items: end center;
	}

	.metric-remove-slot.is-hidden,
	.target-remove-slot.is-hidden {
		visibility: hidden;
		pointer-events: none;
	}

	.add-metric-wide,
	.add-target-btn {
		width: 100%;
	}

	.confirm-modal {
		width: min(520px, 100%);
	}

	.confirm-body {
		display: grid;
		gap: 16px;
		text-align: center;
	}

	.confirm-message {
		display: grid;
		gap: 8px;
		color: color-mix(in srgb, var(--shell-text) 72%, transparent);
		line-height: 1.45;
	}

	.confirm-actions {
		display: flex;
		justify-content: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.confirm-actions .btn {
		min-width: 140px;
	}

	.toast {
		position: fixed;
		left: 50%;
		bottom: 24px;
		z-index: 1100;
		transform: translateX(-50%);
		padding: 10px 14px;
		border: 1px solid var(--shell-border);
		border-radius: 999px;
		background: color-mix(in srgb, var(--shell-bg-base) 92%, black 8%);
		box-shadow: var(--shell-shadow);
		font-weight: 850;
	}

	@media (max-width: 900px) {
		.page-shell {
			height: auto;
			min-height: 100vh;
			min-height: 100dvh;
		}

		.workout-app {
			flex: 0 0 auto;
			grid-template-columns: 1fr;
			overflow: visible;
		}

		.app-tabs {
			position: relative;
			height: auto;
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			border-right: 0;
			border-bottom: 1px solid var(--shell-border);
			border-radius: 25px;
		}

		.tab-list {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}

		.app-content {
			--content-pad-x: 20px;
			padding: 18px var(--content-pad-x);
			overflow: visible;
			border-radius: 25px;
		}

		.library-grid {
			grid-template-columns: 1fr;
		}

		.drawer-panel {
			--drawer-outer-gap: 18px;
		}

		.schedule-panel {
			height: auto;
			overflow: visible;
		}

		.schedule-pane {
			--drawer-size: min(220px, calc(100dvh - 320px));
			--content-shift-x: 0px;
			--mobile-content-follow: 1.0;
			--content-shift-y: calc((var(--drawer-reveal) - var(--drawer-handle-peek)) * var(--mobile-content-follow));
			--mobile-drawer-reveal: calc(var(--drawer-reveal) - 2px);
			position: relative;
			z-index: 10;
		}

		.schedule-pane > .page-header {
			transform: translateY(var(--content-shift-y));
			margin-top: 0;
			position: relative;
			z-index: 32;
			transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
			will-change: transform;
		}

		.schedule-pane .schedule-panel {
			transform: none;
			margin-top: var(--content-shift-y);
			width: 100%;
			max-width: 100%;
			transition: margin-top 220ms cubic-bezier(0.22, 1, 0.36, 1);
			will-change: margin-top;
		}

		.planner-layout {
			--drawer-size: min(220px, calc(100dvh - 320px));
			--drawer-handle-gap: 6px;
			--drawer-anchor-lift: 127px;
			margin-top: calc(-1 * var(--drawer-anchor-lift));
			padding-top: var(--drawer-anchor-lift);
			overflow: hidden;
		}

		.drawer-panel {
			top: 0;
			left: 0;
			right: 0;
			width: 100%;
			height: var(--drawer-size);
			border-radius: 0 0 20px 20px;
			z-index: 28;
			transform: translateY(calc(-1 * (var(--drawer-size) - var(--mobile-drawer-reveal))));
			transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
			will-change: transform;
		}

		.drawer-handle {
			top: auto;
			right: 50%;
			bottom: -22px;
			width: 74px;
			height: 22px;
			transform: translateX(50%);
			border-radius: 0 0 999px 999px;
			touch-action: none;
		}

		.schedule-panel {
			margin-left: 0;
			position: relative;
			z-index: 12;
		}

	}

	@media (max-width: 700px) {
		.page-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.schedule-header-actions {
			width: 100%;
		}

		.schedule-view-toggle {
			width: 100%;
			min-width: 0;
		}

		.day-selector {
			height: auto;
			padding: 10px;
		}

		.day-selector-track {
			padding: 0 2px;
		}

		.metric-row,
		.target-edit-row {
			grid-template-columns: 1fr;
		}

		.metric-remove-slot,
		.target-remove-slot {
			height: auto;
		}

		.schedule-panel {
			margin-left: 0 !important;
		}

		.panel-body {
			padding: 12px;
		}

		.schedule-scroll-viewport,
		.drawer-scroll-viewport {
			padding-right: 12px;
		}

		.week-grid.full-week .workout-card {
			flex: 1 1 100%;
			width: 100%;
			max-width: none;
		}

		.week-grid.full-week .group-drop-zone .workout-card {
			min-width: 0;
			flex: 1 1 100%;
		}
	}
</style>
