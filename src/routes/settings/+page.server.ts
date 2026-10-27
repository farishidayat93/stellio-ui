import {
	getActiveConnection,
	getHostChoices,
	isMultiHostEnabled,
	MAX_SAVED_HOSTS,
	MAX_HOST_NAME_LENGTH
} from '#lib/hosts';

export async function load() {
	const active = getActiveConnection();
	return {
		stellio: {
			// Same resolution the client uses, so an environment-only connection is
			// shown here too instead of appearing as an empty form.
			host: active.host,
			port: active.port,
			multiHost: isMultiHostEnabled(),
			hosts: getHostChoices(),
			maxSavedHosts: MAX_SAVED_HOSTS,
			maxHostNameLength: MAX_HOST_NAME_LENGTH
		},
		db: {
			// The database engine is fixed to SQLite for now. The per-engine
			// credentials (db_host/db_port/db_name/db_user/db_password) are still
			// persisted by the settings API for later, but nothing in the UI can
			// pick another engine, so they are not exposed here.
			type: 'sqlite' as const
		}
	};
}
