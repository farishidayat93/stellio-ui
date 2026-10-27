<script lang="ts">
	import type { AttributeDetail } from '../entities';

	type Props = {
		attributes: AttributeDetail[];
		/** Two-way bound collapse state; `onFilter` closes it. */
		open?: boolean;
		/** Collapses the list and opens the filters panel. */
		onFilter: () => void;
	};

	let { attributes, open = $bindable(false), onFilter }: Props = $props();
</script>

<!-- Collapsible attribute list, collapsed by default so a wide type does not
     push the entity table below the fold. -->
<div class="shrink-0 border-b border-line-soft">
	<div class="flex items-center gap-2 px-5 py-2.5">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			class="flex flex-1 items-center justify-between text-left text-xs text-ink-muted hover:text-ink"
		>
			<span class="font-medium">
				Attributes
				<span class="text-ink-faint">({attributes.length})</span>
			</span>
			<span class="text-ink-faint">{open ? '▲' : '▼'}</span>
		</button>
		<!-- Shortcut into the filters panel below: filtering is the faster route to
		     a smaller table than scrolling this list, and it collapses the list so
		     the panel it opens is fully visible. -->
		<button
			type="button"
			onclick={onFilter}
			title="Open the filters"
			class="rounded border border-line px-2 py-1 text-xs text-ink-muted hover:bg-surface-2"
			>Filter</button
		>
	</div>
	{#if open}
		<div class="max-h-48 overflow-y-auto px-5 pb-3">
			<div class="flex flex-wrap gap-2">
				{#each attributes as attr (attr.attributeName)}
					<span class="rounded bg-surface-2 px-2 py-1 text-xs text-ink-muted">
						{attr.attributeName}
						{#each attr.attributeTypes as t (t)}
							<span class="rounded bg-accent-soft px-1 py-0.5 text-accent-soft-ink">{t}</span>
						{/each}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
