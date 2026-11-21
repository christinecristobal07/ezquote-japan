import { describe, expect, it } from 'vitest';
import {
  cityNames,
  citySelectionError,
  filterToCities,
  inCityScope,
  outOfCityScope,
} from './cityScope.ts';

const TOKYO = 'city-tokyo';
const OSAKA = 'city-osaka';
const SAPPORO = 'city-sapporo';

const CITIES = [
  { id: TOKYO, name: 'Tokyo' },
  { id: OSAKA, name: 'Osaka' },
  { id: SAPPORO, name: 'Sapporo' },
];

const SERVICES = [
  { id: 'fuji', cityId: TOKYO },
  { id: 'usj', cityId: OSAKA },
  { id: 'airport', cityId: null },
];

describe('inCityScope', () => {
  it('keeps a service in one of the chosen cities', () => {
    expect(inCityScope(TOKYO, [TOKYO, OSAKA])).toBe(true);
  });

  it('excludes a service in a city that was not chosen', () => {
    expect(inCityScope(SAPPORO, [TOKYO, OSAKA])).toBe(false);
  });

  it('always keeps a service with no city, like an airport transfer', () => {
    expect(inCityScope(null, [TOKYO])).toBe(true);
    expect(inCityScope(null, [])).toBe(true);
  });

  it('keeps everything while no city has been chosen', () => {
    expect(inCityScope(SAPPORO, [])).toBe(true);
  });
});

describe('filterToCities', () => {
  it('narrows the catalogue to the chosen cities, airport transfer included', () => {
    expect(filterToCities(SERVICES, [TOKYO]).map((service) => service.id)).toEqual([
      'fuji',
      'airport',
    ]);
  });

  it('shows everything when nothing is chosen yet', () => {
    expect(filterToCities(SERVICES, [])).toHaveLength(3);
  });

  it('widens as cities are added', () => {
    expect(filterToCities(SERVICES, [TOKYO, OSAKA])).toHaveLength(3);
  });
});

describe('outOfCityScope', () => {
  it('flags a selected service that now falls outside the cities', () => {
    const chosen = [
      { id: 'fuji', cityId: TOKYO },
      { id: 'usj', cityId: OSAKA },
    ];
    expect(outOfCityScope(chosen, [TOKYO]).map((service) => service.id)).toEqual(['usj']);
  });

  it('never flags a service with no city', () => {
    expect(outOfCityScope([{ id: 'airport', cityId: null }], [TOKYO])).toEqual([]);
  });

  it('flags nothing while no city has been chosen', () => {
    expect(outOfCityScope(SERVICES, [])).toEqual([]);
  });

  it('removes nothing: the caller still holds every selection', () => {
    const chosen = [{ id: 'usj', cityId: OSAKA }];
    outOfCityScope(chosen, [TOKYO]);
    expect(chosen).toHaveLength(1);
  });
});

describe('cityNames', () => {
  it('names the chosen cities in the order the list holds them', () => {
    expect(cityNames([OSAKA, TOKYO], CITIES)).toEqual(['Tokyo', 'Osaka']);
  });

  it('ignores an id that is no longer a city', () => {
    expect(cityNames(['gone', TOKYO], CITIES)).toEqual(['Tokyo']);
  });

  it('returns nothing for an empty selection', () => {
    expect(cityNames([], CITIES)).toEqual([]);
  });
});

describe('citySelectionError', () => {
  it('requires at least one city', () => {
    expect(citySelectionError([])).toBe('Choose at least one city.');
  });

  it('accepts one', () => {
    expect(citySelectionError([TOKYO])).toBeNull();
  });
});
