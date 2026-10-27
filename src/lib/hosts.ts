import { getSetting, setSetting } from './db';
import { variables } from '../env';

/**
 * One Stellio connection the user has used before, so the app can be pointed
 * back at it without retyping host and port.
 *
 * `name` is the optional friendly label the user gave the connection (e.g.
 * "Production"). It is absent rather than empty when the connection is unnamed,
 * so entries written before names existed keep their shape.
 */
export type SavedHost = { host: string; port: string; name?: string };

/**
 * A saved connection as the browser sees it.
 *
 * `key` is what the client sends back to switch to (or forget) that connection;
 * building it here keeps the `host:port` format in one place. `name` is always a
 * string (empty when the connection is unnamed) to keep the read model uniform;
 * `label` is what a switcher renders. `saved` is false for the connection in use
 * when it is not on the list: it can be probed and switched to, but not renamed
 * or removed.
 */
export type HostChoice = {
	key: string;
	label: string;
	name: string;
	saved: boolean;
	active: boolean;
};

const HOSTS_KEY = 'stellio_hosts';
const MULTI_HOST_KEY = 'stellio_multi_host';

/**
 * Upper bound on the remembered list. It keeps the header switcher and the
 * settings page usable, not because of any storage limit.
 */
export const MAX_SAVED_HOSTS = 10;

/**
 * Upper bound on a connection name. Names are rendered in the header switcher
 * and in the settings list, so they are kept short enough to fit.
 */
export const MAX_HOST_NAME_LENGTH = 40;

/**
 * Stable identifier for a connection. The port is split on the last `:` so an
 * IPv6 host (`::1:8765`) round-trips.
 */
export function hostKey(host: string, port: string): string {
	return `${host}:${port}`;
}

/** Inverse of `hostKey`; `null` when the value is not a `host:port` pair. */
export function parseHostKey(key: string): SavedHost | null {
	const value = key.trim();
	const separator = value.lastIndexOf(':');
	if (separator <= 0) return null;
	const host = value.slice(0, separator).trim();
	const port = value.slice(separator + 1).trim();
	return host && port ? { host, port } : null;
}

/**
 * The connection the app is talking to right now.
 *
 * The active connection is always the `stellio_host` / `stellio_port` settings
 * (switching a host rewrites them), falling back to the environment when
 * nothing has been saved. The NGSI-LD client reaches this through
 * `getStellioConfig()` in `./stellio`.
 */
export function getActiveConnection(): SavedHost {
	const host = (getSetting('stellio_host') || variables.STELLIO_HOST || '').trim();
	const port = (getSetting('stellio_port') || variables.STELLIO_PORT || '').trim();
	return { host, port };
}

/** Trims and length-caps a user-supplied name; `undefined` when it is empty. */
function cleanName(name: string | undefined): string | undefined {
	const trimmed = (name ?? '').trim().slice(0, MAX_HOST_NAME_LENGTH).trim();
	return trimmed === '' ? undefined : trimmed;
}

/** Decodes the stored list, dropping entries that cannot be used. */
function parseHosts(raw: string): SavedHost[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// A corrupt row is treated as "nothing saved" instead of failing the read.
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	const hosts: SavedHost[] = [];
	for (const entry of parsed) {
		const candidate = entry as { host?: unknown; port?: unknown; name?: unknown } | null;
		const host = String(candidate?.host ?? '').trim();
		const port = String(candidate?.port ?? '').trim();
		if (!host || !port) continue;
		if (hosts.some((saved) => saved.host === host && saved.port === port)) continue;
		// Only strings are accepted: a numeric or object name from a hand-edited
		// row would otherwise render as "[object Object]" in the switcher.
		const name = cleanName(typeof candidate?.name === 'string' ? candidate.name : undefined);
		hosts.push(name ? { host, port, name } : { host, port });
	}
	return hosts;
}

function writeHosts(hosts: SavedHost[]) {
	setSetting(HOSTS_KEY, JSON.stringify(hosts));
}

/**
 * The connections the user has saved, most recently used first.
 *
 * The settings key is written lazily: as long as it has never been written, the
 * first read adopts whatever connection the environment (or an earlier
 * single-host install) already configured. Afterwards the stored list is
 * authoritative, so removing a host sticks even though the app may still be
 * using it.
 */
