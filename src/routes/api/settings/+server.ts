import { getSetting, setSetting } from '#lib/db';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	return json({
		host: getSetting('stellio_host'),
		port: getSetting('stellio_port'),
		db_type: getSetting('db_type'),
		db_host: getSetting('db_host'),
		db_port: getSetting('db_port'),
		db_name: getSetting('db_name'),
		db_user: getSetting('db_user'),
		db_password: getSetting('db_password')
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	for (const [key, value] of Object.entries(body)) {
		setSetting(key, String(value));
	}
	return json({ ok: true });
};
