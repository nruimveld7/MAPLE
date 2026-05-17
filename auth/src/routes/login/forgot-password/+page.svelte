<script>
	import { browser } from '$app/environment';
	import { resolveShellTheme } from '$shell';
	import '$shell/shell.css';

	export let data;
	export let form;

	$: shellTheme = resolveShellTheme({ mode: 'dark' });

	$: {
		if (browser) {
			document.documentElement.dataset.theme = shellTheme.mode;
			document.documentElement.style.setProperty('--shell-spotlight-primary', shellTheme.primary);
			document.documentElement.style.setProperty('--shell-spotlight-secondary', shellTheme.secondary);
		}
	}
</script>

<svelte:head>
	<title>{data.brandName} Reset Password</title>
</svelte:head>

<main class="reset-page">
	<section class="reset-card" aria-label="Password reset form">
		<h1>Reset your password</h1>
		<p>Enter your email and we will send a temporary password if an active account exists.</p>

		<form method="POST" class="reset-form">
			<label for="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				placeholder="you@example.com"
				required
			/>
			<button type="submit">Send temporary password</button>
		</form>

		{#if form?.message}
			<p class="status-message" class:error={form?.success !== true}>{form.message}</p>
		{/if}

		<p class="back-link-row">
			<a href="/auth/login">Back to sign in</a>
		</p>
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

	.reset-page {
		height: 100dvh;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: clamp(1.25rem, 3vw, 3rem);
		background: #06080c;
		color: #f0f6fc;
	}

	.reset-card {
		width: min(460px, 100%);
		display: grid;
		gap: 1rem;
		padding: clamp(1.5rem, 4vw, 2.25rem);
		border: 1px solid rgba(240, 246, 252, 0.12);
		border-radius: 22px;
		background: rgba(13, 17, 23, 0.84);
	}

	h1 {
		margin: 0;
		font-size: clamp(1.6rem, 4.5vw, 2.05rem);
		letter-spacing: -0.04em;
	}

	p {
		margin: 0;
		color: rgba(240, 246, 252, 0.8);
		line-height: 1.55;
	}

	.reset-form {
		display: grid;
		gap: 0.6rem;
	}

	label {
		font-size: 0.9rem;
		font-weight: 700;
		color: rgba(240, 246, 252, 0.9);
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

	input::placeholder {
		color: rgba(240, 246, 252, 0.34);
	}

	input:focus {
		border-color: #58a6ff;
		box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.18);
		background: rgba(13, 17, 23, 0.94);
	}

	button {
		margin-top: 0.25rem;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(135deg, #58a6ff, #a855f7);
		color: white;
		padding: 0.9rem 1rem;
		font: inherit;
		font-weight: 850;
		cursor: pointer;
	}

	.status-message {
		padding: 0.7rem 0.8rem;
		border-radius: 12px;
		background: rgba(34, 197, 94, 0.14);
		color: #ccfbe2;
		font-size: 0.92rem;
	}

	.status-message.error {
		background: rgba(239, 68, 68, 0.16);
		color: #fecaca;
	}

	.back-link-row {
		margin-top: 0.4rem;
	}

	a {
		color: #9ecbff;
		font-weight: 650;
		text-decoration: none;
	}

	a:hover {
		color: #cfe6ff;
		text-decoration: underline;
	}
</style>
