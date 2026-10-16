<script lang="ts">
	import type { PageProps } from './$types';
	import axios from 'axios';

	let { data }: PageProps = $props();

	type AttributeDetail = { attributeName: string; attributeTypes: string[] };
	type TypeInfo = { entityCount: number; attributeDetails: AttributeDetail[] };

	let selected = $state<{ typeName: string; entityCount: number } | null>(null);
	let attributes = $state<AttributeDetail[]>([]);
	let loading = $state(false);

	async function selectType(typeName: string, entityCount: number) {
		if (selected?.typeName === typeName) { selected = null; attributes = []; return; }
		selected = { typeName, entityCount };
		loading = true;
		const { data: info }: { data: TypeInfo } = await axios.get(`/api/types/${typeName}`);
		attributes = info.attributeDetails;
		loading = false;
	}
</script>

<div class="flex gap-6 h-full">
	<!-- Type list -->
	<div class="w-72 shrink-0">
		{#if data.types.length === 0}
			<p class="text-gray-500 text-sm">No types found.</p>
		{:else}
			<ul class="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white">
				{#each data.types as type}
					<li>
						<button
							onclick={() => selectType(type.typeName, type.entityCount)}
							class="w-full px-4 py-3 text-sm text-left transition-colors flex items-center justify-between
								{selected?.typeName === type.typeName ? data.t.active : 'hover:bg-gray-50'}"
						>
							<span class="font-medium">{type.typeName}</span>
							<span class="flex flex-col items-end text-xs text-gray-400">
								<span>{type.entityCount} entities</span>
								<span>{type.attributeCount} attrs</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Right panel -->
	{#if selected}
		<div class="flex-1 border border-gray-200 rounded-lg bg-white overflow-y-auto">
			<div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
				<div>
					<span class="font-semibold text-sm">{selected.typeName}</span>
					<span class="ml-2 text-xs text-gray-400">{selected.entityCount} entities</span>
				</div>
				<button onclick={() => { selected = null; attributes = []; }} class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
			</div>

			{#if loading}
				<p class="text-xs text-gray-400 p-5">Loading...</p>
			{:else}
				<div class="p-5 space-y-4">
					{#each attributes as attr}
						<div class="space-y-1">
							<div class="flex items-center gap-2">
								<label class="text-sm font-medium text-gray-700">{attr.attributeName}</label>
								{#each attr.attributeTypes as t}
									<span class="px-1.5 py-0.5 rounded text-xs {data.t.badge}">{t}</span>
								{/each}
							</div>

							{#if attr.attributeTypes.includes('GeoProperty')}
								<div class="flex gap-2">
									<input type="number" placeholder="Latitude" class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
									<input type="number" placeholder="Longitude" class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
								</div>
							{:else if attr.attributeTypes.includes('Relationship')}
								<input type="text" placeholder="Entity URN..." class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
							{:else}
								<input type="text" placeholder="Value..." class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex-1 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
			Select a type to view its attributes
		</div>
	{/if}
</div>
