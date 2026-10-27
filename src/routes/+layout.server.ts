import { features, theme, themes } from '#lib/config';
import { getActiveConnection, getHostChoices, isMultiHostEnabled } from '#lib/hosts';
import { isStellioConfigured } from '#lib/stellio';

export async function load() {
	const active = getActiveConnection();
	return {
		features,
		accent: themes[theme],
		stellioConfigured: isStellioConfigured(),
		// Saved Stellio connections offered by the header switcher while
		// multi-host is enabled (manage the list on the Settings page).
		multiHost: isMultiHostEnabled(),
		hosts: getHostChoices(),
		activeHost: active.host && active.port ? `${active.host}:${active.port}` : ''
	};
}
