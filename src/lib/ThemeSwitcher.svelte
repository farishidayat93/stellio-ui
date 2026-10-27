<script lang="ts">
	import { onMount } from 'svelte';
	import { themeModes, themeState } from './theme.svelte';

	// The boot script in src/app.html already applied the saved theme to <html>.
	// Read it after hydration so the active indicator matches without a
	// server/client markup mismatch.
	onMount(() => themeState.sync());
</script>

<div
	class="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
	role="group"
	aria-label="Color theme"
>
	{#each themeModes as mode (mode.id)}
		<button
			type="button"
			onclick={() => themeState.set(mode.id)}
			class="flex h-7 w-7 items-center justify-center rounded-md transition-colors
				{themeState.current === mode.id
				? 'bg-surface text-accent-ink shadow-sm'
				: 'text-ink-faint hover:text-ink'}"
			title={mode.label}
			aria-label="{mode.label} theme"
			aria-pressed={themeState.current === mode.id}
		>
			{#if mode.id === 'light'}
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="4" />
					<path
						d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
					/>
				</svg>
			{:else if mode.id === 'dark'}
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
				</svg>
			{:else}
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
				</svg>
			{/if}
		</button>
	{/each}
</div>
