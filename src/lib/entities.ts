/**
 * Browser-safe helpers for the entity browser at `/entities`.
 *
 * Deliberately free of any import that touches SQLite or Stellio: the page and
 * its components run in the browser, while `#lib/stellio` is server-only (it
 * opens the local settings database). Keeping the filter/formatting logic here
 * lets the page stay an orchestrator and the components stay presentational.
 */

export type AttributeDetail = {
	attributeName: string;
	attributeTypes: string[];
};

export type TypeInfo = {
	entityCount: number;
	attributeDetails: AttributeDetail[];
};

export type Entity = { id: string; type: string; [key: string]: unknown };

export type AttrValue = { type: string; value?: unknown; object?: string };

/**
 * Mirrors `TypeSummary` in `#lib/stellio`. It is redeclared here because the
 * Stellio client is server-only: it opens the SQLite settings database.
 */
export type TypeRow = {
	typeName: string;
	entityCount: number | null;
	attributeCount: number | null;
	pending: boolean;
};

/** How many type-info requests run at once while hydrating the list. */
export const HYDRATION_CONCURRENCY = 3;
export const PAGE_SIZE = 10;
/** Safety net above the server-side per-request timeout for Stellio calls. */
export const REQUEST_TIMEOUT_MS = 90_000;
/**
 * Mirrors `DEFAULT_GEO_DISTANCE_M` in `#lib/stellio`, which the entity route
 * falls back to. Kept in sync by hand because that module is server-only.
 */
export const DEFAULT_GEO_DISTANCE_M = 1000;

/** The geo filter that is in force (see `buildGeoQuery`). */
export type GeoQuery = { lat: number; lng: number; distance: number };
/** What the entity query is actually narrowed by, snapshotted on submit. */
export type AppliedFilter = { q: string; geo: GeoQuery | null; count: number };

/**
 * An optional comparison prefix on a filter input, NGSI-LD's own operators.
 * Longer alternatives come first so `>=` is not read as `>`.
 */
const FILTER_OPERATOR = /^(==|!=|>=|<=|~=|=|>|<)\s*/;
const NUMERIC = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
/**
 * Suffixes of the extra inputs a GeoProperty row needs, appended to the
 * attribute name to form a binding key. They are input-box keys, not
 * attribute names (see `emptyFilterValues`).
 */
export const GEO_LAT_KEY = '#lat';
export const GEO_LNG_KEY = '#lng';
export const GEO_DISTANCE_KEY = '#distance';
/** Shown above the filter inputs; mirrors what `buildQuery` does with them. */
export const FILTER_HINT =
	'Text matches as a pattern (~=); prefix a value with ==, !=, >, >=, < or <= to compare exactly or by range. Numbers compare numerically.';

// NGSI-LD entity ids are URIs, typically urn:ngsi-ld:<EntityType>:<id>
const ENTITY_ID_PATTERN = /^(urn:ngsi-ld:[^\s:]+:[^\s]+|https?:\/\/[^\s]+)$/i;

export function isValidEntityId(value: string): boolean {
	return ENTITY_ID_PATTERN.test(value.trim());
}

/**
 * Every input in the filters panel needs a key to bind to: one per
 * attribute, plus three per GeoProperty (latitude, longitude, radius) under
 * the synthetic keys from `GEO_*_KEY`.
 */
export function emptyFilterValues(attributeDetails: AttributeDetail[]): Record<string, string> {
	const values: Record<string, string> = {};
	for (const attr of attributeDetails) {
		values[attr.attributeName] = '';
		if (attr.attributeTypes.includes('GeoProperty')) {
			values[`${attr.attributeName}${GEO_LAT_KEY}`] = '';
			values[`${attr.attributeName}${GEO_LNG_KEY}`] = '';
			values[`${attr.attributeName}${GEO_DISTANCE_KEY}`] = '';
		}
	}
	return values;
}

/**
 * NGSI-LD literal: numbers and booleans stay bare, everything else is
 * quoted. Quotes are stripped from the input because NGSI-LD's `q` grammar
 * has no escape sequence for them.
 */
