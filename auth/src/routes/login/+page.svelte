<script>
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { resolveShellTheme } from '$shell';
	import '$shell/shell.css';

	export let data;
	export let form;

	let mode = form?.mode === 'signup' ? 'signup' : 'login';
	let showPassword = false;
	let showConfirmPassword = false;
	let firstName = form?.firstName ?? '';
	let lastName = form?.lastName ?? '';
	let email = form?.email ?? '';
	let password = '';
	let confirmPassword = '';
	let inviteCode = form?.inviteCode ?? '';

	$: redirectTo = data.redirectTo;
	$: isSignup = mode === 'signup';
	$: pageTitle = isSignup ? 'Create Account' : 'Sign In';
	$: passwordAutocomplete = isSignup ? 'new-password' : 'current-password';
	$: shellTheme = resolveShellTheme({ mode: 'dark' });

	$: {
		if (browser) {
			document.documentElement.dataset.theme = shellTheme.mode;
			document.documentElement.style.setProperty('--shell-spotlight-primary', shellTheme.primary);
			document.documentElement.style.setProperty('--shell-spotlight-secondary', shellTheme.secondary);
		}
	}

	function setMode(nextMode) {
		mode = nextMode;
		showPassword = false;
		showConfirmPassword = false;
	}
</script>

<svelte:head>
	<title>{data.brandName} {pageTitle}</title>
</svelte:head>

