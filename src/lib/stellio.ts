import axios from 'axios';
import { getSetting } from './db';

export type AttributeDetail = {
	attributeName: string;
	attributeTypes: string[];
};

export type EntityTypeInfo = {
	typeName: string;
	entityCount: number;
	attributeDetails: AttributeDetail[];
};

export type Subscription = {
	id: string;
	status: string;
	entities: { type?: string; id?: string }[];
	notificationTrigger: string[];
	notification: {
		endpoint: { uri: string };
		status: string;
		timesSent: number;
		lastNotification?: string;
		lastSuccess?: string;
	};
};

function getClient() {
	return axios.create({
		baseURL: `http://${getSetting('stellio_host')}:${getSetting('stellio_port')}/ngsi-ld/v1`,
		headers: { Accept: 'application/json' }
	});
}

export const stellio = {
	async getTypes(): Promise<string[]> {
		const { data } = await getClient().get('/types');
		return data.typeList ?? data;
	},

	async getTypeInfo(typeName: string): Promise<EntityTypeInfo> {
		const { data } = await getClient().get(`/types/${typeName}`);
		return data;
	},

	async getSubscriptions(): Promise<Subscription[]> {
		const { data } = await getClient().get('/subscriptions');
		return data;
	},

	async getAttributes(): Promise<string[]> {
		const { data } = await getClient().get('/attributes');
		return data.attributeList ?? data;
	},

	async getAttributeInfo(attributeName: string): Promise<{ attributeTypes: string[]; typeNames: string[]; attributeCount: number }> {
		const { data } = await getClient().get(`/attributes/${attributeName}`);
		return data;
	}
};
