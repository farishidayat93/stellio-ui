import { stellio } from '#lib/stellio';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const data = await stellio.getTypeInfo(params.typeName);
	return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
