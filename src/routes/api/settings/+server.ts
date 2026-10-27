import { getSetting, setSetting } from '#lib/db';
import {
	findSavedHost,
	forgetHost,
	getActiveConnection,
	getHostChoices,
	isMultiHostEnabled,
	rememberHost,
	renameSavedHost,
	setMultiHostEnabled
} from '#lib/hosts';
import { clearStellioCache } from '#lib/stellio';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/**
 * Settings the API accepts. Anything else in the body is ignored, so a stray
 * (or hand-crafted) field cannot invent new persisted settings.
 *
 * `db_type` is deliberately not here: the database engine is fixed to SQLite
 * for now (see POST), and this route will not store another value for it.
 */
const WRITABLE_KEYS = [
	'stellio_host',
	'stellio_port',
	'db_host',
	'db_port',
	'db_name',
	'db_user',
	'db_password'
] as const;

const error = (message: string) => json({ ok: false, error: message }, { status: 400 });

export const GET: RequestHandler = async () => {
	const active = getActiveConnection();
	return json({
		host: active.host,
		port: active.port,
		db_type: getSetting('db_type'),
		db_host: getSetting('db_host'),
		db_port: getSetting('db_port'),
		db_name: getSetting('db_name'),
		db_user: getSetting('db_user'),
		db_password: getSetting('db_password'),
		multi_host: isMultiHostEnabled(),
		saved_hosts: getHostChoices(),
		active_host: active.host && active.port ? `${active.host}:${active.port}` : ''
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	// Guardrail: saving a Stellio connection requires both host and port so the
	// app never ends up "configured" with a half-filled (unusable) connection.
	const touchesStellio = 'stellio_host' in body || 'stellio_port' in body;
	if (touchesStellio) {
		const host = String(body.stellio_host ?? '').trim();
		const port = String(body.stellio_port ?? '').trim();
		if (!host || !port) {
			return error('A Stellio host and port are both required.');
		}
		if (!/^\d+$/.test(port)) {
			return error('The Stellio port must be a number.');
		}
	}

	// The engine is fixed to SQLite for now; keep saying so even if a client
	// still posts a value for it.
	setSetting('db_type', 'sqlite');

	for (const key of WRITABLE_KEYS) {
		if (key in body) setSetting(key, String(body[key]));
	}

	// Toggling the header switcher does not change the connection in use, so it
	// must not invalidate the cache (unlike saving a host/port below).
	if ('multi_host' in body) {
		setMultiHostEnabled(body.multi_host === true || String(body.multi_host) === 'true');
	}

	// Switch to a saved connection. Guardrail: only connections already on the
	// list, and a switch rewrites the active host/port so the guardrail above
	// applies to saved entries too.
	if ('active_host' in body) {
		const target = findSavedHost(String(body.active_host));
		if (!target) {
			return error('That connection is not in the saved host list.');
		}
		setSetting('stellio_host', target.host);
		setSetting('stellio_port', target.port);
		// Most-recently-used first, which is the order the switcher shows.
		rememberHost(target.host, target.port);
		clearStellioCache();
		return json({ ok: true });
	}

	// Forget a saved connection. Removing the connection currently in use keeps
	// it active (the app must keep talking to something) but stops offering it.
	if ('remove_host' in body) {
		const target = findSavedHost(String(body.remove_host));
		if (!target) {
			return error('That connection is not in the saved host list.');
		}
		forgetHost(target.host, target.port);
		return json({ ok: true });
	}

	// Name (or un-name) a saved connection. The key identifies the connection,
	// so a rename can never point the app at a different broker; a blank
	// `host_name` clears the name. Nothing is re-fetched, so the cache stays.
	if ('rename_host' in body) {
		if (renameSavedHost(String(body.rename_host), String(body.host_name ?? '')) === null) {
			return error('That connection is not in the saved host list.');
		}
		return json({ ok: true });
	}

	if (touchesStellio) {
		// Remember the newly saved connection so it can be switched back to. An
		// omitted `host_name` keeps whatever name the connection already had, so
		// re-saving an address does not wipe it.
		rememberHost(
			String(body.stellio_host),
			String(body.stellio_port),
			'host_name' in body ? String(body.host_name ?? '') : undefined
		);
		// Pointing the app at another broker makes every cached response
		// irrelevant to this session, so drop them instead of holding them until
		// they expire.
		clearStellioCache();
	}

	return json({ ok: true });
};
