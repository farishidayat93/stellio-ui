import { stellio } from '#lib/stellio';

export async function load() {
	const subscriptions = await stellio.getSubscriptions();
	return { subscriptions };
}
