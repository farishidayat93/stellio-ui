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
		search
			? data.attributes.filter((a) => a.toLowerCase().includes(search.toLowerCase()))
			: data.attributes
	);

	let selected = $state<string | null>(null);
	let info = $state<AttributeInfo | null>(null);
	let loading = $state(false);
	let config = $state<Config>({ fieldType: 'text', defaultValue: '' });
	let saved = $state(false);

	async function selectAttribute(name: string) {
		if (selected === name) {
			selected = null;
			info = null;
			return;
		}
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
		await axios.post(`/api/attributes/${selected}`, {
			fieldType: config.fieldType,
			defaultValue: config.defaultValue
		});
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}
</script>

<div class="flex h-full gap-6">
	<!-- Left: attribute list -->
	<div class="flex w-72 shrink-0 flex-col gap-3">
		<div class="flex items-center justify-between">
			<span class="text-xs text-ink-faint">{filtered.length} of {data.attributes.length}</span>
		</div>
		<input
			type="search"
			placeholder="Search..."
			bind:value={search}
			class="rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
		/>
		<ul class="divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
			{#each filtered as attr (attr)}
				<li>
					<button
						onclick={() => selectAttribute(attr)}
						class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors
							{selected === attr ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2'}"
					>
						<span>{attr}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Right: editor panel -->
	{#if selected}
		<div class="flex-1 overflow-y-auto rounded-lg border border-line bg-surface">
			<div class="flex items-center justify-between border-b border-line-soft px-5 py-4">
				<div class="flex items-center gap-2">
					<span class="text-sm font-semibold">{selected}</span>
					{#if info}
						{#each info.attributeTypes as t (t)}
							<span class="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-ink"
								>{t}</span
							>
						{/each}
					{/if}
				</div>
				<button
					onclick={() => {
						selected = null;
						info = null;
					}}
					class="text-lg leading-none text-ink-faint hover:text-ink-muted">&times;</button
				>
			</div>

			{#if loading}
				<p class="p-5 text-xs text-ink-faint">Loading...</p>
			{:else if info}
				<div class="space-y-6 p-5">
					<!-- Used by -->
					<div class="space-y-2">
						<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">
							Used by {info.attributeCount} entities across
						</p>
						<div class="flex flex-wrap gap-1">
							{#each info.typeNames as typeName (typeName)}
								<span class="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-muted"
									>{typeName}</span
								>
							{/each}
						</div>
					</div>

					<hr class="border-line-soft" />

					<!-- Caption, not a label: the buttons below are one choice among
					     several alternatives, so no single control owns it. -->
					<div class="space-y-2">
						<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Field Type</p>
						<div class="flex flex-wrap gap-2">
							{#each FIELD_TYPES as ft (ft)}
								<button
									onclick={() => {
										config.fieldType = ft;
										config.defaultValue = '';
									}}
									class="rounded-md border px-3 py-1.5 text-sm transition-colors
										{config.fieldType === ft
										? 'bg-accent text-accent-ink' + ' border-transparent'
										: 'border-line text-ink-muted hover:bg-surface-2'}"
								>
									{ft}
								</button>
							{/each}
						</div>
					</div>

					<!-- Caption, not a label: the control below depends on the field
					     type, so no single control owns it. -->
					<div class="space-y-2">
						<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Default Value</p>
						{#if config.fieldType === 'boolean'}
							<select
								bind:value={config.defaultValue}
								class="w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
							>
								<option value="">— none —</option>
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						{:else if config.fieldType === 'date'}
							<input
								type="date"
								bind:value={config.defaultValue}
								class="w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
							/>
						{:else if config.fieldType === 'json'}
							<textarea
								bind:value={config.defaultValue}
								rows={4}
								placeholder="empty object"
								class="w-full resize-none rounded-md border border-line px-3 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-accent-ring"
							></textarea>
						{:else if config.fieldType === 'number'}
							<input
								type="number"
								bind:value={config.defaultValue}
								placeholder="0"
								class="w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
							/>
						{:else}
							<input
								type="text"
								bind:value={config.defaultValue}
								placeholder="Default value..."
								class="w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
							/>
						{/if}
					</div>

					<button
						onclick={save}
						class="rounded-md px-4 py-2 text-sm font-medium transition-colors {saved
							? 'bg-success-soft text-success-ink'
							: 'bg-accent text-accent-ink'}"
					>
						{saved ? 'Saved ✓' : 'Save'}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div
			class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-faint"
		>
			Select an attribute to configure it
		</div>
	{/if}
</div>
