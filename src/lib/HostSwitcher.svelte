<script lang="ts">
	import axios from 'axios';
	import { invalidateAll } from '$app/navigation';
	import type { HostChoice } from './hosts';

	/**
	 * Saved Stellio connections, supplied by the layout (server) so the switcher
	 * renders with the rest of the header. Shown next to the theme switcher and
	 * only while multi-host is enabled in Settings.
	 */
	let { hosts, active }: { hosts: HostChoice[]; active: string } = $props();

	// Writable derived: locally reassigned by the user's selection, and reset
	// whenever the layout reloads with a new connection (a switch, or a host
	// saved on the Settings page).
	let selected = $derived(active);
	let switching = $state(false);
	let error = $state('');

	async function switchHost(key: string) {
		if (!key || key === active || switching) return;
		switching = true;
		error = '';
		try {
			await axios.post('/api/settings', { active_host: key });
			// Every cached response and every page loaded so far belongs to the
			// previous broker, so reload the layout and the page it wraps.
			await invalidateAll();
		} catch (err) {
			error =
				axios.isAxiosError(err) && err.response?.data?.error
					? String(err.response.data.error)
					: 'Could not switch connection.';
			setTimeout(() => (error = ''), 4000);
		} finally {
			switching = false;
			// Reverts the control when the switch failed; a successful switch
			// re-reads `active` from the reloaded layout data.
			selected = active;
		}
	}
</script>

<div class="flex items-center gap-2">
	{#if error}
		<span class="text-xs text-danger-ink" role="alert">{error}</span>
	{/if}
	<label class="sr-only" for="host-switcher">Stellio connection</label>
	<select
		id="host-switcher"
		bind:value={selected}
		onchange={() => switchHost(selected)}
		disabled={switching}
		title="Switch Stellio connection"
		class="h-8 max-w-56 rounded-lg border border-line bg-surface-2 px-2 text-sm font-medium text-ink-muted transition-colors outline-none hover:text-ink focus:ring-2 focus:ring-accent-ring disabled:opacity-60"
	>
		{#each hosts as host (host.key)}
			<option value={host.key}>{host.label}</option>
		{/each}
	</select>
</div>
