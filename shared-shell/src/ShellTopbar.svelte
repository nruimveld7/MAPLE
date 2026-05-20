<script lang="ts">
	export let title: string;
	export let initials = 'U';
	export let isMenuOpen = false;
	export let userName = 'User';
	export let userMeta = '';
	export let showManageAccount = true;

	export let onToggleMenu: (event: MouseEvent) => void;
	export let onMyApps: () => void = () => {
		window.location.href = '/';
	};
	export let onManageAccount: () => void;
	export let onLogout: () => void;
</script>

<header>
	<div class="user-menu-shell">
		<div>
			<button
				class="brand-mark"
				id="user-menu-button"
				type="button"
				aria-haspopup="menu"
				aria-expanded={isMenuOpen}
				aria-controls="user-menu"
				on:click={onToggleMenu}
			>
				{initials}
			</button>

			<div
				class="user-menu"
				class:is-open={isMenuOpen}
				id="user-menu"
				aria-labelledby="user-menu-button"
				on:click|stopPropagation
			>
				<div class="user-menu-header">
					<div class="user-menu-name">{userName}</div>
					{#if userMeta}
						<div class="user-menu-meta">{userMeta}</div>
					{/if}
				</div>

				<div class="user-menu-divider"></div>
				<button class="user-menu-item" type="button" role="menuitem" on:click={onMyApps}>
					My Apps
				</button>

				{#if showManageAccount}
					<div class="user-menu-divider"></div>
					<button class="user-menu-item" type="button" role="menuitem" on:click={onManageAccount}>
						Manage Account
					</button>
				{/if}

				

				<div class="user-menu-divider"></div>
				<button class="user-menu-item is-danger" type="button" role="menuitem" on:click={onLogout}>
					Log Out
				</button>
			</div>
		</div>
	</div>

	<section class="hero">
		<div>
			<h1>{title}</h1>
		</div>
	</section>
</header>
