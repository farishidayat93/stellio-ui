export const features = {
	entityTypes: true,
	subscriptions: true,
	attributes: true
};

export type Theme = 'indigo' | 'emerald' | 'rose' | 'amber';

export const theme: Theme = 'indigo';

/**
 * Base accent color per theme. The soft/strong shades used by the UI are derived
 * from these with `color-mix()` in `src/routes/layout.css`, so the accent adapts
 * to the active light/dark/dim mode automatically.
 */
export const themes: Record<Theme, string> = {
	indigo: 'oklch(0.585 0.233 277)',
	emerald: 'oklch(0.596 0.145 163)',
	rose: 'oklch(0.645 0.246 16)',
	amber: 'oklch(0.769 0.188 70)'
};
