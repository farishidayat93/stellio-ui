import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheSize, cached, invalidateCache, readCache, writeCache } from './cache';

/** The cache is time-based; wait out the short TTLs used by these tests. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
	invalidateCache();
});

describe('cached', () => {
	it('loads once and serves the value while it is fresh', async () => {
		const loader = vi.fn(async () => 'value');

		expect(await cached('fresh', { ttl: 1000 }, loader)).toBe('value');
		expect(await cached('fresh', { ttl: 1000 }, loader)).toBe('value');
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('reloads after the ttl has elapsed', async () => {
		let runs = 0;
		const loader = vi.fn(async () => `value-${++runs}`);

		expect(await cached('expiring', { ttl: 5 }, loader)).toBe('value-1');
		await sleep(15);
		expect(await cached('expiring', { ttl: 5 }, loader)).toBe('value-2');
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it('does not cache when the ttl is zero', async () => {
		const loader = vi.fn(async () => 'value');

		await cached('uncached', { ttl: 0 }, loader);
		await cached('uncached', { ttl: 0 }, loader);

		expect(loader).toHaveBeenCalledTimes(2);
		expect(readCache('uncached')).toBeUndefined();
	});

	it('shares one loader call between parallel readers', async () => {
		const loader = vi.fn(async () => {
			await sleep(5);
			return 'shared';
		});

		const [first, second, third] = await Promise.all([
			cached('parallel', { ttl: 1000 }, loader),
			cached('parallel', { ttl: 1000 }, loader),
			cached('parallel', { ttl: 1000 }, loader)
		]);

		expect([first, second, third]).toEqual(['shared', 'shared', 'shared']);
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('bypasses the cache when a refresh is requested', async () => {
		let runs = 0;
		const loader = vi.fn(async () => `value-${++runs}`);

		await cached('refreshed', { ttl: 1000 }, loader);
		expect(await cached('refreshed', { ttl: 1000, refresh: true }, loader)).toBe('value-2');
		// the refreshed value replaces the old one
		expect(await cached('refreshed', { ttl: 1000 }, loader)).toBe('value-2');
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it('serves a stale value immediately and refreshes it in the background', async () => {
		let runs = 0;
		const loader = vi.fn(async () => `value-${++runs}`);
		const options = { ttl: 5, staleWhileRevalidate: true };

		expect(await cached('stale', options, loader)).toBe('value-1');
		await sleep(15);

		// Still the old value, with no waiting for Stellio.
		expect(await cached('stale', options, loader)).toBe('value-1');
		expect(loader).toHaveBeenCalledTimes(2);

		await sleep(10);
		expect(readCache<string>('stale')?.value).toBe('value-2');
	});

	it('does not cache failures', async () => {
		const failing = vi.fn(async () => {
			throw new Error('boom');
		});
		await expect(cached('failing', { ttl: 1000 }, failing)).rejects.toThrow('boom');

		const succeeding = vi.fn(async () => 'value');
		expect(await cached('failing', { ttl: 1000 }, succeeding)).toBe('value');
		expect(succeeding).toHaveBeenCalledTimes(1);
	});
});

describe('invalidateCache', () => {
	it('drops every entry when no prefix is given', () => {
		writeCache('a', 1, 1000);
		writeCache('b', 2, 1000);

		invalidateCache();

		expect(cacheSize()).toBe(0);
		expect(readCache('a')).toBeUndefined();
	});

	it('drops only the entries matching the prefix', () => {
		writeCache('stellio:a', 1, 1000);
		writeCache('stellio:b', 2, 1000);
		writeCache('other', 3, 1000);

		invalidateCache('stellio:');

		expect(readCache('stellio:a')).toBeUndefined();
		expect(readCache('other')?.value).toBe(3);
		expect(cacheSize()).toBe(1);
	});
});
