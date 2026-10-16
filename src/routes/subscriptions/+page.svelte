<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	function timeAgo(iso?: string) {
		if (!iso) return '—';
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}
</script>

<div>
	{#if data.subscriptions.length === 0}
		<p class="text-gray-500">No subscriptions found.</p>
	{:else}
		<ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each data.subscriptions as sub}
				<li class="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="font-medium">{sub.entities.map((e) => e.type ?? e.id).join(', ')}</span>
						<span class="px-2 py-0.5 rounded-full text-xs font-medium {sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
							{sub.status}
						</span>
					</div>
					<div class="text-xs text-gray-500 space-y-1">
						<div>Endpoint: <span class="text-gray-700">{sub.notification.endpoint.uri}</span></div>
						<div>Triggers: <span class="text-gray-700">{sub.notificationTrigger.join(', ')}</span></div>
						<div class="flex gap-4">
							<span>Sent: <span class="text-gray-700">{sub.notification.timesSent}</span></span>
							<span>Last: <span class="text-gray-700">{timeAgo(sub.notification.lastNotification)}</span></span>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
