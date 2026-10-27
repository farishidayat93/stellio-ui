import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GEO_DISTANCE_M,
	GEO_DISTANCE_KEY,
	GEO_LAT_KEY,
	GEO_LNG_KEY,
	buildGeoQuery,
	buildQuery,
	cellValue,
	emptyFilterValues,
	formatValue,
	invalidRelationshipFilters,
	isValidEntityId,
	splitOperator,
	type AttributeDetail,
	type Entity
} from './entities';

const attr = (attributeName: string, ...attributeTypes: string[]): AttributeDetail => ({
	attributeName,
	attributeTypes
});

describe('splitOperator', () => {
	it('returns no operator for a bare operand', () => {
		expect(splitOperator('active')).toEqual({ operator: null, operand: 'active' });
	});

	it('reads each supported prefix and strips it from the operand', () => {
		expect(splitOperator('~=foo')).toEqual({ operator: '~=', operand: 'foo' });
		expect(splitOperator('!=foo')).toEqual({ operator: '!=', operand: 'foo' });
		expect(splitOperator('==42')).toEqual({ operator: '==', operand: '42' });
	});

	it('prefers the longest alternative so `>=` is not read as `>`', () => {
		expect(splitOperator('>=10')).toEqual({ operator: '>=', operand: '10' });
		expect(splitOperator('<=10')).toEqual({ operator: '<=', operand: '10' });
		expect(splitOperator('>10')).toEqual({ operator: '>', operand: '10' });
		expect(splitOperator('<10')).toEqual({ operator: '<', operand: '10' });
	});

	it('treats `=` as a friendlier spelling of `==`', () => {
		expect(splitOperator('=42')).toEqual({ operator: '==', operand: '42' });
	});

	it('ignores whitespace between the operator and the operand', () => {
		expect(splitOperator('==   42')).toEqual({ operator: '==', operand: '42' });
	});

	it('leaves a mid-string comparison alone', () => {
		expect(splitOperator('a>b')).toEqual({ operator: null, operand: 'a>b' });
	});
});

describe('isValidEntityId', () => {
	it('accepts an urn:ngsi-ld entity id', () => {
		expect(isValidEntityId('urn:ngsi-ld:Building:001')).toBe(true);
	});

	it('accepts an http(s) url', () => {
		expect(isValidEntityId('https://example.org/entities/1')).toBe(true);
		expect(isValidEntityId('http://example.org/entities/1')).toBe(true);
	});

	it('rejects a bare id, a truncated urn and an empty value', () => {
		expect(isValidEntityId('Building:001')).toBe(false);
		expect(isValidEntityId('urn:ngsi-ld:Building')).toBe(false);
		expect(isValidEntityId('')).toBe(false);
		expect(isValidEntityId('   ')).toBe(false);
	});
});

describe('emptyFilterValues', () => {
	it('creates one blank key per plain attribute', () => {
		expect(emptyFilterValues([attr('name', 'Property'), attr('active', 'Property')])).toEqual({
			name: '',
			active: ''
		});
	});

	it('adds the three geo keys for a GeoProperty', () => {
		expect(emptyFilterValues([attr('location', 'GeoProperty')])).toEqual({
			location: '',
			[`location${GEO_LAT_KEY}`]: '',
			[`location${GEO_LNG_KEY}`]: '',
			[`location${GEO_DISTANCE_KEY}`]: ''
		});
	});

	it('returns an empty object when there are no attributes', () => {
		expect(emptyFilterValues([])).toEqual({});
	});
});

