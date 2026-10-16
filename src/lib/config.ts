export const features = {
	entityTypes: true,
	subscriptions: true,
	attributes: true
};

export type Theme = 'indigo' | 'emerald' | 'rose' | 'amber';

export const theme: Theme = 'indigo';

export const themes: Record<Theme, { active: string; badge: string; ring: string }> = {
	indigo: {
		active: 'bg-indigo-50 text-indigo-700',
		badge: 'bg-indigo-100 text-indigo-700',
		ring: 'focus:ring-indigo-100'
	},
	emerald: {
		active: 'bg-emerald-50 text-emerald-700',
		badge: 'bg-emerald-100 text-emerald-700',
		ring: 'focus:ring-emerald-100'
	},
	rose: {
		active: 'bg-rose-50 text-rose-700',
		badge: 'bg-rose-100 text-rose-700',
		ring: 'focus:ring-rose-100'
	},
	amber: {
		active: 'bg-amber-50 text-amber-700',
		badge: 'bg-amber-100 text-amber-700',
		ring: 'focus:ring-amber-100'
	}
};
