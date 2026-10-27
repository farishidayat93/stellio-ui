import { stellio } from '#lib/stellio';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	// `?refresh=1` bypasses the cache for the one call that needs a live count.
	const info = await stellio.getTypeInfo(params.typeName, {
		refresh: url.searchParams.has('refresh')
	});
	return json(info);
};
