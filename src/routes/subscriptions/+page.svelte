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
		<p class="text-ink-muted">No subscriptions found.</p>
	{:else}
		<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.subscriptions as sub (sub.id)}
				<li class="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
					<div class="flex items-center justify-between">
						<span class="font-medium">{sub.entities.map((e) => e.type ?? e.id).join(', ')}</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {sub.status === 'active'
								? 'bg-success-soft text-success-ink'
								: 'bg-surface-2 text-ink-muted'}"
						>
							{sub.status}
						</span>
					</div>
					<div class="space-y-1 text-xs text-ink-muted">
						<div>Endpoint: <span class="text-ink-muted">{sub.notification.endpoint.uri}</span></div>
						<div>
							Triggers: <span class="text-ink-muted">{sub.notificationTrigger.join(', ')}</span>
						</div>
						<div class="flex gap-4">
							<span>Sent: <span class="text-ink-muted">{sub.notification.timesSent}</span></span>
							<span
								>Last: <span class="text-ink-muted"
									>{timeAgo(sub.notification.lastNotification)}</span
								></span
							>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
