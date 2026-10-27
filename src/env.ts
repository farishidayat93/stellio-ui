import 'dotenv/config';

/**
 * Environment variable fallbacks for the connection settings, read by the app as
 * plain values (`variables.STELLIO_HOST`).
 *
 * NOTE: this file sits at SvelteKit's conventional env location, so it is *also*
 * read as the typed-environment module: `variables` is parsed as the env schema
 * and every name in it is validated against `.env` at build time. Two
 * consequences to keep in mind:
 *
 * - every entry has to be a defined value, otherwise `svelte-kit sync` fails
 *   with `Cannot read properties of undefined (reading 'public')`;
 * - adding an entry makes that variable *required* — a missing value fails the
 *   build unless the entry carries a validator.
 *
 * Optional tuning knobs therefore live next to the code that reads them (see
 * `STELLIO_TIMEOUT_MS`, `STELLIO_MAX_CONCURRENCY` and `STELLIO_CACHE_DISABLED`
 * in `./lib/stellio`).
 */
export const variables = {
	STELLIO_HOST: process.env.STELLIO_HOST ?? '',
	STELLIO_PORT: process.env.STELLIO_PORT ?? ''
};
