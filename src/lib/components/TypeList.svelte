<script lang="ts">
	import type { TypeRow } from '../entities';

	type Props = {
		/** Every type reported by Stellio, hydrated counts included. */
		rows: TypeRow[];
		/** Two-way bound name filter. */
		search?: string;
		selectedType: string | null;
		/** Types whose count/attribute lookup failed and can be retried. */
		countFailures: string[];
		onSelect: (typeName: string) => void;
		onRetry: () => void;
	};

	let {
		rows,
		search = $bindable(''),
		selectedType,
		countFailures,
		onSelect,
		onRetry
	}: Props = $props();

	const filteredTypes = $derived(
		search ? rows.filter((row) => row.typeName.toLowerCase().includes(search.toLowerCase())) : rows
	);
</script>

<!-- Type list -->
<div class="flex w-72 shrink-0 flex-col gap-3">
	{#if rows.length === 0}
		<p class="text-sm text-ink-muted">No types found.</p>
	{:else}
		<div class="flex items-center justify-between">
			<span class="text-xs text-ink-faint">{filteredTypes.length} of {rows.length}</span>
		</div>
		<input
			type="search"
			placeholder="Search..."
			bind:value={search}
			class="rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
		/>
		{#if countFailures.length > 0}
			<p class="text-xs text-danger-ink">
				{countFailures.length} type(s) could not be counted.
				<button onclick={onRetry} class="underline hover:no-underline">Retry</button>
			</p>
		{/if}
		{#if filteredTypes.length === 0}
			<p class="text-sm text-ink-muted">No types match "{search}".</p>
		{:else}
			<ul class="divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
				{#each filteredTypes as type (type.typeName)}
					<li>
						<button
							onclick={() => onSelect(type.typeName)}
							class="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors
								{selectedType === type.typeName ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}"
						>
							<span class="font-medium">{type.typeName}</span>
							<span class="flex flex-col items-end text-xs text-ink-faint">
								<span>{type.pending ? '···' : (type.entityCount ?? '—')} entities</span>
								<span>{type.pending ? '···' : (type.attributeCount ?? '—')} attrs</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
