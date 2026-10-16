import { stellio } from '#lib/stellio';

export async function load() {
	const typeList = await stellio.getTypes();

	const types = await Promise.all(
		typeList.map(async (typeName) => {
			const info = await stellio.getTypeInfo(typeName);
			return {
				typeName,
				entityCount: info.entityCount,
				attributeCount: info.attributeDetails.length
			};
		})
	);

	return { types };
}
