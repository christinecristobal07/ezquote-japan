/**
 * Which tours, transfers and hotels belong to the cities a quotation covers.
 *
 * FR-001: a Japan package is sold by the cities it covers, and that decides
 * what is even relevant to offer. Two rules carry the weight:
 *
 * - A service with no city — an airport transfer serves Kansai, Narita and
 *   Haneda alike — is always relevant, so it is never filtered out.
 * - Nothing is ever removed from a quotation automatically. If an agent narrows
 *   the cities after selecting an Osaka tour, that tour is flagged and left
 *   alone: deleting priced work behind their back is worse than a warning.
 */

export interface CityScoped {
  readonly id: string;
  /** null means "not tied to a city", so it is in scope everywhere. */
  readonly cityId: string | null;
}

/**
 * True when an item may be offered for this selection. An empty selection means
 * no cities have been chosen yet, so the whole catalogue stays visible rather
 * than the agent facing an empty screen.
 */
export function inCityScope(cityId: string | null, selectedCityIds: readonly string[]): boolean {
  if (cityId === null) return true;
  if (selectedCityIds.length === 0) return true;
  return selectedCityIds.includes(cityId);
}

/** The items worth offering for this selection. */
export function filterToCities<T extends CityScoped>(
  items: readonly T[],
  selectedCityIds: readonly string[],
): readonly T[] {
  return items.filter((item) => inCityScope(item.cityId, selectedCityIds));
}

/**
 * Already-chosen items that fall outside the cities now selected. These are
 * what the builder flags, never what it removes.
 */
export function outOfCityScope<T extends CityScoped>(
  chosen: readonly T[],
  selectedCityIds: readonly string[],
): readonly T[] {
  if (selectedCityIds.length === 0) return [];
  return chosen.filter((item) => !inCityScope(item.cityId, selectedCityIds));
}

export interface NamedCity {
  readonly id: string;
  readonly name: string;
}

/** "Tokyo, Osaka" in the order the cities are listed, for headers and warnings. */
export function cityNames(
  selectedCityIds: readonly string[],
  cities: readonly NamedCity[],
): readonly string[] {
  return cities.filter((city) => selectedCityIds.includes(city.id)).map((city) => city.name);
}

export const MIN_CITIES = 1;

/** FR-001 requires at least one city before a quotation means anything. */
export function citySelectionError(selectedCityIds: readonly string[]): string | null {
  return selectedCityIds.length < MIN_CITIES ? 'Choose at least one city.' : null;
}
