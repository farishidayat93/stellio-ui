import { stellio, isStellioConfigured } from '#lib/stellio';

export async function load() {
	// Guardrail: don't call Stellio until a host/port is configured.
	if (!isStellioConfigured()) {
		return { types: [] };
	}

	// One request for the whole list (~1.7s cold, instant once cached) instead of
	// one `/types/{typeName}` call per type. That fan-out used to block the first
	// paint for ~22s on a large instance, because Stellio aggregates every entity
	// of a type to answer the count (~2s on a small type, ~20s on a 497k one).
	const typeList = await stellio.getTypes();

	// Whatever is already known about each type is served from the local snapshot
	// (written by earlier type-info calls), and rows that are missing or stale are
	// flagged `pending` so the browser hydrates them after the page has painted.
	return { types: stellio.getTypeSummaries(typeList) };
}
