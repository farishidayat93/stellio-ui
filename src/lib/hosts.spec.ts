import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the settings store and the env fallback: the host list logic is pure
// bookkeeping over those two, and this keeps the suite off the real
// stellio-ui.db (same approach as ./stellio.spec.ts).
const { mockStore, mockEnv } = vi.hoisted(() => ({
	mockStore: new Map<string, string>(),
	mockEnv: {
		STELLIO_HOST: undefined as string | undefined,
		STELLIO_PORT: undefined as string | undefined
	}
}));

vi.mock('./db', () => ({
	getSetting: (key: string) => mockStore.get(key) ?? '',
	setSetting: (key: string, value: string) => {
		mockStore.set(key, value);
	}
}));
vi.mock('../env', () => ({ variables: mockEnv }));

const {
	MAX_SAVED_HOSTS,
	MAX_HOST_NAME_LENGTH,
	findSavedHost,
	forgetHost,
	getActiveConnection,
	getHostChoices,
	getSavedHosts,
	hostKey,
	isMultiHostEnabled,
	parseHostKey,
	rememberHost,
	renameSavedHost,
	setMultiHostEnabled
} = await import('./hosts');

/** Writes the connection the app would have persisted. */
function configure(host: string, port: string) {
	mockStore.set('stellio_host', host);
	mockStore.set('stellio_port', port);
}

beforeEach(() => {
	mockStore.clear();
	mockEnv.STELLIO_HOST = undefined;
	mockEnv.STELLIO_PORT = undefined;
});

describe('hostKey / parseHostKey', () => {
	it('round-trips a host and port', () => {
		expect(hostKey('localhost', '8765')).toBe('localhost:8765');
		expect(parseHostKey('localhost:8765')).toEqual({ host: 'localhost', port: '8765' });
	});

	it('splits on the last colon so an IPv6 host survives', () => {
		expect(parseHostKey('::1:8765')).toEqual({ host: '::1', port: '8765' });
	});

	it('rejects values that are not a host:port pair', () => {
		expect(parseHostKey('localhost')).toBeNull();
		expect(parseHostKey(':8765')).toBeNull();
		expect(parseHostKey('localhost:')).toBeNull();
		expect(parseHostKey('   ')).toBeNull();
	});
});

describe('getActiveConnection', () => {
	it('prefers the saved connection', () => {
		configure('db-host', '9999');
		mockEnv.STELLIO_HOST = 'env-host';
		mockEnv.STELLIO_PORT = '1234';

		expect(getActiveConnection()).toEqual({ host: 'db-host', port: '9999' });
	});

	it('falls back to the environment', () => {
		mockEnv.STELLIO_HOST = 'env-host';
		mockEnv.STELLIO_PORT = '1234';

		expect(getActiveConnection()).toEqual({ host: 'env-host', port: '1234' });
	});

	it('is empty when nothing is configured', () => {
		expect(getActiveConnection()).toEqual({ host: '', port: '' });
	});
});

describe('getSavedHosts', () => {
	it('adopts the configured connection on first read', () => {
		mockEnv.STELLIO_HOST = 'localhost';
		mockEnv.STELLIO_PORT = '8765';

		expect(getSavedHosts()).toEqual([{ host: 'localhost', port: '8765' }]);
	});

	it('is empty when there is nothing to adopt', () => {
		expect(getSavedHosts()).toEqual([]);
	});

	it('does not re-adopt a connection once the list has been written', () => {
		configure('a', '1');
		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);

		// Switching hosts stays the only way back in: the app must not treat the
		// connection it happens to be using as "new" again.
		configure('b', '2');
		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});

	it('ignores a corrupt stored list', () => {
		mockStore.set('stellio_hosts', 'not json');
		expect(getSavedHosts()).toEqual([]);
	});

	it('drops unusable and duplicate entries', () => {
		mockStore.set(
			'stellio_hosts',
			JSON.stringify([{ host: 'a', port: '1' }, { host: 'a', port: '1' }, { host: 'b' }, null])
		);

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});
});

describe('rememberHost', () => {
	it('keeps the most recently saved connection first', () => {
		rememberHost('a', '1');
		rememberHost('b', '2');

		expect(getSavedHosts()).toEqual([
			{ host: 'b', port: '2' },
			{ host: 'a', port: '1' }
		]);
	});

	it('moves an existing connection to the front instead of duplicating it', () => {
		rememberHost('a', '1');
		rememberHost('b', '2');
		rememberHost('a', '1');

		expect(getSavedHosts()).toEqual([
			{ host: 'a', port: '1' },
			{ host: 'b', port: '2' }
		]);
	});

	it('caps the list and forgets the oldest entries', () => {
		for (let i = 0; i < MAX_SAVED_HOSTS + 3; i++) rememberHost('host', String(i));

		const saved = getSavedHosts();
		expect(saved).toHaveLength(MAX_SAVED_HOSTS);
		expect(saved[0]).toEqual({ host: 'host', port: String(MAX_SAVED_HOSTS + 2) });
		expect(saved.some((host) => host.port === '0')).toBe(false);
	});

	it('trims the values it stores', () => {
		rememberHost('  padded  ', ' 8765 ');

		expect(getSavedHosts()).toEqual([{ host: 'padded', port: '8765' }]);
	});

	it('ignores a half-filled connection', () => {
		rememberHost('a', '1');
		rememberHost('b', '');

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});
});

