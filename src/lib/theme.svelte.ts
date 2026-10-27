// `$app/env` is the module name in this SvelteKit version (the old
// `$app/environment` alias is gone) — see @sveltejs/kit/src/core/env.js.
import { browser } from '$app/env';

/**
 * UI theme modes. The actual colors live in `src/routes/layout.css`, keyed on
 * the `data-theme` attribute this module writes to <html>.
 */
export type ThemeMode = 'light' | 'dark' | 'dim';

export const themeModes: { id: ThemeMode; label: string }[] = [
	{ id: 'light', label: 'Light' },
	{ id: 'dark', label: 'Dark' },
	{ id: 'dim', label: 'Dim' }
];

export const THEME_STORAGE_KEY = 'stellio-theme';
export const DEFAULT_THEME: ThemeMode = 'light';

export function isThemeMode(value: unknown): value is ThemeMode {
	return value === 'light' || value === 'dark' || value === 'dim';
}

class ThemeState {
	/**
	 * Always starts as the default so server render and first client render
	 * agree; `sync()` reads the value the boot script already applied to <html>
	 * (see src/app.html) once mounted, avoiding a hydration mismatch.
	 */
	current = $state<ThemeMode>(DEFAULT_THEME);

	/** Read the theme currently applied to <html> (client only). */
	sync() {
		if (!browser) return;
		const attr = document.documentElement.dataset.theme;
		if (isThemeMode(attr)) this.current = attr;
	}

	/** Switch theme, apply it to <html> and persist the choice. */
	set(mode: ThemeMode) {
		this.current = mode;
		if (!browser) return;
		document.documentElement.dataset.theme = mode;
		try {
			localStorage.setItem(THEME_STORAGE_KEY, mode);
		} catch {
			/* storage can be unavailable (private mode, blocked cookies) */
		}
	}
}

export const themeState = new ThemeState();
