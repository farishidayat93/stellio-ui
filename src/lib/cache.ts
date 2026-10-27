/**
 * In-process, TTL-based memoisation for the Stellio client.
 *
 * The UI hits a handful of cheap-to-serve but expensive-to-compute endpoints
 * (`/types/{typeName}` aggregates `entityCount` over millions of rows) so every
 * read that does not have to be live goes through `cached()`.
 *
 * Features:
 * - **TTL** — an entry is fresh until `ttl` milliseconds have passed.
 * - **Single-flight** — concurrent callers of the same key share one loader
 *   call, so 24 parallel requests for the same type never fan out twice.
 * - **Stale-while-revalidate** — with `staleWhileRevalidate` an expired entry is
 *   returned immediately while a background refresh runs, keeping the UI
 *   instant and eventually consistent.
 * - Errors are never cached: a failing loader rejects to the caller and leaves
 *   any previously cached value in place.
 */

export type CacheOptions = {
	/** Freshness window in milliseconds. `<= 0` disables caching for the call. */
	ttl: number;
	/** Return an expired value immediately and refresh it in the background. */
	staleWhileRevalidate?: boolean;
	/** Ignore any cached value and always call the loader. */
	refresh?: boolean;
};

type Entry = {
	value: unknown;
	expiresAt: number;
};

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** Reads a cached value, reporting whether it is still within its TTL. */
export function readCache<T>(key: string): { value: T; fresh: boolean } | undefined {
	const entry = entries.get(key);
	if (!entry) return undefined;
	return { value: entry.value as T, fresh: entry.expiresAt > Date.now() };
}

/** Stores a value under `key` for `ttl` milliseconds. */
export function writeCache<T>(key: string, value: T, ttl: number): void {
	entries.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * Drops cached entries, all of them or only the ones whose key starts with
 * `prefix`. In-flight loaders are left alone — they will repopulate the entry
 * they were started for.
 */
export function invalidateCache(prefix?: string): void {
	if (prefix === undefined) {
		entries.clear();
		return;
	}
	for (const key of [...entries.keys()]) {
		if (key.startsWith(prefix)) entries.delete(key);
	}
}

/** Number of live entries; diagnostics only. */
export function cacheSize(): number {
	return entries.size;
}

/**
 * Returns the cached value for `key`, computing it with `loader` when there is
 * no fresh value available.
 */
export async function cached<T>(
	key: string,
	options: CacheOptions,
	loader: () => Promise<T>
): Promise<T> {
	const { ttl, staleWhileRevalidate = false, refresh = false } = options;

	if (ttl <= 0) return loader();

	if (!refresh) {
		const hit = readCache<T>(key);
		if (hit?.fresh) return hit.value;
		if (hit && staleWhileRevalidate) {
			// Serve what we have and let the refresh land whenever it lands.
			void cached(key, { ttl, refresh: true }, loader).catch(() => {});
			return hit.value;
		}
	}

	// Single-flight: everyone waiting on this key shares one loader call.
	const pending = inflight.get(key);
	if (pending) return pending as Promise<T>;

	const started = (async () => {
		try {
			const value = await loader();
			writeCache(key, value, ttl);
			return value;
		} finally {
			inflight.delete(key);
		}
	})();

	inflight.set(key, started);
	return started;
}
