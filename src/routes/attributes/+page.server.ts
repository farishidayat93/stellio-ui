import { stellio, isStellioConfigured } from '#lib/stellio';

export async function load() {
	// Guardrail: don't call Stellio until a host/port is configured.
	if (!isStellioConfigured()) {
		return { attributes: [] };
	}

	const attributes = await stellio.getAttributes();
	return { attributes };
}
