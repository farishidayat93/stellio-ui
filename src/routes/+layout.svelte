<script lang="ts">
	import './layout.css';
	import logo from '#lib/assets/logo.svg';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';

	let { children, data }: LayoutProps = $props();

	const navItems = $derived(
		[
			{ href: '/', label: 'Entity Types', enabled: data.features.entityTypes },
			{ href: '/subscriptions', label: 'Subscriptions', enabled: data.features.subscriptions },
			{ href: '/attributes', label: 'Attributes', enabled: data.features.attributes }
		].filter((i) => i.enabled)
	);
</script>

<div class="flex flex-col h-screen bg-gray-50 text-gray-800">
	<header class="bg-white border-b border-gray-200 flex items-center gap-4 px-6 h-12 shrink-0">
		<div class="flex items-center gap-2 mr-2">
			<img src={logo} alt="Stellio" class="h-6 w-6" />
			<span class="text-sm font-semibold tracking-tight">Stellio UI</span>
		</div>
		<nav class="flex items-center gap-1 flex-1">
			{#each navItems as item}
				<a
					href={item.href}
					class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
						{page.url.pathname === item.href
							? data.t.active
							: 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>
		<a
			href="/settings"
			class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
				{page.url.pathname === '/settings'
					? data.t.active
					: 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}"
		>
			Settings
		</a>
	</header>

	<main class="flex-1 overflow-y-auto p-8">
		{@render children()}
	</main>
</div>
