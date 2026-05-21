<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { ShellTopbar, resolveShellTheme } from '$shell';
	import '$shell/shell.css';
	import type { PageData } from './$types';

	export let data: PageData;

	let shellTheme = resolveShellTheme({
		mode: data.user.themeMode,
		primary: data.user.primaryColor,
		secondary: data.user.secondaryColor
	});

	type ThemeMode = 'light' | 'dark' | 'system';
	type SectionKey = 'name' | 'email' | 'password';
	type FeedbackKind = 'success' | 'error';
	type ColorKind = 'primary' | 'secondary';
	type ColorFormat = 'hex' | 'rgb' | 'hsl';

	type Rgb = { r: number; g: number; b: number };
	type Hsv = { h: number; s: number; v: number };
	type Hsl = { h: number; s: number; l: number };

	const themeOptions: ThemeMode[] = ['light', 'dark', 'system'];
	const colorFormats: ColorFormat[] = ['hex', 'rgb', 'hsl'];
	const swatches = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#7c3aed', '#ec4899'];

	let firstName = data.user.firstName;
	let lastName = data.user.lastName;
	let email = data.user.email;
	let themeMode: ThemeMode = data.user.themeMode;
	let primaryColor = data.user.primaryColor;
	let secondaryColor = data.user.secondaryColor;

	let draftFirstName = firstName;
	let draftLastName = lastName;
	let draftEmail = '';
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	$: requiresCurrentPassword = data.user?.signedInWithTempPassword !== true;

	let isUserMenuOpen = false;
	let openSection: SectionKey | null = null;
	let openColorPicker: ColorKind | null = null;

	let activeFormat: Record<ColorKind, ColorFormat> = {
		primary: 'hex',
		secondary: 'hex'
	};

	let stableHue: Record<ColorKind, number> = {
		primary: rgbToHsv(hexToRgb(primaryColor) ?? { r: 124, g: 58, b: 237 }).h,
		secondary: rgbToHsv(hexToRgb(secondaryColor) ?? { r: 6, g: 182, b: 212 }).h
	};

	let feedback: Partial<Record<SectionKey, { type: FeedbackKind; message: string }>> = {};

	let systemThemeQuery: MediaQueryList | null = null;
	let appearanceSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let hasLoadedAppearance = false;
	let isUiReady = false;
	let appearanceKey = `${themeMode}|${primaryColor}|${secondaryColor}`;
	let lastSavedAppearanceKey = appearanceKey;

	let themeSlider: HTMLElement;
	let themeThumbX: string | null = null;
	let isThemeDragging = false;

	let primaryFormatSlider: HTMLElement;
	let secondaryFormatSlider: HTMLElement;

	let formatThumbX: Record<ColorKind, string | null> = {
		primary: null,
		secondary: null
	};

	let isFormatDragging: Record<ColorKind, boolean> = {
		primary: false,
		secondary: false
	};

	let primaryWheelCanvas: HTMLCanvasElement;
	let primarySvCanvas: HTMLCanvasElement;
	let secondaryWheelCanvas: HTMLCanvasElement;
	let secondarySvCanvas: HTMLCanvasElement;
	const DEBUG_PICKER = false;
	const DEBUG_APPEARANCE = false;

	let primaryWheelHandleStyle = '';
	let secondaryWheelHandleStyle = '';
	let primarySvHandleStyle = '';
	let secondarySvHandleStyle = '';
	let primaryFormatSliderInlineStyle = '';
	let secondaryFormatSliderInlineStyle = '';

	let primaryWheelHandleEl: HTMLDivElement;
	let secondaryWheelHandleEl: HTMLDivElement;
	let primarySvHandleEl: HTMLDivElement;
	let secondarySvHandleEl: HTMLDivElement;
	let primaryFormatThumbEl: HTMLDivElement;
	let secondaryFormatThumbEl: HTMLDivElement;

	$: fullName = `${firstName} ${lastName}`.trim() || 'Not set';
	$: initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'AU';
	$: userName = fullName;
	$: themeIndex = Math.max(0, themeOptions.indexOf(themeMode));
	$: effectiveTheme = themeMode === 'system' ? (systemThemeQuery?.matches ? 'light' : 'dark') : themeMode;
	$: shellTheme = resolveShellTheme({
		mode: themeMode,
		primary: primaryColor,
		secondary: secondaryColor
	});

	$: primaryValues = getColorValues(primaryColor);
	$: secondaryValues = getColorValues(secondaryColor);
	$: primaryWheelHandleStyle = wheelHandleStyle('primary', stableHue.primary);
	$: secondaryWheelHandleStyle = wheelHandleStyle('secondary', stableHue.secondary);
	$: primarySvHandleStyle = svHandleStyle('primary', primaryColor);
	$: secondarySvHandleStyle = svHandleStyle('secondary', secondaryColor);
	$: primaryFormatSliderInlineStyle = formatSliderStyle(activeFormat.primary, formatThumbX.primary);
	$: secondaryFormatSliderInlineStyle = formatSliderStyle(activeFormat.secondary, formatThumbX.secondary);

	$: appearanceKey = `${themeMode}|${primaryColor}|${secondaryColor}`;

	$: if (browser) {
		// Explicit deps keep Svelte reactivity reliable for theme updates.
		themeMode;
		primaryColor;
		secondaryColor;
		applyThemeVars();
	}

	$: if (hasLoadedAppearance && browser && appearanceKey !== lastSavedAppearanceKey) {
		scheduleAppearanceSave();
	}

	function toggleUserMenu() {
		isUserMenuOpen = !isUserMenuOpen;
	}

	function manageAccount() {
		isUserMenuOpen = false;
	}

	async function logOut() {
		isUserMenuOpen = false;
		await fetch('/auth/api/logout', { method: 'POST' });
		await goto('/auth/login');
	}

	function applyThemeVars() {
		document.documentElement.dataset.theme = themeMode;
		document.documentElement.style.setProperty('--shell-spotlight-primary', primaryColor || shellTheme.primary);
		document.documentElement.style.setProperty('--shell-spotlight-secondary', secondaryColor || shellTheme.secondary);
	}

	onMount(() => {
		isUiReady = false;
		hasLoadedAppearance = true;
		systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)');

		const handleSystemThemeChange = () => {
			if (themeMode === 'system') applyThemeVars();
		};

		const handleDocumentClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (!target.closest('[data-color-picker]')) openColorPicker = null;
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') openColorPicker = null;
		};

		const handleResize = () => {
			repaintPicker('primary');
			repaintPicker('secondary');
		};

		systemThemeQuery.addEventListener('change', handleSystemThemeChange);
		document.addEventListener('click', handleDocumentClick);
		document.addEventListener('keydown', handleEscape);
		window.addEventListener('resize', handleResize);

		tick().then(() => {
			repaintPicker('primary');
			repaintPicker('secondary');
			// Keep spinner on-screen long enough to paint reliably.
			setTimeout(() => {
				isUiReady = true;
			}, 180);
		});

		return () => {
			if (appearanceSaveTimer) clearTimeout(appearanceSaveTimer);
			systemThemeQuery?.removeEventListener('change', handleSystemThemeChange);
			document.removeEventListener('click', handleDocumentClick);
			document.removeEventListener('keydown', handleEscape);
			window.removeEventListener('resize', handleResize);
		};
	});

	function scheduleAppearanceSave() {
		if (appearanceSaveTimer) clearTimeout(appearanceSaveTimer);
		appearanceSaveTimer = setTimeout(() => {
			void saveAppearanceSettings();
		}, 220);
	}

	async function saveAppearanceSettings() {
		try {
			const response = await fetch('/auth/api/account', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'appearance',
					themeMode,
					primaryColor,
					secondaryColor
				})
			});
			if (!response.ok) {
				return;
			}

			const body = await response.json();
			themeMode = body.themeMode ?? themeMode;
			primaryColor = body.primaryColor ?? primaryColor;
			secondaryColor = body.secondaryColor ?? secondaryColor;
			lastSavedAppearanceKey = appearanceStateKey();
		} catch (err) {
		}
	}

	function appearanceStateKey() {
		return appearanceKey;
	}

	function setThemeMode(next: ThemeMode, source: string, options: { resetThumb?: boolean } = {}) {
		if (themeMode === next) return;
		themeMode = next;
		if (options.resetThumb !== false) {
			themeThumbX = null;
		}
	}

	function openEditor(section: SectionKey) {
		feedback = { ...feedback, [section]: undefined };
		openSection = section;

		if (section === 'name') {
			draftFirstName = firstName;
			draftLastName = lastName;
		}

		if (section === 'email') {
			draftEmail = '';
		}

		if (section === 'password') {
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		}
	}

	function closeEditor(section: SectionKey) {
		if (openSection === section) openSection = null;
	}

	function setFeedback(section: SectionKey, type: FeedbackKind, message: string) {
		feedback = {
			...feedback,
			[section]: { type, message }
		};
	}

	async function saveName() {
		const nextFirstName = draftFirstName.trim();
		const nextLastName = draftLastName.trim();

		if (!nextFirstName && !nextLastName) {
			setFeedback('name', 'error', 'Enter at least one name field before saving.');
			return;
		}

		try {
			const response = await fetch('/auth/api/account', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'name',
					firstName: nextFirstName,
					lastName: nextLastName
				})
			});

			if (!response.ok) {
				setFeedback('name', 'error', 'Unable to save name right now.');
				return;
			}

			const body = await response.json();
			firstName = body.firstName ?? nextFirstName;
			lastName = body.lastName ?? nextLastName;
			openSection = null;
			setFeedback('name', 'success', 'Name saved.');
		} catch {
			setFeedback('name', 'error', 'Unable to save name right now.');
		}
	}

	async function saveEmail() {
		const nextEmail = draftEmail.trim();

		if (!nextEmail) {
			setFeedback('email', 'error', 'Enter a new email address before saving.');
			return;
		}

		if (!nextEmail.includes('@') || !nextEmail.includes('.') || nextEmail.includes(' ')) {
			setFeedback('email', 'error', 'Enter a valid email address.');
			return;
		}

		try {
			const response = await fetch('/auth/api/account', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'email',
					email: nextEmail
				})
			});

			if (!response.ok) {
				setFeedback('email', 'error', 'Unable to save email right now.');
				return;
			}

			const body = await response.json();
			email = body.email ?? nextEmail;
			draftEmail = '';
			openSection = null;
			setFeedback('email', 'success', 'Email saved.');
		} catch {
			setFeedback('email', 'error', 'Unable to save email right now.');
		}
	}

	async function savePassword() {
		if ((requiresCurrentPassword && !currentPassword) || !newPassword || !confirmPassword) {
			setFeedback('password', 'error', 'Complete all password fields before saving.');
			return;
		}

		if (newPassword.length < 8) {
			setFeedback('password', 'error', 'New password must be at least 8 characters.');
			return;
		}

		if (newPassword !== confirmPassword) {
			setFeedback('password', 'error', 'New password and confirmation do not match.');
			return;
		}

		try {
			const response = await fetch('/auth/api/account', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store'
				},
				body: JSON.stringify({
					action: 'password',
					currentPassword: requiresCurrentPassword ? currentPassword : '',
					newPassword
				})
			});

			if (!response.ok) {
				setFeedback(
					'password',
					'error',
					requiresCurrentPassword
						? 'Current password is incorrect or save failed.'
						: 'Unable to save password right now.'
				);
				return;
			}

			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			openSection = null;
			setFeedback('password', 'success', 'Password saved.');
		} catch {
			setFeedback('password', 'error', 'Unable to save password right now.');
		}
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
	}

	function normalizeHex(value: string) {
		const raw = String(value).trim();
		const withHash = raw.startsWith('#') ? raw : `#${raw}`;
		return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : null;
	}

	function hexToRgb(hex: string): Rgb | null {
		const normalized = normalizeHex(hex);
		if (!normalized) return null;

		const value = parseInt(normalized.slice(1), 16);

		return {
			r: (value >> 16) & 255,
			g: (value >> 8) & 255,
			b: value & 255
		};
	}

	function rgbToHex({ r, g, b }: Rgb) {
		return `#${[r, g, b]
			.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
			.join('')}`;
	}

	function rgbToHsv({ r, g, b }: Rgb): Hsv {
		r /= 255;
		g /= 255;
		b /= 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const d = max - min;
		let h = 0;

		if (d !== 0) {
			if (max === r) h = 60 * (((g - b) / d) % 6);
			else if (max === g) h = 60 * ((b - r) / d + 2);
			else h = 60 * ((r - g) / d + 4);
		}

		return {
			h: Math.round((h + 360) % 360),
			s: max === 0 ? 0 : Math.round((d / max) * 100),
			v: Math.round(max * 100)
		};
	}

	function hsvToRgb({ h, s, v }: Hsv): Rgb {
		h = ((h % 360) + 360) % 360;
		s = clamp(s, 0, 100) / 100;
		v = clamp(v, 0, 100) / 100;

		const c = v * s;
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = v - c;
		let r = 0;
		let g = 0;
		let b = 0;

		if (h < 60) [r, g, b] = [c, x, 0];
		else if (h < 120) [r, g, b] = [x, c, 0];
		else if (h < 180) [r, g, b] = [0, c, x];
		else if (h < 240) [r, g, b] = [0, x, c];
		else if (h < 300) [r, g, b] = [x, 0, c];
		else [r, g, b] = [c, 0, x];

		return {
			r: Math.round((r + m) * 255),
			g: Math.round((g + m) * 255),
			b: Math.round((b + m) * 255)
		};
	}

	function rgbToHsl({ r, g, b }: Rgb): Hsl {
		r /= 255;
		g /= 255;
		b /= 255;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0;
		let s = 0;
		const l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				default:
					h = (r - g) / d + 4;
			}

			h *= 60;
		}

		return {
			h: Math.round(h),
			s: Math.round(s * 100),
			l: Math.round(l * 100)
		};
	}

	function hslToRgb({ h, s, l }: Hsl): Rgb {
		h = ((h % 360) + 360) % 360;
		s = clamp(s, 0, 100) / 100;
		l = clamp(l, 0, 100) / 100;

		const c = (1 - Math.abs(2 * l - 1)) * s;
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = l - c / 2;
		let r = 0;
		let g = 0;
		let b = 0;

		if (h < 60) [r, g, b] = [c, x, 0];
		else if (h < 120) [r, g, b] = [x, c, 0];
		else if (h < 180) [r, g, b] = [0, c, x];
		else if (h < 240) [r, g, b] = [0, x, c];
		else if (h < 300) [r, g, b] = [x, 0, c];
		else [r, g, b] = [c, 0, x];

		return {
			r: Math.round((r + m) * 255),
			g: Math.round((g + m) * 255),
			b: Math.round((b + m) * 255)
		};
	}

	function colorFor(kind: ColorKind) {
		return kind === 'primary' ? primaryColor : secondaryColor;
	}

	function hsvFor(kind: ColorKind) {
		return rgbToHsv(hexToRgb(colorFor(kind))!);
	}

	function getColorValues(hex: string) {
		const rgb = hexToRgb(hex)!;
		const hsl = rgbToHsl(rgb);

		return {
			hex: hex.toUpperCase(),
			r: rgb.r,
			g: rgb.g,
			b: rgb.b,
			h: hsl.h,
			s: hsl.s,
			l: hsl.l
		};
	}

	function setColor(kind: ColorKind, hex: string, options: { keepHue?: boolean; skipSvPaint?: boolean } = {}) {
		const normalized = normalizeHex(hex);
		if (!normalized) return;

		if (kind === 'primary') {
			primaryColor = normalized;
		} else {
			secondaryColor = normalized;
		}

		if (!options.keepHue) {
			stableHue = {
				...stableHue,
				[kind]: rgbToHsv(hexToRgb(normalized)!).h
			};
		}

		if (!options.skipSvPaint) {
			requestAnimationFrame(() => repaintPicker(kind));
		}
	}

	function setupHiDPICanvas(canvas: HTMLCanvasElement) {
		const rect = canvas.getBoundingClientRect();
		const cssWidth = Math.max(1, rect.width || Number(canvas.getAttribute('width')) || 176);
		const cssHeight = Math.max(1, rect.height || Number(canvas.getAttribute('height')) || 176);
		const ratio = Math.max(1, window.devicePixelRatio || 1) * 2;

		const backingWidth = Math.round(cssWidth * ratio);
		const backingHeight = Math.round(cssHeight * ratio);

		if (canvas.width !== backingWidth) canvas.width = backingWidth;
		if (canvas.height !== backingHeight) canvas.height = backingHeight;

		const ctx = canvas.getContext('2d', { willReadFrequently: false });
		if (!ctx) throw new Error('Canvas 2D context unavailable.');

		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

		return { ctx, width: cssWidth, height: cssHeight };
	}

	function paintHueWheel(canvas: HTMLCanvasElement) {
		const { ctx, width, height } = setupHiDPICanvas(canvas);
		const cx = width / 2;
		const cy = height / 2;
		const outer = Math.min(width, height) / 2 - 1;
		const inner = outer * 0.62;

		ctx.clearRect(0, 0, width, height);

		for (let hue = 0; hue < 360; hue += 1) {
			const start = ((hue - 1.4) * Math.PI) / 180;
			const end = ((hue + 1.4) * Math.PI) / 180;

			ctx.beginPath();
			ctx.arc(cx, cy, outer, start, end);
			ctx.arc(cx, cy, inner, end, start, true);
			ctx.closePath();
			ctx.fillStyle = `hsl(${hue} 100% 50%)`;
			ctx.fill();
		}

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(cx, cy, outer - 0.5, 0, Math.PI * 2);
		ctx.stroke();

		ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
		ctx.beginPath();
		ctx.arc(cx, cy, inner + 0.5, 0, Math.PI * 2);
		ctx.stroke();
	}

	function paintSvPlane(canvas: HTMLCanvasElement, hue: number) {
		const { ctx, width, height } = setupHiDPICanvas(canvas);

		ctx.clearRect(0, 0, width, height);

		ctx.fillStyle = `hsl(${hue} 100% 50%)`;
		ctx.fillRect(0, 0, width, height);

		const whiteGradient = ctx.createLinearGradient(0, 0, width, 0);
		whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.fillStyle = whiteGradient;
		ctx.fillRect(0, 0, width, height);

		const blackGradient = ctx.createLinearGradient(0, 0, 0, height);
		blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
		ctx.fillStyle = blackGradient;
		ctx.fillRect(0, 0, width, height);

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
		ctx.lineWidth = 1;
		ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
	}

	function wheelCanvasFor(kind: ColorKind) {
		return kind === 'primary' ? primaryWheelCanvas : secondaryWheelCanvas;
	}

	function svCanvasFor(kind: ColorKind) {
		return kind === 'primary' ? primarySvCanvas : secondarySvCanvas;
	}

	function formatSliderFor(kind: ColorKind) {
		return kind === 'primary' ? primaryFormatSlider : secondaryFormatSlider;
	}

	function repaintPicker(kind: ColorKind) {
		const wheel = wheelCanvasFor(kind);
		const sv = svCanvasFor(kind);

		if (!wheel || !sv) return;

		paintHueWheel(wheel);
		paintSvPlane(sv, stableHue[kind]);
	}

	function wheelHandleStyle(kind: ColorKind, hue: number) {
		const angle = (hue * Math.PI) / 180;
		const canvas = wheelCanvasFor(kind);
		const size = canvas?.clientWidth || 176;
		const outer = size / 2 - 1;
		const inner = outer * 0.62;
		const handleRadius = (outer + inner) / 2;
		const cx = size / 2;
		const cy = size / 2;

		return `left: ${cx + Math.cos(angle) * handleRadius}px; top: ${cy + Math.sin(angle) * handleRadius}px;`;
	}

	function svHandleStyle(kind: ColorKind, hex: string) {
		const hsv = rgbToHsv(hexToRgb(hex)!);
		const canvas = svCanvasFor(kind);
		const width = canvas?.clientWidth || 176;
		const height = canvas?.clientHeight || 176;

		return `left: ${(hsv.s / 100) * width}px; top: ${((100 - hsv.v) / 100) * height}px;`;
	}

	function openPicker(kind: ColorKind) {
		// Re-sync picker internals to persisted color so popover always opens at current selection.
		const current = kind === 'primary' ? primaryColor : secondaryColor;
		const rgb = hexToRgb(current);
		if (rgb) {
			stableHue = {
				...stableHue,
				[kind]: rgbToHsv(rgb).h
			};
		}

		openColorPicker = openColorPicker === kind ? null : kind;

		tick().then(() => {
			if (openColorPicker === kind) repaintPicker(kind);
		});
	}

	function applyHuePointer(kind: ColorKind, event: PointerEvent) {
		const canvas = wheelCanvasFor(kind);
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const hue = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 360) % 360;
		const hsv = hsvFor(kind);

		stableHue = {
			...stableHue,
			[kind]: hue
		};
		if (DEBUG_PICKER) requestAnimationFrame(() => logHueThumbVsPointer(kind, event.clientX, event.clientY));

		setColor(kind, rgbToHex(hsvToRgb({ h: hue, s: hsv.s, v: hsv.v })), {
			keepHue: true
		});
	}

	function applySvPointer(kind: ColorKind, event: PointerEvent) {
		const canvas = svCanvasFor(kind);
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const x = clamp(event.clientX - rect.left, 0, rect.width);
		const y = clamp(event.clientY - rect.top, 0, rect.height);
		if (DEBUG_PICKER) requestAnimationFrame(() => logSvThumbVsPointer(kind, x, y, rect.width, rect.height));

		setColor(
			kind,
			rgbToHex(
				hsvToRgb({
					h: stableHue[kind],
					s: (x / rect.width) * 100,
					v: (1 - y / rect.height) * 100
				})
			),
			{
				keepHue: true,
				skipSvPaint: true
			}
		);
	}

	function startColorDrag(kind: ColorKind, event: PointerEvent, mode: 'hue' | 'sv') {
		const target = event.currentTarget as HTMLElement;

		event.preventDefault();
		target.setPointerCapture(event.pointerId);

		if (mode === 'hue') applyHuePointer(kind, event);
		else applySvPointer(kind, event);

		const move = (moveEvent: PointerEvent) => {
			if (!target.hasPointerCapture(moveEvent.pointerId)) return;

			if (mode === 'hue') applyHuePointer(kind, moveEvent);
			else applySvPointer(kind, moveEvent);
		};

		const done = (doneEvent: PointerEvent) => {
			if (target.hasPointerCapture(doneEvent.pointerId)) {
				target.releasePointerCapture(doneEvent.pointerId);
			}

			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', done);
			target.removeEventListener('pointercancel', done);

			repaintPicker(kind);
		};

		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', done);
		target.addEventListener('pointercancel', done);
	}

	function updateHex(kind: ColorKind, value: string) {
		setColor(kind, value);
	}

	function updateRgb(kind: ColorKind, key: keyof Rgb, value: string) {
		const rgb = hexToRgb(colorFor(kind))!;
		rgb[key] = clamp(Number(value), 0, 255);
		setColor(kind, rgbToHex(rgb));
	}

	function updateHsl(kind: ColorKind, key: keyof Hsl, value: string) {
		const hsl = rgbToHsl(hexToRgb(colorFor(kind))!);
		hsl[key] = key === 'h' ? clamp(Number(value), 0, 359) : clamp(Number(value), 0, 100);
		setColor(kind, rgbToHex(hslToRgb(hsl)));
	}

	function chooseSwatch(kind: ColorKind, color: string) {
		stableHue = {
			...stableHue,
			[kind]: rgbToHsv(hexToRgb(color)!).h
		};

		setColor(kind, color, { keepHue: true });
	}

	function startThemeDrag(event: PointerEvent) {
		if (!themeSlider) return;

		event.preventDefault();
		isThemeDragging = true;
		themeSlider.setPointerCapture(event.pointerId);
		setThemeThumbFromPointer(event);
		setThemeMode(themeOptions[getSegmentIndexFromPointer(event, themeSlider, themeOptions.length)], 'drag:start', {
			resetThumb: false
		});

		const move = (moveEvent: PointerEvent) => {
			if (themeSlider.hasPointerCapture(moveEvent.pointerId) || isThemeDragging) {
				setThemeThumbFromPointer(moveEvent);
				setThemeMode(
					themeOptions[getSegmentIndexFromPointer(moveEvent, themeSlider, themeOptions.length)],
					'drag:move',
					{ resetThumb: false }
				);
			}
		};

		const done = (doneEvent: PointerEvent) => {
			if (themeSlider.hasPointerCapture(doneEvent.pointerId)) {
				themeSlider.releasePointerCapture(doneEvent.pointerId);
			}

			isThemeDragging = false;
			const snappedIndex = getSegmentIndexFromPointer(doneEvent, themeSlider, themeOptions.length);
			themeThumbX = getSliderThumbXFromIndex(snappedIndex, themeSlider, themeOptions.length);
			setThemeMode(themeOptions[snappedIndex], 'drag:end', { resetThumb: false });
			requestAnimationFrame(() => {
				themeThumbX = null;
			});

			themeSlider.removeEventListener('pointermove', move);
			themeSlider.removeEventListener('pointerup', done);
			themeSlider.removeEventListener('pointercancel', done);
		};

		themeSlider.addEventListener('pointermove', move);
		themeSlider.addEventListener('pointerup', done);
		themeSlider.addEventListener('pointercancel', done);
	}

	function getSegmentIndexFromPointer(event: PointerEvent, slider: HTMLElement, optionCount: number) {
		const rect = slider.getBoundingClientRect();
		const x = clamp(event.clientX - rect.left, 0, rect.width);
		const progress = rect.width === 0 ? 0 : x / rect.width;
		return clamp(Math.floor(progress * optionCount), 0, optionCount - 1);
	}

	function getSliderThumbXFromPointer(event: PointerEvent, slider: HTMLElement, optionCount: number) {
		const rect = slider.getBoundingClientRect();
		const padding = 3.2;
		const thumbWidth = (rect.width - padding * 2) / optionCount;
		const minX = 0;
		const maxX = rect.width - padding * 2 - thumbWidth;
		const x = clamp(event.clientX - rect.left - padding - thumbWidth / 2, minX, maxX);

		return `${x}px`;
	}

	function getSliderThumbXFromIndex(index: number, slider: HTMLElement, optionCount: number) {
		const rect = slider.getBoundingClientRect();
		const padding = 3.2;
		const thumbWidth = (rect.width - padding * 2) / optionCount;
		const clampedIndex = clamp(Math.round(index), 0, optionCount - 1);
		return `${clampedIndex * thumbWidth}px`;
	}

	function setThemeThumbFromPointer(event: PointerEvent) {
		themeThumbX = getSliderThumbXFromPointer(event, themeSlider, themeOptions.length);
	}

	function getFormatIndex(kind: ColorKind) {
		return Math.max(0, colorFormats.indexOf(activeFormat[kind]));
	}

	function setFormat(kind: ColorKind, format: ColorFormat, options: { resetThumb?: boolean } = {}) {
		if (activeFormat[kind] === format) {
			if (options.resetThumb !== false) {
				formatThumbX = {
					...formatThumbX,
					[kind]: null
				};
			}
			return;
		}

		activeFormat = {
			...activeFormat,
			[kind]: format
		};

		if (options.resetThumb !== false) {
			formatThumbX = {
				...formatThumbX,
				[kind]: null
			};
		}
	}

	function setFormatFromIndex(kind: ColorKind, index: number, options: { resetThumb?: boolean } = {}) {
		const clampedIndex = clamp(Math.round(index), 0, colorFormats.length - 1);
		setFormat(kind, colorFormats[clampedIndex], options);
	}

	function startFormatDrag(kind: ColorKind, event: PointerEvent) {
		const slider = formatSliderFor(kind);
		if (!slider) return;

		event.preventDefault();
		isFormatDragging = {
			...isFormatDragging,
			[kind]: true
		};

		slider.setPointerCapture(event.pointerId);
		setFormatThumbFromPointer(kind, event);
		setFormatFromIndex(kind, getSegmentIndexFromPointer(event, slider, colorFormats.length), { resetThumb: false });

		const move = (moveEvent: PointerEvent) => {
			if (slider.hasPointerCapture(moveEvent.pointerId) || isFormatDragging[kind]) {
				setFormatThumbFromPointer(kind, moveEvent);
				setFormatFromIndex(kind, getSegmentIndexFromPointer(moveEvent, slider, colorFormats.length), {
					resetThumb: false
				});
			}
		};

		const done = (doneEvent: PointerEvent) => {
			if (slider.hasPointerCapture(doneEvent.pointerId)) {
				slider.releasePointerCapture(doneEvent.pointerId);
			}

			isFormatDragging = {
				...isFormatDragging,
				[kind]: false
			};
			formatThumbX = {
				...formatThumbX,
				[kind]: null
			};

			slider.removeEventListener('pointermove', move);
			slider.removeEventListener('pointerup', done);
			slider.removeEventListener('pointercancel', done);
		};

		slider.addEventListener('pointermove', move);
		slider.addEventListener('pointerup', done);
		slider.addEventListener('pointercancel', done);
	}

	function setFormatThumbFromPointer(kind: ColorKind, event: PointerEvent) {
		const slider = formatSliderFor(kind);
		if (!slider) return;
		const thumbX = getSliderThumbXFromPointer(event, slider, colorFormats.length);

		formatThumbX = {
			...formatThumbX,
			[kind]: thumbX
		};
		if (DEBUG_PICKER) requestAnimationFrame(() => logFormatThumbVsSelection(kind, thumbX));
	}

	function formatSliderStyle(active: ColorFormat, thumbX: string | null) {
		const index = Math.max(0, colorFormats.indexOf(active));

		return `--format-index: ${index}; ${thumbX ? `--format-thumb-x: ${thumbX};` : ''}`;
	}

	function logHueThumbVsPointer(kind: ColorKind, clientX: number, clientY: number) {
		const wheel = wheelCanvasFor(kind);
		const handle = kind === 'primary' ? primaryWheelHandleEl : secondaryWheelHandleEl;
		if (!wheel || !handle) return;
		const wheelRect = wheel.getBoundingClientRect();
		const handleRect = handle.getBoundingClientRect();
		const handleCenterX = handleRect.left + handleRect.width / 2;
		const handleCenterY = handleRect.top + handleRect.height / 2;
		const pointerAngle = ((Math.atan2(clientY - (wheelRect.top + wheelRect.height / 2), clientX - (wheelRect.left + wheelRect.width / 2)) * 180) / Math.PI + 360) % 360;
		const thumbAngle = ((Math.atan2(handleCenterY - (wheelRect.top + wheelRect.height / 2), handleCenterX - (wheelRect.left + wheelRect.width / 2)) * 180) / Math.PI + 360) % 360;
	}

	function logSvThumbVsPointer(kind: ColorKind, localX: number, localY: number, width: number, height: number) {
		const handle = kind === 'primary' ? primarySvHandleEl : secondarySvHandleEl;
		const canvas = svCanvasFor(kind);
		if (!handle || !canvas) return;
		const canvasRect = canvas.getBoundingClientRect();
		const handleRect = handle.getBoundingClientRect();
		const handleCenterLocalX = handleRect.left + handleRect.width / 2 - canvasRect.left;
		const handleCenterLocalY = handleRect.top + handleRect.height / 2 - canvasRect.top;
	}

	function logFormatThumbVsSelection(kind: ColorKind, thumbX: string) {
		const slider = formatSliderFor(kind);
		const thumb = kind === 'primary' ? primaryFormatThumbEl : secondaryFormatThumbEl;
		if (!slider || !thumb) return;
		const sliderRect = slider.getBoundingClientRect();
		const thumbRect = thumb.getBoundingClientRect();
		const selectedIndex = getFormatIndex(kind);
		const padding = 3.2;
		const segmentWidth = (sliderRect.width - padding * 2) / colorFormats.length;
		const selectedCenter = padding + selectedIndex * segmentWidth + segmentWidth / 2;
		const thumbCenter = thumbRect.left + thumbRect.width / 2 - sliderRect.left;
	}
