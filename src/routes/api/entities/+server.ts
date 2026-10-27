import { stellio, type GeoFilter } from '#lib/stellio';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

/** Reads a finite number, or `undefined` when the parameter is absent/garbage. */
function optionalNumber(value: string | null): number | undefined {
	if (value === null || value.trim() === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const GET: RequestHandler = async ({ url }) => {
	const type = url.searchParams.get('type') ?? '';
	const offset = Number(url.searchParams.get('offset') ?? 0);
	const limit = Number(url.searchParams.get('limit') ?? 10);

	// Optional narrowing, off by default so the response shape stays as before:
	// `options=keyValues` returns plain values instead of normalised objects
	// (~3x faster on the live instance) and `attrs=a,b` only asks for the columns
	// the caller is going to draw.
	const attrsParam = url.searchParams.get('attrs');

	// Optional filtering. `q` is forwarded verbatim: it is NGSI-LD's own query
	// language, so building it is the caller's job. Coordinates that do not
	// parse as numbers are dropped rather than passed on as `NaN`, which Stellio
	// rejects with a 400.
	const q = url.searchParams.get('q') ?? undefined;
	const lat = optionalNumber(url.searchParams.get('lat'));
	const lng = optionalNumber(url.searchParams.get('lng'));
	const geo: GeoFilter | undefined =
		lat === undefined || lng === undefined
			? undefined
			: { lat, lng, distanceM: optionalNumber(url.searchParams.get('distance')) };

	const data = await stellio.getEntities(type, offset, limit, {
		keyValues: url.searchParams.get('options') === 'keyValues',
		attrs: attrsParam ? attrsParam.split(',').map((name) => name.trim()) : undefined,
		q,
		geo
	});
	return json(data);
};
