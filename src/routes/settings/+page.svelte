<script lang="ts">
	import type { PageProps } from './$types';
	import axios from 'axios';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data }: PageProps = $props();

	/** Result of probing one connection, as the host list renders it. */
	type Health = { checking: boolean; ok: boolean; latencyMs: number; error: string };

	// The loaded settings are the initial value on purpose: these are edit
	// fields, so a later reload must not overwrite what the user is typing.
	// svelte-ignore state_referenced_locally
	let stellioHost = $state(data.stellio.host);
	// svelte-ignore state_referenced_locally
	let stellioPort = $state(data.stellio.port);
	// The name of the connection in use, so saving the form again keeps it
	// instead of clearing it.
	// svelte-ignore state_referenced_locally
	let stellioName = $state(data.stellio.hosts.find((host) => host.active)?.name ?? '');
	// svelte-ignore state_referenced_locally
	let multiHost = $state(data.stellio.multiHost);

	/** Saved connections, re-read from the layout after every change. */
	const savedHosts = $derived(data.stellio.hosts);

	let stellioStatus = $state<'idle' | 'saved' | 'error'>('idle');
	let stellioError = $state('');
	let multiHostStatus = $state<'idle' | 'saved' | 'error'>('idle');
	let hostsError = $state('');

	/**
	 * Per-connection health, keyed by `host:port`. Nothing is probed until the
	 * user asks (or the connection in use is checked once on open), so opening
	 * Settings never waits on an unreachable broker.
	 */
	let health = $state<Record<string, Health>>({});

	onMount(() => {
		// One probe for the connection in use: it is the one the app depends on,
		// and it makes the badge meaningful without the user pressing anything.
		const active = data.stellio.hosts.find((host) => host.active);
		if (active) checkHost(active.key);
	});

	async function checkHost(key: string) {
		health[key] = { checking: true, ok: false, latencyMs: 0, error: '' };
		try {
			const { data: result } = await axios.get<Omit<Health, 'checking'>>('/api/hosts/health', {
				params: { key }
			});
			health[key] = {
				checking: false,
				ok: result.ok,
				latencyMs: result.latencyMs,
				error: result.error
			};
		} catch (err) {
			health[key] = {
				checking: false,
				ok: false,
				latencyMs: 0,
				error: messageOf(err, 'Could not run the check.')
			};
		}
	}

	/** The server's error message, when it sent one. */
	function messageOf(err: unknown, fallback: string) {
		return axios.isAxiosError(err) && err.response?.data?.error
			? String(err.response.data.error)
			: fallback;
	}

	async function saveStellio() {
		stellioError = '';

		// Guardrail: require both fields before talking to the server.
		if (!stellioHost.trim() || !stellioPort.trim()) {
			stellioStatus = 'error';
			stellioError = 'Enter both a host and a port.';
			setTimeout(() => (stellioStatus = 'idle'), 2000);
			return;
		}
		if (!/^\d+$/.test(stellioPort.trim())) {
			stellioStatus = 'error';
			stellioError = 'The port must be a number.';
			setTimeout(() => (stellioStatus = 'idle'), 2000);
			return;
		}

		try {
			await axios.post('/api/settings', {
				stellio_host: stellioHost,
				stellio_port: stellioPort,
				host_name: stellioName
			});
			stellioStatus = 'saved';
			// Refresh the layout so the "not connected" guardrail clears and the
			// saved-host list picks up the new connection.
			await invalidateAll();
		} catch (err) {
			stellioStatus = 'error';
			stellioError = messageOf(err, 'Could not save the connection.');
		}
		setTimeout(() => (stellioStatus = 'idle'), 2000);
	}

	async function saveMultiHost(enabled: boolean) {
		hostsError = '';
		try {
			await axios.post('/api/settings', { multi_host: enabled });
			multiHost = enabled;
			multiHostStatus = 'saved';
			// Shows or hides the host switcher in the header.
			await invalidateAll();
		} catch (err) {
			multiHostStatus = 'error';
			hostsError = messageOf(err, 'Could not change the multi-host setting.');
		}
		setTimeout(() => (multiHostStatus = 'idle'), 2000);
	}

	/** Names (or un-names, with a blank value) a saved connection. */
	async function renameHost(key: string, name: string) {
		hostsError = '';
		try {
			await axios.post('/api/settings', { rename_host: key, host_name: name });
			await invalidateAll();
		} catch (err) {
			hostsError = messageOf(err, 'Could not name the connection.');
		}
	}

	async function removeHost(key: string) {
		hostsError = '';
		try {
			await axios.post('/api/settings', { remove_host: key });
			// The probe result belonged to a list entry that no longer exists.
			delete health[key];
			await invalidateAll();
			// The active connection is kept when it is the one removed, so the form
			// is re-read from the reloaded data rather than assumed empty.
			stellioHost = data.stellio.host;
			stellioPort = data.stellio.port;
			stellioName = data.stellio.hosts.find((host) => host.active)?.name ?? '';
		} catch (err) {
			hostsError = messageOf(err, 'Could not remove the connection.');
		}
	}
