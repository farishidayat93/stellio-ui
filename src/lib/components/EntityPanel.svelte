<script lang="ts">
	import EntityAttributes from './EntityAttributes.svelte';
	import EntityFilters from './EntityFilters.svelte';
	import EntityTable from './EntityTable.svelte';
	import type { AppliedFilter, AttributeDetail, Entity, TypeRow } from '../entities';

	type Props = {
		/** The selected type, with the counts shown in the header. */
		row: TypeRow;
		attributes: AttributeDetail[];
		entities: Entity[];
		filterValues: Record<string, string>;
		applied: AppliedFilter | null;
		filterError: string;
		loading: boolean;
		page: number;
		hasMore: boolean;
		totalPages: number;
		showPager: boolean;
		onClose: () => void;
		onApply: () => void;
		onClearFilters: () => void;
		onPage: (page: number) => void;
	};

	let {
		row,
		attributes,
		entities,
		filterValues,
		applied,
		filterError,
		loading,
		page,
		hasMore,
		totalPages,
		showPager,
		onClose,
		onApply,
		onClearFilters,
		onPage
	}: Props = $props();

	// Both sections start collapsed: on a wide type their content is long enough
	// to push the entity table below the fold.
	let attributesOpen = $state(false);
	let filtersOpen = $state(false);
</script>

<!-- Right panel -->
<div class="flex min-w-0 flex-1 flex-col rounded-lg border border-line bg-surface">
	<!-- Header -->
	<div
		class="flex shrink-0 items-center justify-between border-b border-line-soft bg-surface-2 px-5 py-4"
	>
		<div>
			<span class="text-sm font-semibold">{row.typeName}</span>
			<span class="ml-2 text-xs text-ink-faint">
				{row.entityCount ?? '—'} entities{applied ? ' (filtered)' : ''}
			</span>
		</div>
		<button onclick={onClose} class="text-lg leading-none text-ink-faint hover:text-ink-muted"
			>&times;</button
		>
	</div>

	{#if loading}
		<p class="p-5 text-xs text-ink-faint">Loading...</p>
	{:else}
		<EntityAttributes
			bind:open={attributesOpen}
			{attributes}
			onFilter={() => {
				attributesOpen = false;
				filtersOpen = true;
			}}
		/>
		<EntityFilters
			bind:open={filtersOpen}
			{attributes}
			{filterValues}
			{applied}
			{filterError}
			{onApply}
			onClear={onClearFilters}
		/>
		<EntityTable
			{entities}
			{attributes}
			{applied}
			{page}
			{hasMore}
			{totalPages}
			{showPager}
			{onPage}
		/>
	{/if}
</div>
