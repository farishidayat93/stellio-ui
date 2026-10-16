import Database from 'better-sqlite3';
import { variables } from '../env';

const sqlite = new Database('stellio-ui.db');

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

export function getSetting(key: string): string {
	const row = sqlite.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
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
		.prepare(`INSERT OR REPLACE INTO attribute_configs (attribute_name, field_type, default_value) VALUES (?, ?, ?)`)
		.run(name, fieldType, defaultValue);
}
