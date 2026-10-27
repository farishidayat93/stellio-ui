import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateCache } from './cache';

// Mock the SQLite settings store and the env fallback so the guardrail logic can
// be exercised without touching the real database or process environment.
const { mockGetSetting, mockEnv, snapshotStore } = vi.hoisted(() => ({
	mockGetSetting: vi.fn<(key: string) => string>(() => ''),
	mockEnv: {
		STELLIO_HOST: undefined as string | undefined,
		STELLIO_PORT: undefined as string | undefined
	},
	// Stands in for the `type_info_cache` table.
	snapshotStore: new Map<
		string,
		{
			typeName: string;
			entityCount: number;
			attributeDetails: { attributeName: string; attributeTypes: string[] }[];
			host: string;
			port: string;
			fetchedAt: number;
		}
	>()
}));

// `stellio` reaches Stellio through axios; the mock records the calls instead.
const { mockGet, mockCreate } = vi.hoisted(() => {
	const mockGet = vi.fn<
		(
			url: string,
			config?: { params: URLSearchParams }
		) => Promise<{ data: unknown; status?: number }>
	>(async () => ({ data: {} }));
	const mockCreate = vi.fn(() => ({ get: mockGet }));
	return { mockGet, mockCreate };
});

vi.mock('./db', () => ({
	getSetting: (key: string) => mockGetSetting(key),
	getTypeInfoSnapshots: (host: string, port: string) =>
		[...snapshotStore.values()].filter(
			(snapshot) => snapshot.host === host && snapshot.port === port
		),
	saveTypeInfoSnapshot: (
		host: string,
		port: string,
		snapshot: {
			typeName: string;
			entityCount: number;
			attributeDetails: { attributeName: string; attributeTypes: string[] }[];
		}
	) => snapshotStore.set(snapshot.typeName, { ...snapshot, host, port, fetchedAt: Date.now() })
}));
vi.mock('../env', () => ({ variables: mockEnv }));
// `isAxiosError` is how `stellio` recognises a transport failure, so the mock
// keeps axios' marker-field check rather than stubbing it away.
vi.mock('axios', () => ({
	default: {
		create: mockCreate,
		isAxiosError: (err: unknown) => Boolean(err && typeof err === 'object' && 'isAxiosError' in err)
	}
}));

const {
	checkConnection,
	getStellioConfig,
	isStellioConfigured,
	StellioNotConfiguredError,
	stellio
} = await import('./stellio');

/** Points the client at a given broker. */
function configure(host: string, port: string) {
	mockGetSetting.mockImplementation((key: string) =>
		key === 'stellio_host' ? host : key === 'stellio_port' ? port : ''
	);
}

/** An axios-shaped rejection, as axios reports a failed request. */
function axiosFailure(fields: { code?: string; status?: number; message?: string } = {}): Error {
	return Object.assign(new Error(fields.message ?? 'Request failed'), {
		isAxiosError: true,
		code: fields.code,
		response: fields.status === undefined ? undefined : { status: fields.status }
	});
}

beforeEach(() => {
	mockGetSetting.mockReset();
	mockGetSetting.mockReturnValue('');
	mockEnv.STELLIO_HOST = undefined;
	mockEnv.STELLIO_PORT = undefined;
	mockGet.mockReset();
	mockGet.mockResolvedValue({ data: {} });
	mockCreate.mockClear();
	snapshotStore.clear();
	// the response cache outlives a test, so each one starts from a cold process
	invalidateCache();
});