</script>

<svelte:head>
	<title>Account</title>
</svelte:head>

<main class="page-shell">
	<section
		class="account-loading"
		class:is-hidden={isUiReady}
		aria-live="polite"
		aria-busy={!isUiReady}
		style="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:var(--shell-bg-base);"
	>
		<div
			class="loading-spinner"
			aria-hidden="true"
			style="display:block;width:2.75rem;height:2.75rem;border-radius:999px;border:4px solid rgba(148,163,184,.35);border-top-color:var(--shell-spotlight-primary,#58a6ff);animation:account-spin 850ms linear infinite;"
		></div>
		<span class="sr-only">Loading account settings…</span>
	</section>

	{#if isUiReady}
		<ShellTopbar
			title=""
			initials={initials}
			isMenuOpen={isUserMenuOpen}
			userName={userName}
			onToggleMenu={toggleUserMenu}
			onManageAccount={manageAccount}
			onLogout={logOut}
		/>

		<section class="workspace account-page" aria-labelledby="accountTitle">
		<header class="account-header">
			<div class="avatar" aria-hidden="true">{initials}</div>
			<div>
				<h1 id="accountTitle">Account</h1>
				<p class="account-email">{email}</p>
			</div>
		</header>

		<div class="card">
			<section class="setting" class:is-open={openSection === 'name'}>
				<div class="setting-row">
					<div>
						<div class="setting-title">Name</div>
						<p class="setting-value">{fullName}</p>
					</div>
					<button class="btn" type="button" on:click={() => openEditor('name')}>Change</button>
				</div>

				<form class="editor" on:submit|preventDefault={saveName}>
					<div class="field">
						<label for="firstName">First name</label>
						<input id="firstName" bind:value={draftFirstName} type="text" autocomplete="given-name" />
					</div>

					<div class="field">
						<label for="lastName">Last name</label>
						<input id="lastName" bind:value={draftLastName} type="text" autocomplete="family-name" />
					</div>

					<div class="actions">
						<button class="btn" type="button" on:click={() => closeEditor('name')}>Cancel</button>
						<button class="btn primary" type="submit">Save</button>
					</div>
				</form>

				{#if feedback.name}
					<p class="section-feedback {feedback.name.type}" role="status" aria-live="polite">
						{feedback.name.message}
					</p>
				{/if}
			</section>

			<section class="setting" class:is-open={openSection === 'email'}>
				<div class="setting-row">
					<div>
						<div class="setting-title">Email</div>
						<p class="setting-value">{email}</p>
					</div>
					<button class="btn" type="button" on:click={() => openEditor('email')}>Change</button>
				</div>

				<form class="editor" on:submit|preventDefault={saveEmail}>
					<div class="field full">
						<label for="newEmail">New email</label>
						<input id="newEmail" bind:value={draftEmail} type="email" placeholder="new.email@example.com" autocomplete="email" />
					</div>

					<div class="actions">
						<button class="btn" type="button" on:click={() => closeEditor('email')}>Cancel</button>
						<button class="btn primary" type="submit">Save</button>
					</div>
				</form>

				{#if feedback.email}
					<p class="section-feedback {feedback.email.type}" role="status" aria-live="polite">
						{feedback.email.message}
					</p>
				{/if}
			</section>

			<section class="setting" class:is-open={openSection === 'password'}>
				<div class="setting-row">
					<div>
						<div class="setting-title">Password</div>
					</div>
					<button class="btn" type="button" on:click={() => openEditor('password')}>Change</button>
				</div>

				<form class="editor" on:submit|preventDefault={savePassword}>
					{#if requiresCurrentPassword}
						<div class="field full">
							<label for="currentPassword">Current password</label>
							<input id="currentPassword" bind:value={currentPassword} type="password" autocomplete="current-password" />
						</div>
					{/if}

					<div class="field">
						<label for="newPassword">New password</label>
						<input id="newPassword" bind:value={newPassword} type="password" autocomplete="new-password" />
					</div>

					<div class="field">
						<label for="confirmPassword">Confirm</label>
						<input id="confirmPassword" bind:value={confirmPassword} type="password" autocomplete="new-password" />
					</div>

					<div class="actions">
						<button class="btn" type="button" on:click={() => closeEditor('password')}>Cancel</button>
						<button class="btn primary" type="submit">Save</button>
					</div>
				</form>

				{#if feedback.password}
					<p class="section-feedback {feedback.password.type}" role="status" aria-live="polite">
						{feedback.password.message}
					</p>
				{/if}
			</section>

			<section class="setting">
				<div class="setting-row">
					<div>
						<div class="setting-title">Appearance</div>
						<p class="setting-value">Theme and accent colors</p>
					</div>

					<div class="appearance-controls">
						<div
							class="theme-toggle"
							class:is-dragging={isThemeDragging}
							role="group"
							aria-label="Theme mode"
							bind:this={themeSlider}
							style={`--theme-index: ${themeIndex}; ${themeThumbX ? `--theme-thumb-x: ${themeThumbX};` : ''}`}
							on:pointerdown={startThemeDrag}
						>
							<div class="theme-slider-thumb" aria-hidden="true"></div>

							{#each themeOptions as option}
								<button
									type="button"
									aria-pressed={themeMode === option}
									on:click|stopPropagation={() => {
										setThemeMode(option, 'button:click');
									}}
								>
									{option[0].toUpperCase() + option.slice(1)}
								</button>
							{/each}
						</div>

						<div class="color-picker" data-color-picker>
							<button
								class="color-dot"
								style={`--color: ${primaryColor};`}
								type="button"
								title="Primary color"
								aria-label="Primary color"
								aria-expanded={openColorPicker === 'primary'}
								on:click|stopPropagation={() => openPicker('primary')}
							></button>

							{#if openColorPicker === 'primary'}
								<div class="color-popover" role="dialog" aria-label="Primary color picker" on:click|stopPropagation>
									<div class="color-popover-header">
										<div>
											<div class="color-popover-title">Primary color</div>
											<div class="color-live-value">{primaryColor.toUpperCase()}</div>
										</div>
										<button class="btn compact" type="button" on:click={() => (openColorPicker = null)}>Close</button>
									</div>

									<div class="color-picker-surface">
										<div class="wheel-column">
											<div class="wheel-stage">
												<canvas
													class="color-wheel-canvas"
													bind:this={primaryWheelCanvas}
													on:pointerdown={(event) => startColorDrag('primary', event, 'hue')}
												></canvas>
												<div class="picker-handle" bind:this={primaryWheelHandleEl} style={primaryWheelHandleStyle}></div>
											</div>

											<div class="format-field">
												<div class="input-label">Format</div>
												<div
													class="color-mode-toggle"
													class:is-dragging={isFormatDragging.primary}
													role="group"
													aria-label="Primary color format"
													bind:this={primaryFormatSlider}
													style={primaryFormatSliderInlineStyle}
													on:pointerdown={(event) => startFormatDrag('primary', event)}
												>
													<div class="color-mode-slider-thumb" bind:this={primaryFormatThumbEl} aria-hidden="true"></div>

													{#each colorFormats as format}
														<button
															type="button"
															aria-pressed={activeFormat.primary === format}
															on:click|stopPropagation={() => {
																setFormat('primary', format);
															}}
														>
															{format.toUpperCase()}
														</button>
													{/each}
												</div>
											</div>
										</div>

										<div class="sv-stage">
											<div class="sv-wrap">
												<canvas
													class="sv-canvas"
													bind:this={primarySvCanvas}
													on:pointerdown={(event) => startColorDrag('primary', event, 'sv')}
												></canvas>
												<div class="picker-handle" bind:this={primarySvHandleEl} style={primarySvHandleStyle}></div>
											</div>

											<div class="color-inputs" class:hex-mode={activeFormat.primary === 'hex'}>
												{#if activeFormat.primary === 'hex'}
													<label>
														<span>HEX</span>
														<input type="text" value={primaryValues.hex} maxlength="7" on:input={(event) => updateHex('primary', event.currentTarget.value)} />
													</label>
												{:else if activeFormat.primary === 'rgb'}
													<label><span>R</span><input type="number" min="0" max="255" value={primaryValues.r} on:input={(event) => updateRgb('primary', 'r', event.currentTarget.value)} /></label>
													<label><span>G</span><input type="number" min="0" max="255" value={primaryValues.g} on:input={(event) => updateRgb('primary', 'g', event.currentTarget.value)} /></label>
													<label><span>B</span><input type="number" min="0" max="255" value={primaryValues.b} on:input={(event) => updateRgb('primary', 'b', event.currentTarget.value)} /></label>
												{:else}
													<label><span>H</span><input type="number" min="0" max="359" value={primaryValues.h} on:input={(event) => updateHsl('primary', 'h', event.currentTarget.value)} /></label>
													<label><span>S</span><input type="number" min="0" max="100" value={primaryValues.s} on:input={(event) => updateHsl('primary', 's', event.currentTarget.value)} /></label>
													<label><span>L</span><input type="number" min="0" max="100" value={primaryValues.l} on:input={(event) => updateHsl('primary', 'l', event.currentTarget.value)} /></label>
												{/if}
											</div>
										</div>
									</div>

									<div class="color-swatches">
										{#each swatches as swatch}
											<button
												class="color-swatch-button"
												type="button"
												style={`--swatch: ${swatch};`}
												aria-label={`Use ${swatch}`}
												on:click={() => chooseSwatch('primary', swatch)}
											></button>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						<div class="color-picker" data-color-picker>
							<button
								class="color-dot"
								style={`--color: ${secondaryColor};`}
								type="button"
								title="Secondary color"
								aria-label="Secondary color"
								aria-expanded={openColorPicker === 'secondary'}
								on:click|stopPropagation={() => openPicker('secondary')}
							></button>

							{#if openColorPicker === 'secondary'}
								<div class="color-popover" role="dialog" aria-label="Secondary color picker" on:click|stopPropagation>
									<div class="color-popover-header">
										<div>
											<div class="color-popover-title">Secondary color</div>
											<div class="color-live-value">{secondaryColor.toUpperCase()}</div>
										</div>
										<button class="btn compact" type="button" on:click={() => (openColorPicker = null)}>Close</button>
									</div>

									<div class="color-picker-surface">
										<div class="wheel-column">
											<div class="wheel-stage">
												<canvas
													class="color-wheel-canvas"
													bind:this={secondaryWheelCanvas}
													on:pointerdown={(event) => startColorDrag('secondary', event, 'hue')}
												></canvas>
												<div class="picker-handle" bind:this={secondaryWheelHandleEl} style={secondaryWheelHandleStyle}></div>
											</div>

											<div class="format-field">
												<div class="input-label">Format</div>
												<div
													class="color-mode-toggle"
													class:is-dragging={isFormatDragging.secondary}
													role="group"
													aria-label="Secondary color format"
													bind:this={secondaryFormatSlider}
													style={secondaryFormatSliderInlineStyle}
													on:pointerdown={(event) => startFormatDrag('secondary', event)}
												>
													<div class="color-mode-slider-thumb" bind:this={secondaryFormatThumbEl} aria-hidden="true"></div>

													{#each colorFormats as format}
														<button
															type="button"
															aria-pressed={activeFormat.secondary === format}
															on:click|stopPropagation={() => {
																setFormat('secondary', format);
															}}
														>
															{format.toUpperCase()}
														</button>
													{/each}
												</div>
											</div>
										</div>

										<div class="sv-stage">
											<div class="sv-wrap">
												<canvas
													class="sv-canvas"
													bind:this={secondarySvCanvas}
													on:pointerdown={(event) => startColorDrag('secondary', event, 'sv')}
												></canvas>
												<div class="picker-handle" bind:this={secondarySvHandleEl} style={secondarySvHandleStyle}></div>
											</div>

											<div class="color-inputs" class:hex-mode={activeFormat.secondary === 'hex'}>
												{#if activeFormat.secondary === 'hex'}
													<label>
														<span>HEX</span>
														<input type="text" value={secondaryValues.hex} maxlength="7" on:input={(event) => updateHex('secondary', event.currentTarget.value)} />
													</label>
												{:else if activeFormat.secondary === 'rgb'}
													<label><span>R</span><input type="number" min="0" max="255" value={secondaryValues.r} on:input={(event) => updateRgb('secondary', 'r', event.currentTarget.value)} /></label>
													<label><span>G</span><input type="number" min="0" max="255" value={secondaryValues.g} on:input={(event) => updateRgb('secondary', 'g', event.currentTarget.value)} /></label>
													<label><span>B</span><input type="number" min="0" max="255" value={secondaryValues.b} on:input={(event) => updateRgb('secondary', 'b', event.currentTarget.value)} /></label>
												{:else}
													<label><span>H</span><input type="number" min="0" max="359" value={secondaryValues.h} on:input={(event) => updateHsl('secondary', 'h', event.currentTarget.value)} /></label>
													<label><span>S</span><input type="number" min="0" max="100" value={secondaryValues.s} on:input={(event) => updateHsl('secondary', 's', event.currentTarget.value)} /></label>
													<label><span>L</span><input type="number" min="0" max="100" value={secondaryValues.l} on:input={(event) => updateHsl('secondary', 'l', event.currentTarget.value)} /></label>
												{/if}
											</div>
										</div>
									</div>

									<div class="color-swatches">
										{#each swatches as swatch}
											<button
												class="color-swatch-button"
												type="button"
												style={`--swatch: ${swatch};`}
												aria-label={`Use ${swatch}`}
												on:click={() => chooseSwatch('secondary', swatch)}
											></button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</section>
		</div>
		</section>
	{/if}
</main>

<style>
	.page-shell {
		min-height: 100vh;
		padding: clamp(1rem, 2vw, 2rem);
	}

	.account-loading {
		position: fixed;
		inset: 0;
		z-index: 1200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--shell-bg-base);
		color: var(--shell-text);
		opacity: 1;
		transition: opacity 180ms ease;
		pointer-events: all;
	}

	.account-loading.is-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.loading-spinner {
		display: block;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		border: 4px solid rgba(148, 163, 184, 0.35);
		border-top-color: var(--shell-spotlight-primary, #58a6ff);
		animation: account-spin 850ms linear infinite;
	}

	@keyframes account-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.account-page {
		--panel: color-mix(in srgb, var(--shell-bg-base) 88%, black 12%);
		--input: color-mix(in srgb, var(--shell-bg-base) 86%, black 14%);
		--border: var(--shell-border);
		--text: var(--shell-text);
		--muted: var(--shell-muted);
		--primary: var(--shell-spotlight-primary, #7c3aed);
		--secondary: var(--shell-spotlight-secondary, #06b6d4);
		--shadow: var(--shell-shadow);
		--focus: 0 0 0 3px color-mix(in srgb, var(--primary) 32%, transparent);
		max-width: 640px;
		margin: 1rem auto 0;
		color: var(--text);
	}

	.account-header {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 1rem;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border-radius: 0.9rem;
		background: linear-gradient(
			135deg,
			var(--primary) 0%,
			color-mix(in srgb, var(--primary) 64%, var(--secondary)) 56%,
			var(--secondary) 100%
		);
		color: white;
		font-size: 0.9rem;
		font-weight: 900;
		letter-spacing: 0.08em;
	}

	h1,
	p {
		margin: 0;
	}

	h1 {
		font-size: clamp(1.45rem, 4vw, 1.9rem);
		line-height: 1.1;
	}

	.account-email {
		margin-top: 0.2rem;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.card {
		border: 1px solid var(--border);
		border-radius: 1rem;
		background: var(--panel);
		box-shadow: var(--shadow);
		overflow: visible;
	}

	.setting {
		position: relative;
		padding: 1rem;
	}

	.setting + .setting {
		border-top: 1px solid var(--border);
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.setting-title {
		font-size: 0.95rem;
		font-weight: 800;
	}

	.setting-value {
		margin-top: 0.18rem;
		color: var(--muted);
		font-size: 0.86rem;
		line-height: 1.35;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 5.75rem;
		min-height: 2.1rem;
		border: 1px solid var(--border);
		border-radius: 0.65rem;
		padding: 0.42rem 0.68rem;
		background: transparent;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
	}

	.btn:hover {
		background: color-mix(in srgb, var(--text) 6%, transparent);
	}

	.btn:focus-visible,
	input:focus-visible {
		outline: none;
		box-shadow: var(--focus);
	}

	.btn.primary {
		border-color: color-mix(in srgb, var(--primary) 58%, var(--border));
		background: var(--primary);
		color: white;
	}

	.btn.compact {
		width: auto;
		min-width: 0;
		padding-inline: 0.62rem;
	}

	.editor {
		--editor-space: 0.62rem;
		display: none;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: var(--editor-space);
		row-gap: 0.5rem;
		margin-top: 0.72rem;
		padding-inline: var(--editor-space);
		box-sizing: border-box;
	}

	.setting.is-open .editor {
		display: grid;
	}

	.field {
		display: grid;
		gap: 0.26rem;
		min-width: 0;
	}

	.field.full {
		grid-column: 1 / -1;
	}

	label,
	.input-label {
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 750;
	}

	input[type='text'],
	input[type='email'],
	input[type='password'],
	input[type='number'] {
		width: 100%;
		box-sizing: border-box;
		min-height: 1.82rem;
		border: 1px solid var(--border);
		border-radius: 0.52rem;
		padding: 0.28rem 0.48rem;
		background: var(--input);
		color: var(--text);
		font-size: 0.8rem;
		line-height: 1.2;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		grid-column: 1 / -1;
	}

	.section-feedback {
		display: block;
		margin-top: 0.7rem;
		font-size: 0.82rem;
		font-weight: 750;
		line-height: 1.35;
		text-align: center;
	}

	.section-feedback.success {
		color: #22c55e;
	}

	.section-feedback.error {
		color: #ef4444;
	}

	.appearance-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.55rem;
		flex-wrap: nowrap;
		min-width: 0;
	}

	.theme-toggle,
	.color-mode-toggle {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.2rem;
		background: var(--input);
		cursor: pointer;
		touch-action: none;
		user-select: none;
	}

	.theme-toggle {
		width: 13.5rem;
		flex: 1 1 auto;
		min-width: 10rem;
	}

	.color-mode-toggle {
		align-self: stretch;
	}

	.theme-slider-thumb,
	.color-mode-slider-thumb {
		position: absolute;
		top: 0.2rem;
		bottom: 0.2rem;
		left: 0.2rem;
		z-index: 0;
		width: calc((100% - 0.4rem) / 3);
		border-radius: 999px;
		background: var(--primary);
		box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 24%, transparent);
		transition:
			transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
			background 160ms ease;
		pointer-events: none;
	}

	.theme-slider-thumb {
		transform: translateX(var(--theme-thumb-x, calc(var(--theme-index, 1) * 100%)));
	}

	.color-mode-slider-thumb {
		transform: translateX(var(--format-thumb-x, calc(var(--format-index, 0) * 100%)));
	}

	.theme-toggle.is-dragging .theme-slider-thumb,
	.color-mode-toggle.is-dragging .color-mode-slider-thumb {
		transition: none;
	}

	.theme-toggle button,
	.color-mode-toggle button {
		position: relative;
		z-index: 1;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font-weight: 850;
		cursor: pointer;
		transition: color 160ms ease;
		border: none;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
	}

	.theme-toggle button {
		min-height: 1.8rem;
		padding: 0 0.55rem;
		font-size: 0.75rem;
	}

	.color-mode-toggle button {
		min-height: 0;
		height: 100%;
		padding: 0;
		font-size: 0.72rem;
	}

	.theme-toggle button[aria-pressed='true'],
	.color-mode-toggle button[aria-pressed='true'] {
		color: white;
	}

	.color-picker {
		position: relative;
	}

	.color-dot {
		display: block;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--color);
		cursor: pointer;
	}

	.color-dot[aria-expanded='true'] {
		box-shadow: var(--focus);
	}

	.color-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 100;
		display: grid;
		gap: 0.8rem;
		width: min(30rem, calc(100vw - 2rem));
		border: 1px solid var(--border);
		border-radius: 1rem;
		padding: 0.85rem;
		background: var(--panel);
		box-shadow: var(--shadow);
	}

	.color-popover-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.color-popover-title {
		font-size: 0.85rem;
		font-weight: 850;
		color: var(--text);
		white-space: nowrap;
	}

	.color-live-value {
		color: var(--muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.color-picker-surface {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr);
		gap: 0.85rem;
		align-items: start;
	}

	.wheel-column {
		display: grid;
		grid-template-rows: 11rem 3.35rem;
		gap: 0.65rem;
	}

	.wheel-stage {
		position: relative;
		width: 11rem;
		height: 11rem;
	}

	.color-wheel-canvas,
	.sv-canvas {
		display: block;
		width: 100%;
		height: 100%;
		border: 1px solid var(--border);
		cursor: crosshair;
		touch-action: none;
		user-select: none;
	}

	.color-wheel-canvas {
		border-radius: 50%;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.05),
			0 0 0 1px rgba(0, 0, 0, 0.08);
	}

	.sv-stage {
		display: grid;
		grid-template-rows: 11rem 3.35rem;
		gap: 0.65rem;
		min-width: 0;
	}

	.sv-wrap {
		position: relative;
		height: 11rem;
		min-width: 0;
	}

	.sv-canvas {
		border-radius: 0.8rem;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.04),
			0 0 0 1px rgba(0, 0, 0, 0.06);
	}

	.picker-handle {
		position: absolute;
		z-index: 3;
		width: 1rem;
		height: 1rem;
		border: 2px solid white;
		border-radius: 999px;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.35);
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.format-field {
		display: grid;
		grid-template-rows: 0.75rem 1fr;
		gap: 0.25rem;
		min-height: 0;
	}

	.format-field .input-label {
		text-align: center;
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.color-inputs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		height: 3.35rem;
		align-items: stretch;
	}

	.color-inputs.hex-mode {
		grid-template-columns: 1fr;
	}

	.color-inputs label {
		display: grid;
		grid-template-rows: 0.75rem 1fr;
		gap: 0.25rem;
		min-height: 0;
		min-width: 0;
	}

	.color-inputs span {
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-align: center;
		text-transform: uppercase;
	}

	.color-inputs input {
		width: 100%;
		box-sizing: border-box;
		min-height: 0;
		height: 100%;
		padding: 0.45rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.58rem;
		background: var(--input);
		color: var(--text);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.78rem;
		font-weight: 760;
		text-align: center;
	}

	.color-inputs input[type='number'] {
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.color-inputs input[type='number']::-webkit-outer-spin-button,
	.color-inputs input[type='number']::-webkit-inner-spin-button {
		margin: 0;
		-webkit-appearance: none;
	}

	.color-swatches {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 0.35rem;
		padding-top: 5px;
	}

	.color-swatch-button {
		aspect-ratio: 1;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: var(--swatch);
		cursor: pointer;
		width: 50px;
		height: 25px;
	}

	.color-swatch-button:hover,
	.color-swatch-button:focus-visible {
		outline: none;
		box-shadow: var(--focus);
	}

	@media (max-width: 600px) {
		.setting-row {
			align-items: stretch;
			flex-direction: column;
		}

		.editor {
			grid-template-columns: 1fr;
		}

		.actions {
			justify-content: stretch;
		}

		.btn {
			width: 100%;
		}

		.appearance-controls {
			width: 100%;
			flex-wrap: nowrap;
			gap: 0.45rem;
		}

		.theme-toggle {
			width: auto;
			min-width: 0;
		}

		.color-popover {
			--popover-scale: clamp(0.76, calc((100vw - 1.25rem) / 30rem), 1);
			width: 30rem;
			left: 50%;
			right: auto;
			transform: translateX(-50%) scale(var(--popover-scale));
			transform-origin: top center;
		}
	}
</style>