describe('buildQuery', () => {
	it('returns an empty clause and a zero count when nothing is filled in', () => {
		expect(buildQuery([attr('name', 'Property')], { name: '  ' })).toEqual({ q: '', count: 0 });
	});

	it('matches free text as a pattern and counts the clause', () => {
		expect(buildQuery([attr('name', 'Property')], { name: 'Main' })).toEqual({
			q: 'name~="Main"',
			count: 1
		});
	});

	it('compares a bare number numerically rather than as a pattern', () => {
		expect(buildQuery([attr('height', 'Property')], { height: '42' })).toEqual({
			q: 'height==42',
			count: 1
		});
	});

	it('keeps a negative or fractional number bare', () => {
		expect(buildQuery([attr('height', 'Property')], { height: '-3.5' }).q).toBe('height==-3.5');
	});

	it('honours an explicit operator', () => {
		expect(buildQuery([attr('height', 'Property')], { height: '>=10' }).q).toBe('height>=10');
		expect(buildQuery([attr('name', 'Property')], { name: '!=Marseille' }).q).toBe(
			'name!="Marseille"'
		);
	});

	it('keeps the NGSI-LD literals true and false unquoted', () => {
		// They are not numbers, so the implicit operator is the pattern match;
		// only the literal itself stays bare for the `q` grammar.
		expect(buildQuery([attr('active', 'Property')], { active: 'true' }).q).toBe('active~=true');
		expect(buildQuery([attr('active', 'Property')], { active: 'false' }).q).toBe('active~=false');
	});

	it('strips double quotes from the input, which the q grammar cannot escape', () => {
		expect(buildQuery([attr('name', 'Property')], { name: 'a"b' }).q).toBe('name~="ab"');
	});

	it('ANDs the filled attributes and ignores the blank ones', () => {
		const attributes = [
			attr('name', 'Property'),
			attr('height', 'Property'),
			attr('city', 'Property')
		];
		expect(buildQuery(attributes, { name: 'Main', height: '', city: 'Lyon' })).toEqual({
			q: 'name~="Main";city~="Lyon"',
			count: 2
		});
	});

	it('skips a GeoProperty, which is sent as a geometry instead', () => {
		const attributes = [attr('location', 'GeoProperty'), attr('name', 'Property')];
		expect(
			buildQuery(attributes, {
				name: 'Main',
				[`location${GEO_LAT_KEY}`]: '43.3',
				[`location${GEO_LNG_KEY}`]: '5.4'
			})
		).toEqual({ q: 'name~="Main"', count: 1 });
	});

	it('ignores an operator with no operand', () => {
		expect(buildQuery([attr('height', 'Property')], { height: '>=' })).toEqual({ q: '', count: 0 });
	});
});

describe('buildGeoQuery', () => {
	it('falls back to the default radius when only the coordinates are set', () => {
		expect(
			buildGeoQuery([attr('location', 'GeoProperty')], {
				[`location${GEO_LAT_KEY}`]: '43.3',
				[`location${GEO_LNG_KEY}`]: '5.4'
			})
		).toEqual({ lat: 43.3, lng: 5.4, distance: DEFAULT_GEO_DISTANCE_M });
	});

	it('uses and floors an explicit radius', () => {
		expect(
			buildGeoQuery([attr('location', 'GeoProperty')], {
				[`location${GEO_LAT_KEY}`]: '43.3',
				[`location${GEO_LNG_KEY}`]: '5.4',
				[`location${GEO_DISTANCE_KEY}`]: '2500.7'
			})
		).toEqual({ lat: 43.3, lng: 5.4, distance: 2500 });
	});

	it('needs both coordinates', () => {
		const attributes = [attr('location', 'GeoProperty')];
		expect(buildGeoQuery(attributes, { [`location${GEO_LAT_KEY}`]: '43.3' })).toBeNull();
		expect(buildGeoQuery(attributes, { [`location${GEO_LNG_KEY}`]: '5.4' })).toBeNull();
	});

	it('rejects a radius that is not a positive number', () => {
		const attributes = [attr('location', 'GeoProperty')];
		const coordinates = {
			[`location${GEO_LAT_KEY}`]: '43.3',
			[`location${GEO_LNG_KEY}`]: '5.4'
		};
		expect(
			buildGeoQuery(attributes, { ...coordinates, [`location${GEO_DISTANCE_KEY}`]: '0' })
		).toBeNull();
		expect(
			buildGeoQuery(attributes, { ...coordinates, [`location${GEO_DISTANCE_KEY}`]: 'abc' })
		).toBeNull();
	});

	it('ignores a non-numeric coordinate', () => {
		expect(
			buildGeoQuery([attr('location', 'GeoProperty')], {
				[`location${GEO_LAT_KEY}`]: 'north',
				[`location${GEO_LNG_KEY}`]: '5.4'
			})
		).toBeNull();
	});

	it('uses the first usable GeoProperty, since Stellio takes one geometry', () => {
		const attributes = [attr('location', 'GeoProperty'), attr('area', 'GeoProperty')];
		expect(
			buildGeoQuery(attributes, {
				[`area${GEO_LAT_KEY}`]: '1',
				[`area${GEO_LNG_KEY}`]: '2',
				[`location${GEO_LAT_KEY}`]: '43.3',
				[`location${GEO_LNG_KEY}`]: '5.4'
			})
		).toEqual({ lat: 43.3, lng: 5.4, distance: DEFAULT_GEO_DISTANCE_M });
	});

	it('skips an unusable first GeoProperty and falls through to the next', () => {
		const attributes = [attr('location', 'GeoProperty'), attr('area', 'GeoProperty')];
		expect(
			buildGeoQuery(attributes, {
				[`area${GEO_LAT_KEY}`]: '1',
				[`area${GEO_LNG_KEY}`]: '2'
			})
		).toEqual({ lat: 1, lng: 2, distance: DEFAULT_GEO_DISTANCE_M });
	});

	it('returns null when there is no GeoProperty at all', () => {
		expect(buildGeoQuery([attr('name', 'Property')], { name: 'Main' })).toBeNull();
	});
});