describe('isStellioConfigured', () => {
	it('is false when neither the db nor env provides host and port', () => {
		expect(isStellioConfigured()).toBe(false);
	});

	it('is false when only the host is set', () => {
		mockGetSetting.mockImplementation((key: string) => (key === 'stellio_host' ? 'localhost' : ''));
		expect(isStellioConfigured()).toBe(false);
	});

	it('is true when the db provides both host and port', () => {
		mockGetSetting.mockImplementation((key: string) =>
			key === 'stellio_host' ? 'localhost' : key === 'stellio_port' ? '8765' : ''
		);
		expect(isStellioConfigured()).toBe(true);
		expect(getStellioConfig()).toEqual({ host: 'localhost', port: '8765' });
	});

	it('falls back to env vars when the db is empty', () => {
		mockEnv.STELLIO_HOST = 'env-host';
		mockEnv.STELLIO_PORT = '1234';
		expect(isStellioConfigured()).toBe(true);
		expect(getStellioConfig()).toEqual({ host: 'env-host', port: '1234' });
	});

	it('prefers db values over env values', () => {
		mockGetSetting.mockImplementation((key: string) =>
			key === 'stellio_host' ? 'db-host' : key === 'stellio_port' ? '9999' : ''
		);
		mockEnv.STELLIO_HOST = 'env-host';
		mockEnv.STELLIO_PORT = '1234';
		expect(getStellioConfig()).toEqual({ host: 'db-host', port: '9999' });
	});
});

describe('stellio client guardrail', () => {
	it('rejects with StellioNotConfiguredError when unconfigured', async () => {
		await expect(stellio.getTypes()).rejects.toBeInstanceOf(StellioNotConfiguredError);
	});
});

describe('stellio caching', () => {
	it('asks Stellio once for repeated type-list reads', async () => {
		configure('cached-host', '8765');
		mockGet.mockResolvedValue({ data: { typeList: ['Vehicle', 'Alert'] } });

		expect(await stellio.getTypes()).toEqual(['Vehicle', 'Alert']);
		expect(await stellio.getTypes()).toEqual(['Vehicle', 'Alert']);
		expect(mockGet).toHaveBeenCalledTimes(1);
	});

	it('reuses a single axios client per connection', async () => {
		configure('pooled-host', '8765');

		await stellio.getAttributes();
		await stellio.getSubscriptions();

		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(mockCreate).toHaveBeenCalledTimes(1);
	});
});

describe('stellio type summaries', () => {
	it('stores fetched type info so the type list can be served from disk', async () => {
		configure('snapshot-host', '8765');
		mockGet.mockResolvedValue({
			data: {
				typeName: 'Vehicle',
				entityCount: 3,
				attributeDetails: [{ attributeName: 'speed', attributeTypes: ['Property'] }]
			}
		});

		expect((await stellio.getTypeInfo('Vehicle')).entityCount).toBe(3);
		expect(snapshotStore.get('Vehicle')?.entityCount).toBe(3);

		expect(stellio.getTypeSummaries(['Vehicle', 'Unknown'])).toEqual([
			{ typeName: 'Vehicle', entityCount: 3, attributeCount: 1, pending: false },
			{ typeName: 'Unknown', entityCount: null, attributeCount: null, pending: true }
		]);
	});

	it('marks a type as pending when nothing is known about it', () => {
		configure('unknown-host', '8765');

		expect(stellio.getTypeSummaries(['Alert'])).toEqual([
			{ typeName: 'Alert', entityCount: null, attributeCount: null, pending: true }
		]);
	});

	it('ignores snapshots recorded for another connection', () => {
		snapshotStore.set('Vehicle', {
			typeName: 'Vehicle',
			entityCount: 42,
			attributeDetails: [],
			host: 'other-host',
			port: '8765',
			fetchedAt: Date.now()
		});
		configure('snapshot-host', '8765');

		expect(stellio.getTypeSummaries(['Vehicle'])[0].entityCount).toBeNull();
	});

	it('keeps serving a stale count while flagging the row as pending', () => {
		snapshotStore.set('Vehicle', {
			typeName: 'Vehicle',
			entityCount: 7,
			attributeDetails: [{ attributeName: 'speed', attributeTypes: ['Property'] }],
			host: 'stale-host',
			port: '8765',
			fetchedAt: Date.now() - 600_000
		});
		configure('stale-host', '8765');

		expect(stellio.getTypeSummaries(['Vehicle'])).toEqual([
			{ typeName: 'Vehicle', entityCount: 7, attributeCount: 1, pending: true }
		]);
	});
});

