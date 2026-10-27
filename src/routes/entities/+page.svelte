<script lang="ts">
	import type { PageProps } from './$types';
	import axios from 'axios';
	import { onMount } from 'svelte';
	// Relative rather than `#lib/concurrency`: svelte-check cannot resolve the
	// package `#lib/*` imports (or `$lib`) with this project's tsconfig.
	import { runPool } from '../../lib/concurrency';
	import EntityPanel from '../../lib/components/EntityPanel.svelte';
	import TypeList from '../../lib/components/TypeList.svelte';
	import {
		HYDRATION_CONCURRENCY,
		PAGE_SIZE,
		REQUEST_TIMEOUT_MS,
		buildGeoQuery,
		buildQuery,
		emptyFilterValues,
		invalidRelationshipFilters,
		type AppliedFilter,
		type AttributeDetail,
		type Entity,
		type TypeInfo,
		type TypeRow
	} from '../../lib/entities';

	let { data }: PageProps = $props();

	const api = axios.create({ timeout: REQUEST_TIMEOUT_MS });

	// The server render is the initial value on purpose: the list paints from it
	// and hydration fills the rows it could not wait for.
	// svelte-ignore state_referenced_locally
	let rows = $state<TypeRow[]>(data.types.map((type: TypeRow) => ({ ...type })));
	/** Attribute details learned while hydrating, reused when a type is selected. */
	let details = $state<Record<string, AttributeDetail[]>>({});
	let countFailures = $state<string[]>([]);
	let selectedType = $state<string | null>(null);
	let attributes = $state<AttributeDetail[]>([]);
	let entities = $state<Entity[]>([]);
	let filterValues = $state<Record<string, string>>({});
	let loading = $state(false);
	let page = $state(0);
	let search = $state('');
	/** The filter the entity query is actually narrowed by, or null. */
	let applied = $state<AppliedFilter | null>(null);
	/** Rejection message for the last submit; the inputs keep their values. */
	let filterError = $state('');
	/**
	 * Whether the filtered result set has another page. The cached type count is
	 * the *unfiltered* count, so it cannot drive pagination while filtering.
	 */
	let hasMore = $state(false);

	/**
	 * Which request the current selection belongs to. A response for a type the
	 * user has already switched away from is dropped instead of overwriting the
	 * panel with rows that no longer belong to the selection.
	 */
	let requestToken = 0;

	const selectedRow = $derived(rows.find((row) => row.typeName === selectedType) ?? null);
	const totalPages = $derived(
		selectedRow?.entityCount ? Math.ceil(selectedRow.entityCount / PAGE_SIZE) : 0
	);
	/**
	 * Filtered pages cannot know the total, so the pager appears whenever there
	 * is a page to move to rather than when `totalPages > 1`.
	 */
	const showPager = $derived(applied ? page > 0 || hasMore : totalPages > 1);

	function updateRow(typeName: string, patch: Partial<TypeRow>) {
		rows = rows.map((row) => (row.typeName === typeName ? { ...row, ...patch } : row));
	}

	/**
	 * Fills in the counts and attributes the server render did not wait for.
	 * Stellio aggregates a whole type to answer them (~20s on a 500k-entity
	 * type), so they trickle in instead of holding up the first paint.
	 */
	async function hydratePendingRows() {
		const pending = rows.filter((row) => row.pending);
		if (pending.length === 0) return;

		await runPool(pending, HYDRATION_CONCURRENCY, async (row: TypeRow) => {
			try {
				const { data: info } = await api.get<TypeInfo>(`/api/types/${row.typeName}`);
				details[row.typeName] = info.attributeDetails;
				updateRow(row.typeName, {
					entityCount: info.entityCount,
					attributeCount: info.attributeDetails.length,
					pending: false
				});
			} catch {
				// Nothing to show for this row: stop retrying and report it once.
				updateRow(row.typeName, { pending: false });
				countFailures = [...countFailures, row.typeName];
			}
		});
	}

	async function retryCountFailures() {
		const failed = countFailures;
		countFailures = [];
		for (const typeName of failed) updateRow(typeName, { pending: true });
		await hydratePendingRows();
	}

	/** Loads one type's attributes, caching the result for later selection. */
	async function fetchTypeInfo(typeName: string): Promise<AttributeDetail[]> {
		const { data: info } = await api.get<TypeInfo>(`/api/types/${typeName}`);
		details[typeName] = info.attributeDetails;
		updateRow(typeName, {
			entityCount: info.entityCount,
			attributeCount: info.attributeDetails.length,
			pending: false
		});
		return info.attributeDetails;
	}

	/**
	 * One page of entities of `typeName`, narrowed by `filter` when there is one.
	 *
	 * A filtered page asks for one row more than it shows: whether that extra row
	 * exists is the only cheap way to know a next page exists, since the cached
	 * type count counts the unfiltered type and Stellio's `count=true` was
	 * measured at ~60x the cost of a plain page.
	 */
	async function loadEntities(
		typeName: string,
		offset: number,
		filter: AppliedFilter | null
	): Promise<{ entities: Entity[]; hasMore: boolean }> {
		// Explicit key/value pairs rather than a `URLSearchParams`: the mutable
		// built-in is not a reactive Svelte collection, and there is nothing to
		// track here anyway — the string is serialised immediately. Encoding
		// with `encodeURIComponent` is equivalent once Stellio's `searchParams`
		// decodes it, and it leaves the NGSI-LD `q` grammar readable in logs.
		const params: Array<[string, string]> = [
			['type', typeName],
			['offset', String(offset)],
			['limit', String(filter ? PAGE_SIZE + 1 : PAGE_SIZE)]
		];
		if (filter?.q) params.push(['q', filter.q]);
		if (filter?.geo) {
			params.push(['lat', String(filter.geo.lat)]);
			params.push(['lng', String(filter.geo.lng)]);
			params.push(['distance', String(filter.geo.distance)]);
		}
		const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

		const { data } = await api.get<Entity[]>(`/api/entities?${query}`);
		if (!filter) return { entities: data, hasMore: false };
		return { entities: data.slice(0, PAGE_SIZE), hasMore: data.length > PAGE_SIZE };
	}

	function clearSelection() {
		requestToken += 1;
		selectedType = null;
		attributes = [];
		entities = [];
		filterValues = {};
		applied = null;
		filterError = '';
		hasMore = false;
		page = 0;
		loading = false;
	}

	async function selectType(typeName: string) {
		if (selectedType === typeName) {
			clearSelection();
			return;
		}

		const token = ++requestToken;
		selectedType = typeName;
		page = 0;
		attributes = [];
		entities = [];
		filterValues = {};
		applied = null;
		filterError = '';
		hasMore = false;
		loading = true;

		try {
			// A type that was already hydrated needs one request: its entity page.
			const [attributeDetails, firstPage] = await Promise.all([
				details[typeName] ?? fetchTypeInfo(typeName),
				loadEntities(typeName, 0, null)
			]);
			if (token !== requestToken) return;

			attributes = attributeDetails;
			entities = firstPage.entities;
			// Reset filter inputs for the newly selected type
			filterValues = emptyFilterValues(attributeDetails);
		} catch {
			if (token !== requestToken) return;
			entities = [];
		} finally {
			if (token === requestToken) loading = false;
		}
	}

	/**
	 * Snapshots the panel into `applied` and reloads page 0. Editing the inputs
	 * afterwards does not re-query until the next submit.
	 */
	async function applyFilters() {
		const typeName = selectedType;
		if (!typeName || loading) return;

		const invalid = invalidRelationshipFilters(attributes, filterValues);
		if (invalid.length > 0) {
			filterError = `Enter a full entity URN for: ${invalid.join(', ')}`;
			return;
		}

		filterError = '';
		const { q, count } = buildQuery(attributes, filterValues);
		const geo = buildGeoQuery(attributes, filterValues);
		// The badge counts inputs, and a geo pair is one filter whatever its radius.
		applied = q === '' && geo === null ? null : { q, geo, count: count + (geo ? 1 : 0) };
		await goToPage(0);
	}

	/** Drops every filter, input and applied, and reloads the unfiltered first page. */
	async function clearFilters() {
		filterValues = emptyFilterValues(attributes);
		filterError = '';
		applied = null;
		await goToPage(0);
	}

	async function goToPage(target: number) {
		const typeName = selectedType;
		if (!typeName || target < 0) return;

		const token = ++requestToken;
		const filter = applied;
		page = target;
		loading = true;

		try {
			const result = await loadEntities(typeName, target * PAGE_SIZE, filter);
			if (token !== requestToken) return;
			entities = result.entities;
			hasMore = result.hasMore;
		} catch {
			if (token !== requestToken) return;
			entities = [];
			hasMore = false;
		} finally {
			if (token === requestToken) loading = false;
		}
	}

	onMount(() => {
		void hydratePendingRows();
	});
</script>

<div class="flex h-full gap-6">
	<TypeList
		bind:search
		{rows}
		{selectedType}
		{countFailures}
		onSelect={(typeName) => void selectType(typeName)}
		onRetry={() => void retryCountFailures()}
	/>

	{#if selectedRow}
		<EntityPanel
			row={selectedRow}
			{attributes}
			{entities}
			{filterValues}
			{applied}
			{filterError}
			{loading}
			{page}
			{hasMore}
			{totalPages}
			{showPager}
			onClose={clearSelection}
			onApply={() => void applyFilters()}
			onClearFilters={() => void clearFilters()}
			onPage={(target) => void goToPage(target)}
		/>
	{:else}
		<div
			class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-faint"
		>
			Select a type to view its entities
		</div>
	{/if}
</div>