describe('invalidRelationshipFilters', () => {
	it('accepts a Relationship holding a full entity URN', () => {
		expect(
			invalidRelationshipFilters([attr('belongsTo', 'Relationship')], {
				belongsTo: 'urn:ngsi-ld:Building:001'
			})
		).toEqual([]);
	});

	it('accepts a URN behind an operator prefix', () => {
		expect(
			invalidRelationshipFilters([attr('belongsTo', 'Relationship')], {
				belongsTo: '!=urn:ngsi-ld:Building:001'
			})
		).toEqual([]);
	});

	it('flags a Relationship holding a bare id', () => {
		expect(
			invalidRelationshipFilters([attr('belongsTo', 'Relationship')], { belongsTo: 'Building:001' })
		).toEqual(['belongsTo']);
	});

	it('ignores a blank Relationship input', () => {
		expect(
			invalidRelationshipFilters([attr('belongsTo', 'Relationship')], { belongsTo: '   ' })
		).toEqual([]);
	});

	it('ignores attributes that are not Relationships', () => {
		expect(invalidRelationshipFilters([attr('name', 'Property')], { name: 'not-a-urn' })).toEqual(
			[]
		);
	});

	it('lists every offending attribute', () => {
		const attributes = [
			attr('belongsTo', 'Relationship'),
			attr('name', 'Property'),
			attr('ownedBy', 'Relationship')
		];
		expect(
			invalidRelationshipFilters(attributes, { belongsTo: 'nope', ownedBy: 'also-nope' })
		).toEqual(['belongsTo', 'ownedBy']);
	});
});

describe('formatValue', () => {
	it('renders a placeholder for null and undefined', () => {
		expect(formatValue(null)).toBe('—');
		expect(formatValue(undefined)).toBe('—');
	});

	it('joins an array, formatting each item', () => {
		expect(formatValue([1, 'two', null])).toBe('1, two, —');
	});

	it('serialises a plain object', () => {
		expect(formatValue({ a: 1 })).toBe('{"a":1}');
	});

	it('passes scalars through String()', () => {
		expect(formatValue(0)).toBe('0');
		expect(formatValue(false)).toBe('false');
		expect(formatValue('x')).toBe('x');
	});
});

describe('cellValue', () => {
	const entity = (attributes: Record<string, unknown>): Entity => ({
		id: 'urn:ngsi-ld:Building:001',
		type: 'Building',
		...attributes
	});

	it('renders a placeholder for a missing attribute', () => {
		expect(cellValue(entity({}), 'name')).toBe('—');
	});

	it('unwraps a normalised Property', () => {
		expect(cellValue(entity({ name: { type: 'Property', value: 'Main' } }), 'name')).toBe('Main');
	});

	it('unwraps a normalised Relationship through `object`', () => {
		expect(
			cellValue(
				entity({ belongsTo: { type: 'Relationship', object: 'urn:ngsi-ld:Building:002' } }),
				'belongsTo'
			)
		).toBe('urn:ngsi-ld:Building:002');
	});

	it('prefers `object` when an attribute carries both', () => {
		expect(
			cellValue(
				entity({ ref: { type: 'Relationship', object: 'urn:ngsi-ld:B:2', value: 'x' } }),
				'ref'
			)
		).toBe('urn:ngsi-ld:B:2');
	});

	it('formats an array value', () => {
		expect(cellValue(entity({ tags: { type: 'Property', value: ['a', 'b'] } }), 'tags')).toBe(
			'a, b'
		);
	});

	it('falls back to the raw attribute when it has neither object nor value', () => {
		expect(cellValue(entity({ flag: { type: 'Property' } }), 'flag')).toBe('{"type":"Property"}');
	});

	it('renders an un-normalised scalar', () => {
		expect(cellValue(entity({ name: 'Main' }), 'name')).toBe('Main');
	});

	it('renders a placeholder for a null attribute', () => {
		expect(cellValue(entity({ name: null }), 'name')).toBe('—');
	});
});
