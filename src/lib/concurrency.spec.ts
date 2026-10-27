import { describe, expect, it } from 'vitest';
import { createSemaphore, runPool } from './concurrency';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createSemaphore', () => {
	it('runs at most `limit` jobs at a time', async () => {
		const run = createSemaphore(2);
		let active = 0;
		let peak = 0;
		const job = async () => {
			active += 1;
			peak = Math.max(peak, active);
			await sleep(5);
			active -= 1;
		};

		await Promise.all([run(job), run(job), run(job), run(job)]);

		expect(peak).toBe(2);
		expect(active).toBe(0);
	});

	it('frees the slot when a job fails', async () => {
		const run = createSemaphore(1);

		await expect(
			run(async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');

		await expect(run(async () => 'next')).resolves.toBe('next');
	});

	it('treats a non-positive limit as one', async () => {
		const run = createSemaphore(0);
		let active = 0;
		let peak = 0;
		const job = async () => {
			active += 1;
			peak = Math.max(peak, active);
			await sleep(5);
			active -= 1;
		};

		await Promise.all([run(job), run(job)]);

		expect(peak).toBe(1);
	});
});

describe('runPool', () => {
	it('processes every item exactly once', async () => {
		const seen: number[] = [];

		await runPool([1, 2, 3, 4, 5], 2, async (item) => {
			seen.push(item);
		});

		expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
	});

	it('keeps the pool at the requested size', async () => {
		let active = 0;
		let peak = 0;

		await runPool([1, 2, 3, 4, 5, 6], 3, async () => {
			active += 1;
			peak = Math.max(peak, active);
			await sleep(5);
			active -= 1;
		});

		expect(peak).toBe(3);
		expect(active).toBe(0);
	});

	it('resolves without calling the worker for an empty list', async () => {
		let calls = 0;

		await runPool([], 3, async () => {
			calls += 1;
		});

		expect(calls).toBe(0);
	});
});
