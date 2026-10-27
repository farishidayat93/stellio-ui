import { getStellioConfig } from '#lib/stellio';

export async function load() {
	// The landing page only needs to name the broker it will talk to. Everything
	// else it shows comes from the layout: the feature flags and the
	// configured/not-configured state. No Stellio calls, so it always paints fast.
	return { connection: getStellioConfig() };
}