</script>

<div class="max-w-md space-y-6">
	<!-- Stellio -->
	<div class="space-y-4 rounded-lg border border-line bg-surface p-6">
		<div>
			<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Stellio Connection</p>
			<p class="mt-0.5 text-xs text-ink-faint">Changes take effect on the next request.</p>
		</div>
		<hr class="border-line-soft" />
		<div class="space-y-3">
			<div class="space-y-1.5">
				<label class="text-sm font-medium text-ink-muted" for="stellio-host">Host</label>
				<input
					id="stellio-host"
					type="text"
					bind:value={stellioHost}
					placeholder="e.g. 100.101.88.148"
					class="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
				/>
			</div>
			<div class="space-y-1.5">
				<label class="text-sm font-medium text-ink-muted" for="stellio-port">Port</label>
				<input
					id="stellio-port"
					type="text"
					bind:value={stellioPort}
					placeholder="e.g. 8765"
					class="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
				/>
			</div>
			<div class="space-y-1.5">
				<label class="text-sm font-medium text-ink-muted" for="stellio-name">
					Name <span class="font-normal text-ink-faint">(optional)</span>
				</label>
				<input
					id="stellio-name"
					type="text"
					bind:value={stellioName}
					maxlength={data.stellio.maxHostNameLength}
					placeholder="e.g. Production"
					class="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring"
				/>
			</div>
		</div>
		{#if stellioError}
			<p class="text-xs text-danger-ink">{stellioError}</p>
		{/if}
		<button
			onclick={saveStellio}
			class="rounded-md px-4 py-2 text-sm font-medium transition-colors
				{stellioStatus === 'saved'
				? 'bg-success-soft text-success-ink'
				: stellioStatus === 'error'
					? 'bg-danger-soft text-danger-ink'
					: 'bg-accent text-accent-ink'}"
		>
			{stellioStatus === 'saved' ? 'Saved ✓' : stellioStatus === 'error' ? 'Error ✗' : 'Save'}
		</button>

		<hr class="border-line-soft" />

		<!-- Multiple hosts -->
		<div class="space-y-3">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-sm font-medium text-ink-muted">Multiple hosts</p>
					<p class="mt-0.5 text-xs text-ink-faint">
						Show a connection switcher next to the theme switcher, so saved brokers can be swapped
						without coming back here.
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if multiHostStatus === 'saved'}
						<span class="text-xs text-success-ink">Saved ✓</span>
					{:else if multiHostStatus === 'error'}
						<span class="text-xs text-danger-ink">Error ✗</span>
					{/if}
					<button
						type="button"
						role="switch"
						aria-checked={multiHost}
						aria-label="Show the connection switcher in the header"
						onclick={() => saveMultiHost(!multiHost)}
						class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors
							{multiHost ? 'bg-accent' : 'border border-line bg-surface-2'}"
					>
						<span
							class="inline-block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform
								{multiHost ? 'translate-x-4' : 'translate-x-0.5'}"
						></span>
					</button>
				</div>
			</div>

			{#if savedHosts.length > 0}
				<ul class="space-y-1">
					{#each savedHosts as host (host.key)}
						{@const probe = health[host.key]}
						<li class="space-y-2 rounded-md border border-line px-3 py-2 text-sm">
							<div class="flex items-center justify-between gap-2">
								<span class="min-w-0 truncate text-ink-muted">
									{host.name || host.key}
									{#if host.active}
										<span class="ml-2 text-xs font-medium text-accent-ink">in use</span>
									{/if}
								</span>
								<div class="flex shrink-0 items-center gap-2">
									{#if probe?.checking}
										<span class="text-xs text-ink-faint" role="status">Checking…</span>
									{:else if probe}
										<span
											class="text-xs {probe.ok ? 'text-success-ink' : 'text-danger-ink'}"
											title={probe.ok ? `Answered in ${probe.latencyMs} ms` : probe.error}
										>
											{probe.ok ? `Reachable · ${probe.latencyMs} ms` : 'Unreachable'}
										</span>
									{/if}
									<button
										type="button"
										onclick={() => checkHost(host.key)}
										disabled={probe?.checking}
										class="rounded px-2 py-0.5 text-xs font-medium text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
									>
										Check
									</button>
									{#if host.saved}
										<button
											type="button"
											onclick={() => removeHost(host.key)}
											class="rounded px-2 py-0.5 text-xs font-medium text-ink-faint transition-colors hover:bg-surface-2 hover:text-danger-ink"
										>
											Remove
										</button>
									{/if}
								</div>
							</div>
							{#if host.saved}
								<div class="flex items-center gap-2">
									<label class="sr-only" for={`host-name-${host.key}`}>Name for {host.key}</label>
									<input
										id={`host-name-${host.key}`}
										type="text"
										value={host.name}
										maxlength={data.stellio.maxHostNameLength}
										placeholder="Name (optional)"
										onchange={(event) => renameHost(host.key, event.currentTarget.value)}
										class="w-full rounded border border-line bg-surface px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent-ring"
									/>
									{#if host.name}
										<span class="shrink-0 font-mono text-xs text-ink-faint">{host.key}</span>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="text-xs text-ink-faint">
					Up to {data.stellio.maxSavedHosts} connections are remembered, most recently used first. Give
					a connection a name to recognise it in the switcher, and press Check to probe it now. Removing
					the connection in use keeps the app on it until another is selected.
				</p>
			{:else}
				<p class="text-xs text-ink-faint">
					No connections saved yet — saving a host and port above adds it to the list.
				</p>
			{/if}
			{#if hostsError}
				<p class="text-xs text-danger-ink">{hostsError}</p>
			{/if}
		</div>
	</div>

	<!-- Database -->
	<div class="space-y-4 rounded-lg border border-line bg-surface p-6">
		<div>
			<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Database</p>
			<p class="mt-0.5 text-xs text-ink-faint">
				SQLite is the only supported engine for local storage.
			</p>
		</div>
		<hr class="border-line-soft" />
		<div class="flex items-center justify-between gap-3">
			<span class="text-sm font-medium text-ink-muted">Type</span>
			<!-- Engine choice is disabled for now: one backend keeps the storage layer
			     simple. The badge title carries the stored value. -->
			<span
				class="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink-muted"
				title={`Database engine: ${data.db.type}`}
			>
				SQLite <span class="text-ink-faint">— local file, fixed</span>
			</span>
		</div>
		<p class="text-xs text-ink-faint">
			Settings, attribute configs and type snapshots live in <code
				class="rounded bg-surface-2 px-1 py-0.5 text-xs">stellio-ui.db</code
			> next to the app. Switching to PostgreSQL or MySQL is not available yet.
		</p>
	</div>
</div>
