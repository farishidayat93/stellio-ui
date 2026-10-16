import { features, theme, themes } from '#lib/config';

export async function load() {
	return { features, t: themes[theme] };
}
