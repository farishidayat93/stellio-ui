import axios, { type AxiosInstance } from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';
import { getTypeInfoSnapshots, saveTypeInfoSnapshot } from './db';
import { getActiveConnection } from './hosts';
import { cached, invalidateCache, readCache } from './cache';
import { createSemaphore } from './concurrency';

/**
 * Resolve the Stellio connection details.
 *
 * The resolution itself lives in `./hosts`, which has to answer the same
 * question for the saved-host switcher: values persisted in the local SQLite
 * settings take precedence, falling back to the `STELLIO_HOST` / `STELLIO_PORT`
 * environment variables. Having both a host and a port is what marks the app as
 * configured.
 */
export function getStellioConfig(): { host: string; port: string } {
	return getActiveConnection();
}

/**
 * True when both a Stellio host and port are available from the database or
 * the environment. Used as a guardrail so the UI can prompt the user to
 * connect instead of issuing requests to an empty `http://:` base URL.
 */
export function isStellioConfigured(): boolean {
	const { host, port } = getStellioConfig();
	return host.length > 0 && port.length > 0;
}

export class StellioNotConfiguredError extends Error {
	constructor() {
		super(
			'Stellio host and port are not configured. Set STELLIO_HOST and STELLIO_PORT in the environment, or add them on the Settings page.'
		);
		this.name = 'StellioNotConfiguredError';
	}
}

export type AttributeDetail = {
	attributeName: string;
	attributeTypes: string[];
};

export type EntityTypeInfo = {
	typeName: string;
	entityCount: number;
	attributeDetails: AttributeDetail[];
};

/**
 * What the type list can render without talking to Stellio. `entityCount` and
 * `attributeCount` are `null` when nothing has been observed yet for the
 * connection; `pending` asks the client to refresh the row in the background.
 */
export type TypeSummary = {
	typeName: string;
	entityCount: number | null;
	attributeCount: number | null;
	pending: boolean;
};

/**
 * A distance query around one point, as the UI's "near" filters use it.
 * Coordinates are WGS84 degrees; `distanceM` defaults to
 * `DEFAULT_GEO_DISTANCE_M` when the caller leaves it out.
 */
export type GeoFilter = {
	lat: number;
	lng: number;
	distanceM?: number;
};