describe('connection names', () => {
	it('stores a name with the connection it belongs to', () => {
		rememberHost('a', '1', '  Production  ');

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1', name: 'Production' }]);
	});

	it('caps how long a name can be', () => {
		rememberHost('a', '1', 'x'.repeat(MAX_HOST_NAME_LENGTH + 10));

		expect(getSavedHosts()[0].name).toHaveLength(MAX_HOST_NAME_LENGTH);
	});

	it('leaves a connection unnamed when the name is blank', () => {
		rememberHost('a', '1', '   ');

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});

	it('keeps the name when the same address is saved again', () => {
		// Saving the form re-posts host and port; that must not wipe a name.
		rememberHost('a', '1', 'Production');
		rememberHost('a', '1');

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1', name: 'Production' }]);
	});

	it('renames a saved connection', () => {
		rememberHost('a', '1');

		expect(renameSavedHost('a:1', 'Staging')).toEqual([{ host: 'a', port: '1', name: 'Staging' }]);
		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1', name: 'Staging' }]);
	});

	it('clears a name when it is renamed to blank', () => {
		rememberHost('a', '1', 'Production');
		renameSavedHost('a:1', '  ');

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});

	it('refuses to rename something that is not saved', () => {
		rememberHost('a', '1', 'Production');

		expect(renameSavedHost('b:2', 'Nope')).toBeNull();
		expect(renameSavedHost('nonsense', 'Nope')).toBeNull();
		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1', name: 'Production' }]);
	});

	it('drops a non-string name from a hand-edited stored list', () => {
		mockStore.set(
			'stellio_hosts',
			JSON.stringify([{ host: 'a', port: '1', name: { nope: true } }])
		);

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});
});

describe('forgetHost', () => {
	it('removes a saved connection', () => {
		rememberHost('a', '1');
		rememberHost('b', '2');

		expect(forgetHost('a', '1')).toEqual([{ host: 'b', port: '2' }]);
	});

	it('leaves the other connections alone', () => {
		rememberHost('a', '1');
		forgetHost('missing', '9');

		expect(getSavedHosts()).toEqual([{ host: 'a', port: '1' }]);
	});
});

describe('isMultiHostEnabled / setMultiHostEnabled', () => {
	it('is off until it is turned on', () => {
		expect(isMultiHostEnabled()).toBe(false);
	});

	it('turns on and off again', () => {
		setMultiHostEnabled(true);
		expect(isMultiHostEnabled()).toBe(true);

		setMultiHostEnabled(false);
		expect(isMultiHostEnabled()).toBe(false);
	});

	it('reads the stored flag tolerantly', () => {
		mockStore.set('stellio_multi_host', 'TRUE');
		expect(isMultiHostEnabled()).toBe(true);
	});
});

describe('findSavedHost', () => {
	it('finds a saved connection by its key', () => {
		rememberHost('a', '1');

		expect(findSavedHost('a:1')).toEqual({ host: 'a', port: '1' });
	});

	it('returns null for an unknown or malformed key', () => {
		rememberHost('a', '1');

		expect(findSavedHost('b:2')).toBeNull();
		expect(findSavedHost('nonsense')).toBeNull();
	});
});

describe('getHostChoices', () => {
	it('lists the saved connections and marks the active one', () => {
		configure('a', '1');
		rememberHost('b', '2');

		expect(getHostChoices()).toEqual([
			{ key: 'b:2', label: 'b:2', name: '', saved: true, active: false },
			{ key: 'a:1', label: 'a:1', name: '', saved: true, active: true }
		]);
	});

	it('labels a named connection with its address and the name in brackets', () => {
		configure('a', '1');
		rememberHost('b', '2', 'Production');

		expect(getHostChoices()).toEqual([
			{ key: 'b:2', label: 'b:2 (Production)', name: 'Production', saved: true, active: false },
			{ key: 'a:1', label: 'a:1', name: '', saved: true, active: true }
		]);
	});

	it('includes the active connection when it is not in the saved list', () => {
		// It can be removed while the app still talks to it, and a <select> bound
		// to the active connection needs a matching option. `saved: false` is what
		// stops the settings page from offering to rename or remove it.
		rememberHost('a', '1');
		configure('lonely', '1');

		expect(getHostChoices()).toEqual([
			{ key: 'lonely:1', label: 'lonely:1 (current)', name: '', saved: false, active: true },
			{ key: 'a:1', label: 'a:1', name: '', saved: true, active: false }
		]);
	});

	it('is empty when nothing is configured', () => {
		expect(getHostChoices()).toEqual([]);
	});
});