<main class="auth-page">
	<section class="auth-card" aria-label="Authentication form">
		<div class="brand">
			<div class="brand-mark">NR</div>

			{#if isSignup}
				<h1>Create account</h1>
				<p>Use your invite code to get started.</p>
			{:else}
				<h1>Welcome back</h1>
				<p>Sign in to continue.</p>
			{/if}
		</div>

		<div class="mode-toggle" role="tablist" aria-label="Choose authentication mode">
			<button
				type="button"
				class:active={!isSignup}
				role="tab"
				aria-selected={!isSignup}
				on:click={() => setMode('login')}
			>
				Sign In
			</button>

			<button
				type="button"
				class:active={isSignup}
				role="tab"
				aria-selected={isSignup}
				on:click={() => setMode('signup')}
			>
				Create Account
			</button>
		</div>

		<form class="auth-form" method="POST" use:enhance>
			<input type="hidden" name="mode" value={mode} />
			<input type="hidden" name="redirectTo" value={redirectTo} />

			{#if isSignup}
				<div class="field-grid">
					<label>
						<span>First Name</span>
						<input
							name="firstName"
							type="text"
							autocomplete="given-name"
							placeholder="First name"
							bind:value={firstName}
						/>
					</label>

					<label>
						<span>Last Name</span>
						<input
							name="lastName"
							type="text"
							autocomplete="family-name"
							placeholder="Last name"
							bind:value={lastName}
						/>
					</label>
				</div>
			{/if}

			<label>
				<span>Email</span>
				<input
					name="email"
					type="email"
					autocomplete="email"
					placeholder="you@example.com"
					bind:value={email}
					required
				/>
			</label>

			<label>
				<span>Password</span>
				<div class="password-input-wrap">
					<input
						name="password"
						type={showPassword ? 'text' : 'password'}
						autocomplete={passwordAutocomplete}
						placeholder="Password"
						bind:value={password}
						required
					/>
					<button
						class="password-toggle"
						type="button"
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						on:click={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
								<path d="M2 12s3.8-8 10-8 10 8 10 8-3.8 8-10 8S2 12 2 12z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 3l18 18" />
								<path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42" />
								<path d="M9.88 5.09A9.8 9.8 0 0 1 12 4c5 0 9.27 3.11 11 8-0.5 1.41-1.31 2.73-2.36 3.86" />
								<path d="M6.61 6.61C4.62 8 3.2 9.87 2 12c1.73 4.89 6 8 10 8 1.72 0 3.37-.41 4.84-1.16" />
							</svg>
						{/if}
					</button>
				</div>
			</label>

			{#if !isSignup}
				<p class="forgot-password-row">
					<a class="forgot-password-link" href="/auth/login/forgot-password">Forgot your password?</a>
				</p>
			{/if}

			{#if isSignup}
				<label>
					<span>Confirm Password</span>
					<div class="password-input-wrap">
						<input
							name="confirmPassword"
							type={showConfirmPassword ? 'text' : 'password'}
							autocomplete="new-password"
							placeholder="Confirm password"
							bind:value={confirmPassword}
						/>
						<button
							class="password-toggle"
							type="button"
							aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
							on:click={() => (showConfirmPassword = !showConfirmPassword)}
						>
							{#if showConfirmPassword}
								<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
									<path d="M2 12s3.8-8 10-8 10 8 10 8-3.8 8-10 8S2 12 2 12z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							{:else}
								<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3 3l18 18" />
									<path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-4.42" />
									<path d="M9.88 5.09A9.8 9.8 0 0 1 12 4c5 0 9.27 3.11 11 8-0.5 1.41-1.31 2.73-2.36 3.86" />
									<path d="M6.61 6.61C4.62 8 3.2 9.87 2 12c1.73 4.89 6 8 10 8 1.72 0 3.37-.41 4.84-1.16" />
								</svg>
							{/if}
						</button>
					</div>
				</label>

				<label>
					<span>Invite Code</span>
					<input
						name="inviteCode"
						type="text"
						autocomplete="off"
						inputmode="text"
						placeholder="Invite code"
						bind:value={inviteCode}
					/>
				</label>

				<p class="form-help">Invite codes are sent by email.</p>
			{/if}

			{#if form?.message}
				<p class="form-error">{form.message}</p>
			{/if}

			<button class="submit-button" type="submit">
				{isSignup ? 'Create Account' : 'Sign In'}
			</button>
		</form>

		{#if isSignup}
			<p class="secondary-actions">
				Already have an account?
				<button type="button" on:click={() => setMode('login')}>Sign in</button>
			</p>
		{:else}
			<p class="secondary-actions">
				Need an account?
				<button type="button" on:click={() => setMode('signup')}>Create one</button>
			</p>
		{/if}
	</section>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html),
	:global(body) {
		min-height: 100%;
		margin: 0;
	}

	:global(body) {
		color: var(--shell-text);
		overflow-x: hidden;
	}

	.auth-page {
		height: 100dvh;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: clamp(1.25rem, 3vw, 3rem);
	}

	.auth-card {
		width: min(460px, 100%);
		display: grid;
		gap: 1.35rem;
		padding: clamp(1.5rem, 4vw, 2.25rem);
		border: 1px solid var(--shell-border);
		border-radius: 28px;
		background: color-mix(in srgb, var(--shell-bg-base) 88%, black 12%);
		box-shadow: var(--shell-shadow);
		backdrop-filter: blur(18px);
	}

	.brand {
		display: grid;
		justify-items: center;
		gap: 0.8rem;
		text-align: center;
	}

	.brand-mark {
		width: 54px;
		height: 54px;
		border-radius: 18px;
		display: grid;
		place-items: center;
		background: linear-gradient(
			135deg,
			var(--shell-spotlight-primary),
			var(--shell-spotlight-secondary)
		);
		box-shadow: 0 12px 36px color-mix(in srgb, var(--shell-spotlight-primary) 40%, transparent);
		font-weight: 900;
		color: white;
		letter-spacing: -0.05em;
	}

	.brand h1 {
		margin: 0;
		font-size: clamp(1.85rem, 5vw, 2.4rem);
		letter-spacing: -0.055em;
	}

	.brand p {
		margin: 0;
		color: color-mix(in srgb, var(--shell-text) 68%, transparent);
		line-height: 1.5;
	}

	.mode-toggle {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
		padding: 0.35rem;
		border: 1px solid rgba(240, 246, 252, 0.12);
		border-radius: 16px;
		background: rgba(13, 17, 23, 0.72);
	}

	.mode-toggle button {
		border: 0;
		border-radius: 12px;
		padding: 0.75rem 0.9rem;
		background: transparent;
		color: rgba(240, 246, 252, 0.68);
		font: inherit;
		font-weight: 800;
		cursor: pointer;
		transition: background 180ms ease, color 180ms ease, box-shadow 180ms ease;
	}

	.mode-toggle button.active {
		background: linear-gradient(135deg, #58a6ff, #a855f7);
		color: white;
		box-shadow: 0 12px 28px rgba(88, 166, 255, 0.2);
	}

	.auth-form {
		display: grid;
		gap: 0.95rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.85rem;
	}

	label {
		display: grid;
		gap: 0.45rem;
	}

	label span {
		font-size: 0.86rem;
		font-weight: 750;
		color: rgba(240, 246, 252, 0.84);
	}

	input {
		width: 100%;
		border: 1px solid rgba(240, 246, 252, 0.14);
		border-radius: 13px;
		background: rgba(13, 17, 23, 0.78);
		color: #f0f6fc;
		padding: 0.9rem 1rem;
		font: inherit;
		outline: none;
		transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
	}

	.password-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.password-input-wrap input {
		padding-right: 2.85rem;
	}

	.password-toggle {
		position: absolute;
		right: 0.48rem;
		top: 50%;
		transform: translateY(-50%);
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: rgba(240, 246, 252, 0.7);
		padding: 0;
		border-radius: 10px;
		cursor: pointer;
	}

	.password-toggle:hover {
		color: #dbeafe;
		background: rgba(88, 166, 255, 0.14);
	}

	.password-toggle svg {
		width: 1.05rem;
		height: 1.05rem;
	}

	input::placeholder {
		color: rgba(240, 246, 252, 0.34);
	}

	input:focus {
		border-color: #58a6ff;
		box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.18);
		background: rgba(13, 17, 23, 0.94);
	}

	.form-help {
		margin: -0.2rem 0 0;
		color: rgba(240, 246, 252, 0.58);
		font-size: 0.84rem;
		line-height: 1.5;
	}

	.forgot-password-row {
		margin: -0.25rem 0 0;
		text-align: right;
	}

	.forgot-password-link {
		color: #9ecbff;
		font-size: 0.86rem;
		font-weight: 650;
		text-decoration: none;
	}

	.forgot-password-link:hover {
		color: #cfe6ff;
		text-decoration: underline;
	}

	.submit-button {
		margin-top: 0.3rem;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(135deg, #58a6ff, #a855f7);
		color: white;
		padding: 1rem;
		font: inherit;
		font-weight: 900;
		cursor: pointer;
		box-shadow: 0 16px 42px rgba(88, 166, 255, 0.23);
		transition: transform 180ms ease, filter 180ms ease;
	}

	.submit-button:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}

	.secondary-actions {
		display: flex;
		justify-content: center;
		gap: 0.4rem;
		margin: 0;
		color: rgba(240, 246, 252, 0.62);
		font-size: 0.92rem;
		text-align: center;
	}

	.secondary-actions button {
		border: 0;
		background: transparent;
		color: #58a6ff;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
		padding: 0;
	}

	.secondary-actions button:hover {
		text-decoration: underline;
	}

	.form-error {
		margin: 0;
		padding: 0.8rem 0.9rem;
		border: 1px solid rgba(248, 81, 73, 0.35);
		border-radius: 13px;
		background: rgba(248, 81, 73, 0.1);
		color: #ffb4ad;
		font-size: 0.9rem;
		line-height: 1.45;
	}

	@media (max-width: 560px) {
		.auth-page {
			padding: 1rem;
		}

		.auth-card {
			border-radius: 24px;
		}

		.field-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