function qLiteral(value: string): string {
	const cleaned = value.replace(/"/g, '');
	if (NUMERIC.test(cleaned) || cleaned === 'true' || cleaned === 'false') return cleaned;
	return `"${cleaned}"`;
}

/**
 * The `q` clause for the filled text inputs.
 *
 * A bare word matches as a pattern (`~=`, Stellio's substring operator),
 * because exact equality on free text rarely matches anything; an explicit
 * operator prefix wins, and a bare number compares numerically. Attributes
 * are ANDed, which is what NGSI-LD's `;` means.
 *
 * Returns the clause count alongside the expression so the header badge can
 * report how many inputs are in force without re-parsing the expression.
 */
export function buildQuery(
	attributeDetails: AttributeDetail[],
	filterValues: Record<string, string>
): { q: string; count: number } {
	const clauses: string[] = [];
	for (const attr of attributeDetails) {
		if (attr.attributeTypes.includes('GeoProperty')) continue;
		const raw = (filterValues[attr.attributeName] ?? '').trim();
		if (raw === '') continue;

		const { operator, operand } = splitOperator(raw);
		if (operand === '') continue;

		const resolved = operator ?? (NUMERIC.test(operand) ? '==' : '~=');
		clauses.push(`${attr.attributeName}${resolved}${qLiteral(operand)}`);
	}
	return { q: clauses.join(';'), count: clauses.length };
}

/**
 * The distance query for the first GeoProperty with usable coordinates.
 * Stellio accepts one geometry per request, so further pairs are ignored;
 * a blank radius means `DEFAULT_GEO_DISTANCE_M`, as the placeholder says.
 */
export function buildGeoQuery(
	attributeDetails: AttributeDetail[],
	filterValues: Record<string, string>
): GeoQuery | null {
	for (const attr of attributeDetails) {
		if (!attr.attributeTypes.includes('GeoProperty')) continue;

		const lat = (filterValues[`${attr.attributeName}${GEO_LAT_KEY}`] ?? '').trim();
		const lng = (filterValues[`${attr.attributeName}${GEO_LNG_KEY}`] ?? '').trim();
		if (lat === '' || lng === '') continue;

		const latitude = Number(lat);
		const longitude = Number(lng);
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

		const distance = (filterValues[`${attr.attributeName}${GEO_DISTANCE_KEY}`] ?? '').trim();
		const distanceM = distance === '' ? DEFAULT_GEO_DISTANCE_M : Number(distance);
		if (!Number.isFinite(distanceM) || distanceM <= 0) continue;

		return { lat: latitude, lng: longitude, distance: Math.floor(distanceM) };
	}
	return null;
}

/** Relationship inputs must hold a full entity URN before they are sent. */
export function invalidRelationshipFilters(
	attributeDetails: AttributeDetail[],
	filterValues: Record<string, string>
): string[] {
	return attributeDetails
		.filter((attr) => attr.attributeTypes.includes('Relationship'))
		.filter((attr) => {
			const raw = (filterValues[attr.attributeName] ?? '').trim();
			if (raw === '') return false;
			const { operand } = splitOperator(raw);
			return !isValidEntityId(operand);
		})
		.map((attr) => attr.attributeName);
}

export function formatValue(value: unknown): string {
	if (value === null || value === undefined) return '—';
	if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

export function cellValue(entity: Entity, attrName: string): string {
	const raw = entity[attrName];
	if (raw === undefined || raw === null) return '—';

	// Normalised NGSI-LD attribute: `{ type, value }` or `{ type, object }`.
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		const attr = raw as AttrValue;
		if (attr.object !== undefined) return formatValue(attr.object);
		if (attr.value !== undefined) return formatValue(attr.value);
	}
	return formatValue(raw);
}

/** Splits an optional comparison prefix off a filter input. */
export function splitOperator(raw: string): { operator: string | null; operand: string } {
	const match = FILTER_OPERATOR.exec(raw);
	if (!match) return { operator: null, operand: raw };
	// `=` is accepted as a friendlier spelling of `==`.
	return { operator: match[1] === '=' ? '==' : match[1], operand: raw.slice(match[0].length) };
}
