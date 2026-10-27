<script lang="ts">
	import { cellValue, type AppliedFilter, type AttributeDetail, type Entity } from '../entities';

	type Props = {
		entities: Entity[];
		attributes: AttributeDetail[];
		/** Set when the rows are the result of a filter, which changes the empty text. */
		applied: AppliedFilter | null;
		page: number;
		hasMore: boolean;
		totalPages: number;
		showPager: boolean;
		onPage: (page: number) => void;
	};

	let { entities, attributes, applied, page, hasMore, totalPages, showPager, onPage }: Props =
		$props();
</script>

<!-- Entity table -->
<div class="flex-1 overflow-auto">
	<table class="w-full text-xs">
		<thead class="sticky top-0 border-b border-line bg-surface-2">
			<tr>
				<th class="px-4 py-2 text-left font-medium whitespace-nowrap text-ink-muted">ID</th>
				{#each attributes as attr (attr.attributeName)}
					<th class="px-4 py-2 text-left font-medium whitespace-nowrap text-ink-muted"
						>{attr.attributeName}</th
					>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y divide-line-soft">
			{#each entities as entity (entity.id)}
				<tr class="hover:bg-surface-2">
					<td class="max-w-[200px] truncate px-4 py-2 font-mono text-ink-muted" title={entity.id}
						>{entity.id}</td
					>
					{#each attributes as attr (attr.attributeName)}
						<td
							class="max-w-[160px] truncate px-4 py-2 text-ink-muted"
							title={cellValue(entity, attr.attributeName)}
						>
							{cellValue(entity, attr.attributeName)}
						</td>
					{/each}
				</tr>
			{:else}
				<tr
					><td colspan={attributes.length + 1} class="px-4 py-4 text-center text-ink-faint"
						>{applied ? 'No entities match the filters.' : 'No entities found.'}</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</div>

<!-- Pagination. While filtering the total is unknown, so the label
     reports the page and whether another one exists. -->
{#if showPager}
	<div class="flex shrink-0 items-center justify-between border-t border-line-soft px-5 py-3">
		<button
			onclick={() => onPage(page - 1)}
			disabled={page === 0}
			class="rounded border border-line px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
			>← Prev</button
		>
		<span class="text-xs text-ink-muted">
			{applied ? `Page ${page + 1}` : `Page ${page + 1} of ${totalPages}`}
		</span>
		<button
			onclick={() => onPage(page + 1)}
			disabled={applied ? !hasMore : page >= totalPages - 1}
			class="rounded border border-line px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
			>Next →</button
		>
	</div>
{/if}
