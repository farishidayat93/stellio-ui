<script lang="ts">
	import type { PageProps } from './$types';
	import axios from 'axios';

	let { data }: PageProps = $props();

	type AttributeInfo = { attributeTypes: string[]; typeNames: string[]; attributeCount: number };

	const FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'json'] as const;
	type FieldType = (typeof FIELD_TYPES)[number];

	type Config = { fieldType: FieldType; defaultValue: string };

	let search = $state('');
	let filtered = $derived(
		search ? data.attributes.filter((a) => a.toLowerCase().includes(search.toLowerCase())) : data.attributes
	);

	let selected = $state<string | null>(null);
	let info = $state<AttributeInfo | null>(null);
	let loading = $state(false);
	let config = $state<Config>({ fieldType: 'text', defaultValue: '' });
	let saved = $state(false);

	async function selectAttribute(name: string) {
		if (selected === name) { selected = null; info = null; return; }
		selected = name;
		loading = true;
		saved = false;
		const { data: res } = await axios.get(`/api/attributes/${name}`);
		info = res;
		const ngsiType = res.attributeTypes?.[0];
		config = {
			fieldType: res.config?.field_type ?? (ngsiType === 'GeoProperty' ? 'json' : 'text'),
			defaultValue: res.config?.default_value ?? ''
		};
		loading = false;
	}

	async function save() {
		await axios.post(`/api/attributes/${selected}`, { fieldType: config.fieldType, defaultValue: config.defaultValue });
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}
</script>

<div class="flex gap-6 h-full">
	<!-- Left: attribute list -->
	<div class="w-72 shrink-0 flex flex-col gap-3">
		<div class="flex items-center justify-between">
			<span class="text-xs text-gray-400">{filtered.length} of {data.attributes.length}</span>
		</div>
		<input
			type="search"
			placeholder="Search..."
			bind:value={search}
			class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 {data.t.ring}"
		/>
		<ul class="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white overflow-y-auto">
			{#each filtered as attr}
				<li>
					<button
						onclick={() => selectAttribute(attr)}
						class="w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center justify-between
							{selected === attr ? data.t.active : 'hover:bg-gray-50'}"
					>
						<span>{attr}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Right: editor panel -->
	{#if selected}
		<div class="flex-1 border border-gray-200 rounded-lg bg-white overflow-y-auto">
			<div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="font-semibold text-sm">{selected}</span>
					{#if info}
						{#each info.attributeTypes as t}
							<span class="px-1.5 py-0.5 rounded text-xs {data.t.badge}">{t}</span>
						{/each}
					{/if}
				</div>
				<button onclick={() => { selected = null; info = null; }} class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
			</div>

			{#if loading}
				<p class="text-xs text-gray-400 p-5">Loading...</p>
			{:else if info}
				<div class="p-5 space-y-6">
					<!-- Used by -->
					<div class="space-y-2">
						<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Used by {info.attributeCount} entities across</p>
						<div class="flex flex-wrap gap-1">
							{#each info.typeNames as typeName}
								<span class="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">{typeName}</span>
							{/each}
						</div>
					</div>

					<hr class="border-gray-100" />

					<!-- Field type -->
					<div class="space-y-2">
						<label class="text-xs font-medium text-gray-500 uppercase tracking-wide">Field Type</label>
						<div class="flex gap-2 flex-wrap">
							{#each FIELD_TYPES as ft}
								<button
									onclick={() => { config.fieldType = ft; config.defaultValue = ''; }}
									class="px-3 py-1.5 rounded-md text-sm border transition-colors
										{config.fieldType === ft ? data.t.active + ' border-transparent' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}"
								>
									{ft}
								</button>
							{/each}
						</div>
					</div>

					<!-- Default value -->
					<div class="space-y-2">
						<label class="text-xs font-medium text-gray-500 uppercase tracking-wide">Default Value</label>
						{#if config.fieldType === 'boolean'}
							<select bind:value={config.defaultValue} class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}">
								<option value="">— none —</option>
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						{:else if config.fieldType === 'date'}
							<input type="date" bind:value={config.defaultValue} class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						{:else if config.fieldType === 'json'}
							<textarea
								bind:value={config.defaultValue}
								rows={4}
								placeholder="empty object"
								class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring} font-mono resize-none"
							></textarea>
						{:else if config.fieldType === 'number'}
							<input type="number" bind:value={config.defaultValue} placeholder="0" class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						{:else}
							<input type="text" bind:value={config.defaultValue} placeholder="Default value..." class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						{/if}
					</div>

					<button
						onclick={save}
						class="px-4 py-2 rounded-md text-sm font-medium transition-colors {saved ? 'bg-green-100 text-green-700' : data.t.active}"
					>
						{saved ? 'Saved ✓' : 'Save'}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex-1 flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
			Select an attribute to configure it
		</div>
	{/if}
</div>