describe('stellio entity queries', () => {
	it('asks for a plain page unless narrowing was requested', async () => {
		configure('entities-host', '8765');
		mockGet.mockResolvedValue({ data: [] });

		await stellio.getEntities('Vehicle', 20, 10);
		const [, plainConfig] = mockGet.mock.calls[0];
		expect(plainConfig?.params.toString()).toBe('type=Vehicle&offset=20&limit=10');

		await stellio.getEntities('Vehicle', 0, 10, { keyValues: true, attrs: ['speed', 'brand'] });
		const [, narrowedConfig] = mockGet.mock.calls[1];
		expect(narrowedConfig?.params.get('options')).toBe('keyValues');
		expect(narrowedConfig?.params.get('attrs')).toBe('speed,brand');
		// `count=true` costs ~60x a plain page and is never requested.
		expect(narrowedConfig?.params.has('count')).toBe(false);
	});
});

describe('checkConnection', () => {
	it('reports a reachable broker with its status and latency', async () => {
		mockGet.mockResolvedValue({ data: { typeList: [] }, status: 200 });

		const health = await checkConnection('probe-host', '8765');

		expect(health.ok).toBe(true);
		expect(health.status).toBe(200);
		expect(health.error).toBe('');
		expect(health.latencyMs).toBeGreaterThanOrEqual(0);
		expect(mockGet).toHaveBeenCalledWith('/types', { timeout: expect.any(Number) });
	});

	it('probes the address it was given rather than the connection in use', async () => {
		// The point of the per-host check on the Settings page: it has to be able
		// to test a host the app is *not* pointed at.
		configure('active-host', '1234');

		await checkConnection('other-host', '9999');

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ baseURL: 'http://other-host:9999/ngsi-ld/v1' })
		);
	});

	it('never serves a probe from the response cache', async () => {
		configure('cached-probe-host', '8765');
		mockGet.mockResolvedValue({ data: { typeList: ['Vehicle'] }, status: 200 });

		await stellio.getTypes();
		await stellio.getTypes();
		expect(mockGet).toHaveBeenCalledTimes(1);

		await checkConnection('cached-probe-host', '8765');

		// A cached type list says nothing about whether the broker answers now.
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(mockGet.mock.calls[1][0]).toBe('/types');
	});

	it('reports an unreachable broker as data instead of throwing', async () => {
		mockGet.mockRejectedValue(axiosFailure({ code: 'ECONNREFUSED' }));

		expect(await checkConnection('down-host', '8765')).toMatchObject({
			ok: false,
			status: null,
			error: 'Connection refused \u2014 is Stellio running?'
		});
	});

	it('explains a timeout without leaking the raw axios code', async () => {
		mockGet.mockRejectedValue(axiosFailure({ code: 'ECONNABORTED' }));

		expect((await checkConnection('slow-host', '8765')).error).toMatch(
			/^No answer within \d+ ms\.$/
		);
	});

	it('explains an unresolvable address', async () => {
		mockGet.mockRejectedValue(axiosFailure({ code: 'ENOTFOUND' }));

		expect((await checkConnection('nope.invalid', '8765')).error).toBe(
			'Host name could not be resolved.'
		);
	});

	it('reports the HTTP status a broker answered with', async () => {
		mockGet.mockRejectedValue(axiosFailure({ status: 401 }));

		expect(await checkConnection('guarded-host', '8765')).toMatchObject({
			ok: false,
			status: 401,
			error: 'The broker answered 401. Check credentials.'
		});
	});

	it('names the NGSI-LD path when a 404 comes back', async () => {
		mockGet.mockRejectedValue(axiosFailure({ status: 404 }));

		expect((await checkConnection('other-app-host', '8765')).error).toBe(
			'Nothing answers on the NGSI-LD API path (404).'
		);
	});

	it('falls back to the error message for anything else', async () => {
		mockGet.mockRejectedValue(new Error('socket hang up'));

		expect(await checkConnection('weird-host', '8765')).toMatchObject({
			ok: false,
			status: null,
			error: 'socket hang up'
		});
	});
});
