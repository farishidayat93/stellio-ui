<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * The sections of the app, filtered down to the ones this deployment enables.
	 * Settings is always available: it is where an unconfigured instance is set up.
	 */
	const cards = $derived(
		[
			{
				href: resolve('/entities'),
				title: 'Entities',
				description:
					'Browse every entity type, see how many entities it holds, inspect its attributes and filter the entities it contains.',
				enabled: data.features.entityTypes
			},
			{
				href: resolve('/subscriptions'),
				title: 'Subscriptions',
				description:
					'Inspect the subscriptions registered with the broker, their triggers, notification endpoints and delivery counts.',
				enabled: data.features.subscriptions
			},
			{
				href: resolve('/attributes'),
				title: 'Attributes',
				description:
					'Review every attribute found across the types and decide which ones are shown as forms, with their field type and value.',
				enabled: data.features.attributes
			},
			{
				href: resolve('/settings'),
				title: 'Settings',
				description:
					'Point the UI at a Stellio context broker, test the connection and choose the local database that caches type information.',
				enabled: true
			}
		].filter((card) => card.enabled)
	);

	const endpoint = $derived(
		data.connection.host && data.connection.port
			? `${data.connection.host}:${data.connection.port}`
			: null
	);
</script>

<div class="mx-auto max-w-3xl space-y-8">
	<header class="space-y-3">
		<p class="text-xs font-medium tracking-wide text-ink-faint uppercase">NGSI-LD context broker</p>
		<h1 class="text-2xl font-semibold tracking-tight">Stellio UI</h1>
		<p class="max-w-xl text-sm text-ink-muted">
			Explore the entities, subscriptions and attributes of a Stellio context broker, and tune how
			this UI connects to it.
		</p>
	</header>

	<div class="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
		<span
			class="h-2 w-2 shrink-0 rounded-full {data.stellioConfigured
				? 'bg-success-ink'
				: 'bg-danger-ink'}"
		></span>
		{#if endpoint}
			<span class="text-ink-muted">
				Connected to <code class="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs"
					>{endpoint}</code
				>
			</span>
		{:else}
			<span class="text-ink-muted">No context broker configured yet.</span>
		{/if}
		{#if !data.stellioConfigured}
			<a
				href={resolve('/settings')}
				class="ml-auto text-xs font-medium text-accent-soft-ink hover:underline">Configure</a
			>
		{/if}
	</div>

	<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		{#each cards as card (card.href)}
			<li>
				<a
					href={card.href}
					class="flex h-full flex-col gap-1.5 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-accent-ring hover:bg-surface-2"
				>
					<span class="text-sm font-semibold">{card.title}</span>
					<span class="text-xs leading-relaxed text-ink-muted">{card.description}</span>
				</a>
			</li>
		{/each}
	</ul>
</div>
