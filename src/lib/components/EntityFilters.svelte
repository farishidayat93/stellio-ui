<script lang="ts">
	import {
		DEFAULT_GEO_DISTANCE_M,
		FILTER_HINT,
		GEO_DISTANCE_KEY,
		GEO_LAT_KEY,
		GEO_LNG_KEY,
		isValidEntityId,
		splitOperator,
		type AppliedFilter,
		type AttributeDetail
	} from '../entities';

	type Props = {
		attributes: AttributeDetail[];
		/**
		 * Input values keyed by attribute name (plus the synthetic geo keys).
		 * Mutated in place: the parent owns the object and re-reads it on submit.
		 */
		filterValues: Record<string, string>;
		/** The filter currently narrowing the entity query, or null. */
		applied: AppliedFilter | null;
		/** Rejection message for the last submit. */
		filterError: string;
		/** Two-way bound collapse state. */
		open?: boolean;
		onApply: () => void;
		onClear: () => void;
	};

	let {
		attributes,
		filterValues,
		applied,
		filterError,
		open = $bindable(false),
		onApply,
		onClear
	}: Props = $props();
</script>

<!-- Collapsible filters. The whole section is one form so the submit can live
     in the header: Enter in any input submits it too. -->
<form
	class="shrink-0 border-b border-line-soft"
	onsubmit={(event) => {
		event.preventDefault();
		onApply();
	}}
>
	<div class="flex items-center gap-2 px-5 py-2.5">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			class="flex flex-1 items-center justify-between text-left text-xs text-ink-muted hover:text-ink"
		>
			<span class="font-medium">
				Filters
				{#if applied}
					<span class="text-ink-faint">({applied.count} applied)</span>
				{/if}
			</span>
			<span class="text-ink-faint">{open ? '▲' : '▼'}</span>
		</button>
		{#if applied}
			<button
				type="button"
				onclick={onClear}
				class="rounded border border-line px-2 py-1 text-xs text-ink-muted hover:bg-surface-2"
				>Clear</button
			>
		{/if}
		<button
			type="submit"
			class="rounded bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink hover:opacity-90"
			>Apply</button
		>
	</div>
	{#if open}
		<div class="max-h-64 overflow-y-auto px-5 pb-3">
			<!-- Read before typing, not after: the operators are only useful while
			     the values are being entered. -->
			<p class="mb-3 text-[10px] text-ink-faint">{FILTER_HINT}</p>
			<div class="grid grid-cols-2 gap-3">
				{#each attributes as attr (attr.attributeName)}
					<div class="space-y-1">
						<!-- Caption, not a label: the control below it is either a single input, an
						     enum select or a lat/lng/radius trio, so no single control owns it. -->
						<div class="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
							{attr.attributeName}
							<!-- Only types that change the control are badged: an attribute is a
							     Property unless it says otherwise, so that badge is noise. -->
							{#each attr.attributeTypes.filter((t) => t !== 'Property') as t (t)}
								<span class="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-ink"
									>{t}</span
								>
							{/each}
						</div>
						{#if attr.attributeTypes.includes('Relationship')}
							{@const relValue = splitOperator(filterValues[attr.attributeName] ?? '').operand}
							{@const relValid = relValue.trim() === '' || isValidEntityId(relValue)}
							<input
								type="text"
								placeholder="urn:ngsi-ld:Type:id"
								bind:value={filterValues[attr.attributeName]}
								class="w-full rounded border px-2 py-1 text-xs outline-none focus:ring-2 {relValid
									? 'border-line'
									: 'border-danger-ink'} focus:ring-accent-ring"
							/>
							{#if !relValid}
								<p class="text-[10px] text-danger-ink">Enter a valid NGSI-LD entity URN</p>
							{/if}
						{:else if attr.attributeTypes.includes('GeoProperty')}
							<div class="flex gap-1">
								<input
									type="number"
									step="any"
									placeholder="Lat"
									bind:value={filterValues[`${attr.attributeName}${GEO_LAT_KEY}`]}
									class="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent-ring"
								/>
								<input
									type="number"
									step="any"
									placeholder="Lng"
									bind:value={filterValues[`${attr.attributeName}${GEO_LNG_KEY}`]}
									class="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent-ring"
								/>
								<input
									type="number"
									min="1"
									placeholder={String(DEFAULT_GEO_DISTANCE_M)}
									title="Radius in metres, applied when both coordinates are set"
									bind:value={filterValues[`${attr.attributeName}${GEO_DISTANCE_KEY}`]}
									class="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent-ring"
								/>
							</div>
						{:else}
							<input
								type="text"
								placeholder="Value..."
								bind:value={filterValues[attr.attributeName]}
								class="w-full rounded border border-line px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent-ring"
							/>
						{/if}
					</div>
				{/each}
			</div>
			{#if filterError}
				<p class="mt-2 text-xs text-danger-ink">{filterError}</p>
			{/if}
		</div>
	{/if}
</form>
