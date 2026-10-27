import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { variables } from '../env';

/**
 * Where the SQLite file lives.
 *
 * `stellio-ui.db` next to the app is the default (what `npm run dev` uses). A
 * deployment points this at a mounted volume — `compose.yaml` sets
 * `STELLIO_DB_PATH=/data/stellio-ui.db` — so settings and cached type
 * snapshots outlive the container.
 *
 * Read straight from `process.env` instead of adding it to `./env`: `src/env.ts`
 * is SvelteKit's typed-env module, and every name declared there becomes
 * required at build time (see the note in that file).
 */
const dbPath = process.env.STELLIO_DB_PATH?.trim() || 'stellio-ui.db';

// A mounted volume is already there, but the parent of an arbitrary path (or a
// path inside a fresh volume) may not be.
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

sqlite.exec(`
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS attribute_configs (
		attribute_name TEXT PRIMARY KEY,
		field_type TEXT NOT NULL DEFAULT 'text',
		default_value TEXT NOT NULL DEFAULT ''
	);

	-- Last known /types/{typeName} payload, keyed by the connection it came from.
	-- Stellio has to aggregate every entity of a type to answer that call (~2s on
	-- a small type, ~20s on a 500k-entity one), so the UI paints from this table
	-- and refreshes it in the background instead of waiting for Stellio.
	CREATE TABLE IF NOT EXISTS type_info_cache (
		type_name TEXT NOT NULL,
		host TEXT NOT NULL,
		port TEXT NOT NULL,
		entity_count INTEGER NOT NULL,
		attribute_details TEXT NOT NULL,
		fetched_at INTEGER NOT NULL,
		PRIMARY KEY (type_name, host, port)
	);
`);

// seed from env if not already set
const insert = sqlite.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
insert.run('stellio_host', variables.STELLIO_HOST ?? '');
insert.run('stellio_port', variables.STELLIO_PORT ?? '');
insert.run('db_type', 'sqlite');
insert.run('db_host', '');
insert.run('db_port', '');
insert.run('db_name', '');
insert.run('db_user', '');
insert.run('db_password', '');
// Whether the header offers the saved-host switcher (see ./hosts). The saved
// list itself is *not* seeded here: `hosts.ts` uses a never-written key to spot
// a first run, so seeding it would make the list look pre-populated.
insert.run('stellio_multi_host', 'false');

// The engine is fixed for now: SQLite is the only backend this app opens, so a
// value stored by an earlier build (postgres/mysql) is normalised away instead
// of lingering as a setting the UI no longer offers.
sqlite
	.prepare(`UPDATE settings SET value = 'sqlite' WHERE key = 'db_type' AND value <> 'sqlite'`)
	.run();

export function getSetting(key: string): string {
	const row = sqlite.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
		{ value: string } | undefined;
	return row?.value ?? '';
}

export function setSetting(key: string, value: string) {
	sqlite.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
}

export function getAttributeConfig(name: string) {
	return sqlite
		.prepare(`SELECT field_type, default_value FROM attribute_configs WHERE attribute_name = ?`)
		.get(name) as { field_type: string; default_value: string } | undefined;
}

export function setAttributeConfig(name: string, fieldType: string, defaultValue: string) {
	sqlite
		.prepare(
			`INSERT OR REPLACE INTO attribute_configs (attribute_name, field_type, default_value) VALUES (?, ?, ?)`
		)
		.run(name, fieldType, defaultValue);
}

/**
 * Attribute information as persisted in `type_info_cache`.
 *
 * Structurally identical to `AttributeDetail` in `./stellio`; it is redeclared
 * here so the database layer does not have to import the HTTP client (which
 * imports this module back).
 */
export type CachedAttributeDetail = {
	attributeName: string;
	attributeTypes: string[];
};

export type TypeInfoSnapshot = {
	typeName: string;
	entityCount: number;
	attributeDetails: CachedAttributeDetail[];
	fetchedAt: number;
};

type TypeInfoRow = {
	type_name: string;
	entity_count: number;
	attribute_details: string;
	fetched_at: number;
};

/**
 * Snapshots previously stored for a connection, oldest or newest alike — the
 * caller decides whether an entry is still fresh. Rows that cannot be decoded
 * are skipped rather than failing the whole read.
 */
export function getTypeInfoSnapshots(host: string, port: string): TypeInfoSnapshot[] {
	const rows = sqlite
		.prepare(
			`SELECT type_name, entity_count, attribute_details, fetched_at
			 FROM type_info_cache
			 WHERE host = ? AND port = ?`
		)
		.all(host, port) as TypeInfoRow[];

	const snapshots: TypeInfoSnapshot[] = [];
	for (const row of rows) {
		try {
			snapshots.push({
				typeName: row.type_name,
				entityCount: row.entity_count,
				attributeDetails: JSON.parse(row.attribute_details) as CachedAttributeDetail[],
				fetchedAt: row.fetched_at
			});
		} catch {
			// Corrupt row: drop it from the result, the next fetch overwrites it.
		}
	}
	return snapshots;
}

/** Stores the latest `/types/{typeName}` payload for a connection. */
export function saveTypeInfoSnapshot(
	host: string,
	port: string,
	snapshot: { typeName: string; entityCount: number; attributeDetails: CachedAttributeDetail[] }
) {
	sqlite
		.prepare(
			`INSERT OR REPLACE INTO type_info_cache
			 (type_name, host, port, entity_count, attribute_details, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(
			snapshot.typeName,
			host,
			port,
			snapshot.entityCount,
			JSON.stringify(snapshot.attributeDetails),
			Date.now()
		);
}

/**
 * Forgets stored snapshots — for one connection when `host`/`port` are given,
 * for every connection otherwise.
 */
export function clearTypeInfoSnapshots(host?: string, port?: string) {
	if (host && port) {
		sqlite.prepare(`DELETE FROM type_info_cache WHERE host = ? AND port = ?`).run(host, port);
		return;
	}
	sqlite.prepare(`DELETE FROM type_info_cache`).run();
}
