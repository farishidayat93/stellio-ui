<script lang="ts">
	import type { PageProps } from './$types';
	import axios from 'axios';

	let { data }: PageProps = $props();

	let stellioHost = $state(data.stellio.host);
	let stellioPort = $state(data.stellio.port);

	let dbType = $state(data.db.type);
	let dbHost = $state(data.db.host);
	let dbPort = $state(data.db.port);
	let dbName = $state(data.db.name);
	let dbUser = $state(data.db.user);
	let dbPassword = $state(data.db.password);

	let stellioStatus = $state<'idle' | 'saved' | 'error'>('idle');
	let dbStatus = $state<'idle' | 'saved' | 'error'>('idle');

	async function saveStellio() {
		try {
			await axios.post('/api/settings', { stellio_host: stellioHost, stellio_port: stellioPort });
			stellioStatus = 'saved';
		} catch { stellioStatus = 'error'; }
		setTimeout(() => (stellioStatus = 'idle'), 2000);
	}

	async function saveDb() {
		try {
			await axios.post('/api/settings', {
				db_type: dbType, db_host: dbHost, db_port: dbPort,
				db_name: dbName, db_user: dbUser, db_password: dbPassword
			});
			dbStatus = 'saved';
		} catch { dbStatus = 'error'; }
		setTimeout(() => (dbStatus = 'idle'), 2000);
	}

	const dbDefaults: Record<string, string> = { sqlite: '', postgres: '5432', mysql: '3306' };
	$effect(() => { if (!dbPort) dbPort = dbDefaults[dbType] ?? ''; });
</script>

<div class="max-w-md space-y-6">

	<!-- Stellio -->
	<div class="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
		<div>
			<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Stellio Connection</p>
			<p class="text-xs text-gray-400 mt-0.5">Changes take effect on the next request.</p>
		</div>
		<hr class="border-gray-100" />
		<div class="space-y-3">
			<div class="space-y-1.5">
				<label class="text-sm font-medium text-gray-700">Host</label>
				<input type="text" bind:value={stellioHost} placeholder="e.g. 100.101.88.148"
					class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
			</div>
			<div class="space-y-1.5">
				<label class="text-sm font-medium text-gray-700">Port</label>
				<input type="text" bind:value={stellioPort} placeholder="e.g. 8765"
					class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
			</div>
		</div>
		<button onclick={saveStellio}
			class="px-4 py-2 rounded-md text-sm font-medium transition-colors
				{stellioStatus === 'saved' ? 'bg-green-100 text-green-700' : stellioStatus === 'error' ? 'bg-red-100 text-red-700' : data.t.active}">
			{stellioStatus === 'saved' ? 'Saved ✓' : stellioStatus === 'error' ? 'Error ✗' : 'Save'}
		</button>
	</div>

	<!-- Database -->
	<div class="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
		<div>
			<p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Database</p>
			<p class="text-xs text-gray-400 mt-0.5">SQLite is used by default for local storage.</p>
		</div>
		<hr class="border-gray-100" />
		<div class="space-y-3">
			<div class="space-y-1.5">
				<label class="text-sm font-medium text-gray-700">Type</label>
				<div class="flex gap-2">
					{#each ['sqlite', 'postgres', 'mysql'] as t}
						<button onclick={() => (dbType = t)}
							class="px-3 py-1.5 rounded-md text-sm border transition-colors
								{dbType === t ? data.t.active + ' border-transparent' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}">
							{t}
						</button>
					{/each}
				</div>
			</div>

			{#if dbType !== 'sqlite'}
				<div class="space-y-3">
					<div class="flex gap-3">
						<div class="flex-1 space-y-1.5">
							<label class="text-sm font-medium text-gray-700">Host</label>
							<input type="text" bind:value={dbHost} placeholder="localhost"
								class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						</div>
						<div class="w-24 space-y-1.5">
							<label class="text-sm font-medium text-gray-700">Port</label>
							<input type="text" bind:value={dbPort}
								class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						</div>
					</div>
					<div class="space-y-1.5">
						<label class="text-sm font-medium text-gray-700">Database name</label>
						<input type="text" bind:value={dbName} placeholder="stellio_ui"
							class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
					</div>
					<div class="flex gap-3">
						<div class="flex-1 space-y-1.5">
							<label class="text-sm font-medium text-gray-700">User</label>
							<input type="text" bind:value={dbUser}
								class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						</div>
						<div class="flex-1 space-y-1.5">
							<label class="text-sm font-medium text-gray-700">Password</label>
							<input type="password" bind:value={dbPassword}
								class="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 {data.t.ring}" />
						</div>
					</div>
				</div>
			{/if}
		</div>
		<button onclick={saveDb}
			class="px-4 py-2 rounded-md text-sm font-medium transition-colors
				{dbStatus === 'saved' ? 'bg-green-100 text-green-700' : dbStatus === 'error' ? 'bg-red-100 text-red-700' : data.t.active}">
			{dbStatus === 'saved' ? 'Saved ✓' : dbStatus === 'error' ? 'Error ✗' : 'Save'}
		</button>
	</div>

</div>
