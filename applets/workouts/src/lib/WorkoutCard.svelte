<script>
	export let item;
	export let exercise;
	export let drawerOpen = false;
	export let onOpen = () => {};
	export let onDragStart = () => {};

	function handleOpen() {
		onOpen?.();
	}

	function handleDragStart(event) {
		event.stopPropagation();
		onDragStart?.(event);
	}

	function metricLabel(target) {
		const label = target?.label || 'Metric';
		const value = target?.value || '';
		const unit = target?.unit || '';
		const combined = [value, unit].filter(Boolean).join(' ');
		return [label, combined].filter(Boolean).join(': ');
	}
</script>

<article class="workout-card" data-drag-source role="button" tabindex="0" on:click={handleOpen}>
	<span class="card-controls">
		<span class="handle" title="Drag Exercise" on:pointerdown={handleDragStart}>
			⋮⋮
		</span>
	</span>

	<div class="card-data">
		<div class="workout-title">{exercise?.name ?? 'Unknown Exercise'}</div>
		{#if item?.targets?.length}
			<div class="metric-group">
				<div class="metric-chip-row">
					{#each item.targets as target}
						<span class="card-chip target-chip">{metricLabel(target)}</span>
					{/each}
				</div>
			</div>
		{:else if exercise?.metrics?.length}
			<div class="metric-group">
				<div class="metric-chip-row">
					{#each exercise.metrics as metric}
						<span class="card-chip">
							{[metric.name || 'Metric', [metric.value || '', metric.unit || ''].filter(Boolean).join(' ')]
								.filter(Boolean)
								.join(': ')}
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</article>