export type Subscription = {
	id: string;
	status: string;
	entities: { type?: string; id?: string }[];
	notificationTrigger: string[];
	notification: {
		endpoint: { uri: string };
		status: string;
		timesSent: number;
		lastNotification?: string;
		lastSuccess?: string;
	};
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONCURRENCY = 4;

/** Radius used when a geo filter carries coordinates but no distance. */
export const DEFAULT_GEO_DISTANCE_M = 1000;

/**
 * Freshness windows per endpoint family.
 *
 * They are deliberately short for entity pages (a browsing UI tolerates a few
 * seconds of staleness and the user can page again) and long for the expensive
 * type metadata, which Stellio computes by aggregating every entity of a type
 * (~2s on a small type, ~20s on a 500k-entity one).
 */
export const CACHE_TTL = {
	types: 60_000,
	typeInfo: 300_000,
	attributes: 60_000,
	attributeInfo: 300_000,
	entities: 30_000
} as const;

function positiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Optional tuning knobs.
 *
 * These are read straight from the environment rather than declared in
 * `src/env.ts`, which SvelteKit parses as its typed-env schema and where any
 * declared name becomes required at build time.
 */
const timeoutMs = positiveInt(process.env.STELLIO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
const maxConcurrency = positiveInt(process.env.STELLIO_MAX_CONCURRENCY, DEFAULT_MAX_CONCURRENCY);

/** Because the broker is the bottleneck, requests are gated globally. */
const runWithSlot = createSemaphore(maxConcurrency);

const keepAliveAgentOptions = {
	keepAlive: true,
	maxSockets: maxConcurrency
};

const httpAgent = new http.Agent(keepAliveAgentOptions);
const httpsAgent = new https.Agent(keepAliveAgentOptions);

/**
 * One axios instance per connection instead of one per request: reusing the
 * instance keeps the underlying keep-alive sockets warm, which removes a TCP
 * handshake from every call we make to the broker.
 */
const clients = new Map<string, AxiosInstance>();

/** The client for one host and port, regardless of the connection in use. */
function clientFor(host: string, port: string): AxiosInstance {
	const key = `${host}:${port}`;
	const existing = clients.get(key);
	if (existing) return existing;

	const client = axios.create({
		baseURL: `http://${host}:${port}/ngsi-ld/v1`,
		headers: { Accept: 'application/json' },
		timeout: timeoutMs,
		httpAgent,
		httpsAgent
	});
	clients.set(key, client);
	return client;
}

function requireClient(): AxiosInstance {
	const { host, port } = getStellioConfig();
	if (!host || !port) {
		throw new StellioNotConfiguredError();
	}
	return clientFor(host, port);
}

/**
 * Cache keys are scoped to the connection, so switching the Stellio host or
 * port in Settings can never serve values fetched from the previous broker.
 */
function cacheKey(host: string, port: string, path: string): string {
	return `stellio:${host}:${port}:${path}`;
}

function cachingDisabled(): boolean {
	return (process.env.STELLIO_CACHE_DISABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Reads `path` through the response cache.
 *
 * Entries are served stale while a background refresh runs, which is what keeps
 * the UI instant: the first paint returns the last known value and Stellio is
 * asked again behind it.
 */
async function readThroughCache<T>(
	key: string,
	ttl: number,
	load: (client: AxiosInstance) => Promise<T>,
	refresh = false
): Promise<T> {
	// Resolved before the cache lookup: an unconfigured app must always raise
	// StellioNotConfiguredError rather than serve a previous connection's data.
	const { host, port } = getStellioConfig();
	const client = requireClient();

	return cached(
		cacheKey(host, port, key),
		{ ttl: cachingDisabled() ? 0 : ttl, refresh, staleWhileRevalidate: true },
		() => runWithSlot(() => load(client))
	);
}

/** Normalises `/types/{typeName}` payloads, which omit fields for empty types. */
function normalizeTypeInfo(typeName: string, data: unknown): EntityTypeInfo {
	const payload = (data ?? {}) as Partial<EntityTypeInfo>;
	return {
		typeName: payload.typeName ?? typeName,
		entityCount: Number(payload.entityCount ?? 0),
		attributeDetails: Array.isArray(payload.attributeDetails) ? payload.attributeDetails : []
	};
}

/** Drops every cached Stellio response; call it when the connection changes. */
export function clearStellioCache(): void {
	invalidateCache('stellio:');
}

/**
 * How long a health check waits for an answer before reporting the connection as
 * unreachable. Deliberately much shorter than the 60s request timeout: a probe
 * exists to tell the user something is wrong quickly, and a firewalled host that
 * never answers would otherwise block the Settings page for a minute.
 */
const DEFAULT_HEALTH_TIMEOUT_MS = 3000;
const healthTimeoutMs = positiveInt(
	process.env.STELLIO_HEALTH_TIMEOUT_MS,
	DEFAULT_HEALTH_TIMEOUT_MS
);

/**
 * The outcome of probing one connection.
 *
 * `ok` means the broker answered at all (axios only resolves on a 2xx), not that
 * the data is what the caller hoped for. A failed probe is a normal result, not
 * an error: it is reported in the payload so the UI can render it.
 */
export type ConnectionHealth = {
	ok: boolean;
	/** HTTP status of the answer, or `null` when the request never got one. */
	status: number | null;
	/** How long the probe took, in milliseconds. */
	latencyMs: number;
	/** Why the probe failed in plain language; empty when it succeeded. */
	error: string;
};

/** Turns a transport failure into something a user can act on. */
function describeProbeFailure(err: unknown): string {
	if (axios.isAxiosError(err)) {
		const status = err.response?.status;
		if (status) {
			if (status === 401 || status === 403)
				return `The broker answered ${status}. Check credentials.`;
			if (status === 404) return 'Nothing answers on the NGSI-LD API path (404).';
			return `The broker answered ${status}.`;
		}
		// Local failures: the request never produced an HTTP response.
		switch (err.code) {
			case 'ECONNABORTED':
			case 'ETIMEDOUT':
				return `No answer within ${healthTimeoutMs} ms.`;
			case 'ECONNREFUSED':
				return 'Connection refused — is Stellio running?';
			case 'ENOTFOUND':
			case 'EAI_AGAIN':
				return 'Host name could not be resolved.';
			case 'EHOSTUNREACH':
			case 'ENETUNREACH':
				return 'Host is unreachable.';
			default:
				return err.message || 'The connection failed.';
		}
	}
	return err instanceof Error && err.message ? err.message : 'The connection failed.';
}

/**
 * Probes one broker, whatever the app is currently pointed at.
 *
 * Unlike every other call in this module it deliberately bypasses the response
 * cache (a cached type list says nothing about whether the broker is up now) and
 * uses `GET /types`, the cheapest endpoint the app depends on. It still goes
 * through the semaphore, so a health check cannot push past the global
 * concurrency budget.
 */
export async function checkConnection(host: string, port: string): Promise<ConnectionHealth> {
	const started = Date.now();
	try {
		const response = await runWithSlot(() =>
			clientFor(host, port).get('/types', { timeout: healthTimeoutMs })
		);
		return {
			ok: true,
			status: typeof response.status === 'number' ? response.status : null,
			latencyMs: Date.now() - started,
			error: ''
		};
	} catch (err) {
		return {
			ok: false,
			status: axios.isAxiosError(err) ? (err.response?.status ?? null) : null,
			latencyMs: Date.now() - started,
			error: describeProbeFailure(err)
		};
	}
}

export const stellio = {
	async getTypes(): Promise<string[]> {
		return readThroughCache('types', CACHE_TTL.types, async (client) => {
			const { data } = await client.get('/types');
			return (data.typeList ?? data) as string[];
		});
	},

	/**
	 * Entity count and attributes of one type.
	 *
	 * This is the expensive call: Stellio aggregates every entity of the type to
	 * count them (~2s for 13 entities, ~20s for 497k). Results are cached and
	 * written through to the settings database so a restart can paint the type
	 * list from disk while a refresh runs in the background.
	 */
	async getTypeInfo(
		typeName: string,
		options: { refresh?: boolean } = {}
	): Promise<EntityTypeInfo> {
		const { host, port } = getStellioConfig();

		return readThroughCache(
			`types/${typeName}`,
			CACHE_TTL.typeInfo,
			async (client) => {
				const { data } = await client.get(`/types/${typeName}`);
				const info = normalizeTypeInfo(typeName, data);
				try {
					saveTypeInfoSnapshot(host, port, info);
				} catch {
					// Persisting is best-effort: a locked or read-only database must
					// not break the read path.
				}
				return info;
			},
			options.refresh
		);
	},

	/**
	 * Type list with whatever is already known about each type, without issuing a
	 * single request to Stellio. Rows whose snapshot is missing or older than the
	 * type-info TTL are reported as `pending` so the browser can hydrate them.
	 */
	getTypeSummaries(typeList: string[]): TypeSummary[] {
		const { host, port } = getStellioConfig();
		if (!host || !port) {
			return typeList.map((typeName) => ({
				typeName,
				entityCount: null,
				attributeCount: null,
				pending: true
			}));
		}

		let snapshots: ReturnType<typeof getTypeInfoSnapshots>;
		try {
			snapshots = getTypeInfoSnapshots(host, port);
		} catch {
			snapshots = [];
		}
		const byType = new Map(snapshots.map((snapshot) => [snapshot.typeName, snapshot]));

		return typeList.map((typeName) => {
			// A fresh in-process entry is newer than anything persisted on disk.
			const memory = readCache<EntityTypeInfo>(cacheKey(host, port, `types/${typeName}`));
			if (memory?.fresh) {
				return {
					typeName,
					entityCount: memory.value.entityCount,
					attributeCount: memory.value.attributeDetails.length,
					pending: false
				};
			}

			const snapshot = byType.get(typeName);
			if (!snapshot) {
				return { typeName, entityCount: null, attributeCount: null, pending: true };
			}
			return {
				typeName,
				entityCount: snapshot.entityCount,
				attributeCount: snapshot.attributeDetails.length,
				pending: Date.now() - snapshot.fetchedAt > CACHE_TTL.typeInfo
			};
		});
	},

	async getSubscriptions(): Promise<Subscription[]> {
		return readThroughCache('subscriptions', CACHE_TTL.attributes, async (client) => {
			const { data } = await client.get('/subscriptions');
			return data;
		});
	},

	async getAttributes(): Promise<string[]> {
		return readThroughCache('attributes', CACHE_TTL.attributes, async (client) => {
			const { data } = await client.get('/attributes');
			return (data.attributeList ?? data) as string[];
		});
	},

	async getAttributeInfo(
		attributeName: string
	): Promise<{ attributeTypes: string[]; typeNames: string[]; attributeCount: number }> {
		return readThroughCache(
			`attributes/${attributeName}`,
			CACHE_TTL.attributeInfo,
			async (client) => {
				const { data } = await client.get(`/attributes/${attributeName}`);
				return data;
			}
		);
	},

	/**
	 * One page of entities of a type.
	 *
	 * `options.keyValues` asks Stellio for plain attribute values instead of
	 * normalised value objects (~42% fewer bytes, ~3x faster on the live
	 * instance) and requires the caller to handle the simplified shape.
	 *
	 * `options.q` is an NGSI-LD query expression (`attr~=value;other==3`) and
	 * `options.geo` a distance query. Both narrow the collection Stellio pages
	 * over, so `offset` keeps referring to the filtered result set.
	 *
	 * Note `count=true` is never sent: it makes Stellio count the whole
	 * collection and was measured at ~60x the cost of a plain page.
	 */
	async getEntities(
		typeName: string,
		offset = 0,
		limit = 10,
		options: { keyValues?: boolean; attrs?: string[]; q?: string; geo?: GeoFilter } = {}
	): Promise<{ id: string; type: string; [key: string]: unknown }[]> {
		const params = new URLSearchParams({
			type: typeName,
			offset: String(offset),
			limit: String(limit)
		});
		if (options.keyValues) params.set('options', 'keyValues');
		if (options.attrs?.length) params.set('attrs', options.attrs.join(','));
		if (options.q) params.set('q', options.q);
		if (options.geo) {
			params.set('geometry', 'Point');
			// Stellio spells the radius as `maxDistance==<metres>`; a single `=`
			// answers 400 "Invalid expression for 'near' georel".
			params.set('georel', `near;maxDistance==${options.geo.distanceM ?? DEFAULT_GEO_DISTANCE_M}`);
			// GeoJSON order: longitude first.
			params.set('coordinates', `[${options.geo.lng},${options.geo.lat}]`);
		}

		return readThroughCache(`entities?${params.toString()}`, CACHE_TTL.entities, async (client) => {
			const { data } = await client.get('/entities', { params });
			return data;
		});
	}
};
