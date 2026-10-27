import { stellio, isStellioConfigured } from '#lib/stellio';

export async function load() {
	// Guardrail: don't call Stellio until a host/port is configured.
	if (!isStellioConfigured()) {
		return { subscriptions: [] };
	}

	const subscriptions = await stellio.getSubscriptions();
	return { subscriptions };
}