export function getSavedHosts(): SavedHost[] {
	const raw = getSetting(HOSTS_KEY);
	if (raw.trim() === '') {
		const { host, port } = getActiveConnection();
		if (!host || !port) return [];
		const seeded = [{ host, port }];
		writeHosts(seeded);
		return seeded;
	}
	return parseHosts(raw);
}

/**
 * Adds a connection to the saved list (idempotent) and returns the new list.
 *
 * `name` is optional: passing a string sets (or clears, when it is blank) the
 * friendly label, while leaving it out keeps whatever name the connection
 * already had — re-saving an address from the form must not wipe a name given
 * earlier.
 */
export function rememberHost(host: string, port: string, name?: string): SavedHost[] {
	const clean = { host: host.trim(), port: port.trim() };
	const saved = getSavedHosts();
	if (!clean.host || !clean.port) return saved;

	const existing = saved.find((entry) => entry.host === clean.host && entry.port === clean.port);
	const resolved = name === undefined ? existing?.name : cleanName(name);
	const entry: SavedHost = resolved ? { ...clean, name: resolved } : clean;

	const hosts = [
		entry,
		...saved.filter((other) => other.host !== clean.host || other.port !== clean.port)
	].slice(0, MAX_SAVED_HOSTS);
	writeHosts(hosts);
	return hosts;
}

/**
 * Sets (or clears, with a blank name) the friendly label of a saved connection.
 *
 * Returns the new list, or `null` when `key` is not a saved connection — the API
 * answers 400 for that instead of inventing an entry. The key names the
 * connection, so a rename cannot move it or change which broker it points at.
 */
export function renameSavedHost(key: string, name: string): SavedHost[] | null {
	const target = parseHostKey(key);
	if (!target) return null;

	const hosts = getSavedHosts();
	const index = hosts.findIndex(
		(entry) => entry.host === target.host && entry.port === target.port
	);
	if (index === -1) return null;

	const cleaned = cleanName(name);
	hosts[index] = cleaned
		? { host: target.host, port: target.port, name: cleaned }
		: { host: target.host, port: target.port };
	writeHosts(hosts);
	return hosts;
}

/** Drops a connection from the saved list and returns the new list. */
export function forgetHost(host: string, port: string): SavedHost[] {
	const hosts = getSavedHosts().filter(
		(saved) => saved.host !== host.trim() || saved.port !== port.trim()
	);
	writeHosts(hosts);
	return hosts;
}

/** Whether the header offers the saved-host switcher. */
export function isMultiHostEnabled(): boolean {
	return getSetting(MULTI_HOST_KEY).trim().toLowerCase() === 'true';
}

export function setMultiHostEnabled(enabled: boolean): void {
	setSetting(MULTI_HOST_KEY, enabled ? 'true' : 'false');
}

/** The saved connection named by `key`, or `null` when it is not saved. */
export function findSavedHost(key: string): SavedHost | null {
	const target = parseHostKey(key);
	if (!target) return null;
	return (
		getSavedHosts().find((saved) => saved.host === target.host && saved.port === target.port) ??
		null
	);
}

/**
 * Read model for the host switcher and the settings page: the saved connections
 * in list order, plus the connection in use.
 *
 * The active connection is always included, even when it is not in the saved
 * list — it can be removed while the app still talks to it — so a `<select>`
 * bound to it always has a matching option. Those entries carry `saved: false`,
 * which is what keeps the settings page from offering to rename or remove
 * something that is not on the list.
 */
export function getHostChoices(): HostChoice[] {
	const active = getActiveConnection();
	const activeKey = active.host && active.port ? hostKey(active.host, active.port) : '';

	const choices = getSavedHosts().map((saved) => {
		const key = hostKey(saved.host, saved.port);
		return {
			key,
			label: choiceLabel(saved.name, key),
			name: saved.name ?? '',
			saved: true,
			active: key === activeKey
		};
	});
	if (activeKey && !choices.some((choice) => choice.key === activeKey)) {
		choices.unshift({
			key: activeKey,
			label: `${activeKey} (current)`,
			name: '',
			saved: false,
			active: true
		});
	}
	return choices;
}

/**
 * How a connection is rendered in a list: the address it points at, with the
 * name the user gave it in brackets. Leading with the address keeps every entry
 * in the switcher aligned on the same axis — the parenthetical only qualifies
 * it — and an unnamed connection is just its address, not `()`.
 */
function choiceLabel(name: string | undefined, key: string): string {
	return name ? `${key} (${name})` : key;
}
