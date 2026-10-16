import { stellio } from '#lib/stellio';

export async function load() {
	const attributes = await stellio.getAttributes();
	return { attributes };
}
