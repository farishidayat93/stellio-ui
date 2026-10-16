import { stellio } from '#lib/stellio';
import { getAttributeConfig, setAttributeConfig } from '#lib/db';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	const info = await stellio.getAttributeInfo(params.attributeName);
	const config = getAttributeConfig(params.attributeName);
	return json({ ...info, config: config ?? null });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { fieldType, defaultValue } = await request.json();
	setAttributeConfig(params.attributeName, fieldType, defaultValue);
	return json({ ok: true });
};
