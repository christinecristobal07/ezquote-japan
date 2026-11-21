export interface HotelForOutput {
  readonly name: string;
  readonly starRating: number;
  readonly isActive?: boolean;
}

export interface HotelGroup {
  readonly starRating: number;
  readonly heading: string;
  readonly names: readonly string[];
  /** The full line as it appears in the quotation. */
  readonly line: string;
}

export const SIMILAR_SUFFIX = ', or similar';

/**
 * Groups hotels by star rating, in the BRD 9.1 shape:
 *
 *   HOTEL CATEGORY: 3 STAR
 *   Hotel A / Hotel B / Hotel C, or similar
 *
 * The "or similar" matters commercially — the quotation never promises one
 * specific property, only the category.
 */
export function groupHotelsForOutput(hotels: readonly HotelForOutput[]): readonly HotelGroup[] {
  const byRating = new Map<number, string[]>();

  for (const hotel of hotels) {
    if (hotel.isActive === false) continue;
    byRating.set(hotel.starRating, [...(byRating.get(hotel.starRating) ?? []), hotel.name]);
  }

  return [...byRating.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([starRating, names]) => {
      const heading = `HOTEL CATEGORY: ${String(starRating)} STAR`;
      return {
        starRating,
        heading,
        names,
        line: `${heading}\n${names.join(' / ')}${SIMILAR_SUFFIX}`,
      };
    });
}
