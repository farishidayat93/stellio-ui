<script lang="ts">
	import './layout.css';
	import logo from '#lib/assets/logo.svg';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ThemeSwitcher from '../lib/ThemeSwitcher.svelte';
	import HostSwitcher from '../lib/HostSwitcher.svelte';

	let { children, data }: LayoutProps = $props();

	/**
	 * `as const` keeps the route ids as string literals, which is what
	 * `resolve()` expects; the filter only drops the sections this
	 * deployment has disabled.
	 */
	const navItems = $derived(
		(
			[
				{ href: '/entities', label: 'Entities', enabled: data.features.entityTypes },
				{ href: '/subscriptions', label: 'Subscriptions', enabled: data.features.subscriptions },
				{ href: '/attributes', label: 'Attributes', enabled: data.features.attributes }
			] as const
		).filter((i) => i.enabled)
	);
</script>

<div class="flex h-screen flex-col bg-canvas text-ink" style="--accent-base: {data.accent}">
	<header class="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-6">
		<a
			href={resolve('/')}
			class="mr-2 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
		>
			<img src={logo} alt="Stellio" class="h-6 w-6" />
			<span class="text-sm font-semibold tracking-tight">Stellio UI</span>
		</a>
		<nav class="flex flex-1 items-center gap-1">
			{#each navItems as item (item.href)}
				<a
					href={resolve(item.href)}
					class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors
						{page.url.pathname === item.href
						? 'bg-accent text-accent-ink'
						: 'text-ink-muted hover:bg-surface-2 hover:text-ink'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>
		{#if data.multiHost && data.hosts.length > 0}
			<!-- Multi-host: switch the broker the app talks to, without leaving the page. -->
			<HostSwitcher hosts={data.hosts} active={data.activeHost} />
		{/if}
		<ThemeSwitcher />
		<a
			href={resolve('/settings')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors
				{page.url.pathname === '/settings'
				? 'bg-accent text-accent-ink'
				: 'text-ink-muted hover:bg-surface-2 hover:text-ink'}"
		>
			Settings
		</a>
	</header>

	<main class="flex-1 overflow-y-auto p-8">
		{#if !data.stellioConfigured && page.url.pathname !== '/settings' && page.url.pathname !== '/'}
			<!-- Guardrail: no host/port in env or db — ask the user to connect. The
			     landing page is exempt so its cards (and the Settings link) stay
			     reachable; it renders the banner below instead. -->
			<div class="mx-auto flex h-full max-w-md flex-col items-center justify-center">
				<div class="w-full space-y-4 rounded-lg border border-line bg-surface p-8 text-center">
					<div>
						<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Not connected</p>
						<h1 class="mt-1.5 text-lg font-semibold">Connect to a Stellio context broker</h1>
					</div>
					<p class="text-sm text-ink-muted">
						No Stellio host and port are configured yet. Set <code
							class="rounded bg-surface-2 px-1 py-0.5 text-xs">STELLIO_HOST</code
						>
						and <code class="rounded bg-surface-2 px-1 py-0.5 text-xs">STELLIO_PORT</code> in your environment,
						or add them on the Settings page.
					</p>
					<a
						href={resolve('/settings')}
						class="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors"
					>
						Go to Settings
					</a>
				</div>
			</div>
		{:else}
			{#if !data.stellioConfigured}
				<div
					class="mb-6 rounded-md border border-danger-ink/40 bg-danger-soft px-4 py-3 text-sm text-danger-ink"
				>
					Not connected — enter a Stellio host and port below to get started.
				</div>
			{/if}
			{@render children()}
		{/if}
	</main>
</div>
