/**
 * Small concurrency helpers shared by the server-side Stellio client and the
 * browser-side hydration of the entity type list.
 *
 * Both sides need to run a bounded number of requests at a time: the broker in
 * front of a large Stellio instance is the bottleneck (a single
 * `/types/{typeName}` call takes ~2s on a small type and ~20s on a 500k-entity
 * type), so firing everything at once only queues work behind a saturated
 * connection pool.
 */

/**
 * Creates a function that runs at most `max` jobs concurrently, queuing the
 * rest. Jobs are started in the order they are submitted.
 */
export function createSemaphore(max: number) {
	const limit = Math.max(1, Math.floor(max));
	let active = 0;
	const waiting: (() => void)[] = [];

	function release() {
		const next = waiting.shift();
		if (next) {
			// Hand the slot straight to the next job so `active` stays accurate.
			next();
			return;
		}
		active -= 1;
	}

	function acquire(): Promise<void> {
		if (active < limit) {
			active += 1;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => waiting.push(resolve));
	}

	return async function run<T>(job: () => Promise<T>): Promise<T> {
		await acquire();
		try {
			return await job();
		} finally {
			release();
		}
	};
}

/**
 * Applies `worker` to every item with at most `limit` workers in flight.
 *
 * Resolves once every item has been processed. A rejecting `worker` rejects the
 * pool (and stops the worker that raised it), so pass a worker that handles its
 * own errors when partial results are acceptable.
 */
export async function runPool<T>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<void>
): Promise<void> {
	if (items.length === 0) return;

	const size = Math.max(1, Math.min(Math.floor(limit), items.length));
	let cursor = 0;

	const runners = Array.from({ length: size }, async () => {
		while (true) {
			const index = cursor++;
			if (index >= items.length) return;
			await worker(items[index], index);
		}
	});

	await Promise.all(runners);
}
