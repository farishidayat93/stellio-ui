import { getSetting } from '#lib/db';

export async function load() {
	return {
		stellio: { host: getSetting('stellio_host'), port: getSetting('stellio_port') },
		db: {
			type: getSetting('db_type'),
			host: getSetting('db_host'),
			port: getSetting('db_port'),
			name: getSetting('db_name'),
			user: getSetting('db_user'),
			password: getSetting('db_password')
		}
	};
}
