import { parseHostKey } from '#lib/hosts';
import { checkConnection } from '#lib/stellio';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Probes one saved connection for the Settings page.
 *
 * The connection is named by the same `host:port` key the switcher and the
 * remove action use (`?key=100.101.88.148:8765`), and it does not have to be on
 * the saved list: the connection in use can be removed from the list while the
 * app still talks to it, and that is exactly the one worth probing.
 *
 * A broker that does not answer is a 200 with `ok: false` — the result of a
 * health check is data, not a failed request. Only a malformed key is a 400.
 */
export const GET: RequestHandler = async ({ url }) => {
	const target = parseHostKey(url.searchParams.get('key') ?? '');
	if (!target) {
		return json(
			{ ok: false, error: 'A connection key is required, as host:port.' },
			{ status: 400 }
		);
	}
	if (!/^\d+$/.test(target.port)) {
		return json(
			{ ok: false, error: 'The port in the connection key must be a number.' },
			{ status: 400 }
		);
	}

	return json(await checkConnection(target.host, target.port));
};
