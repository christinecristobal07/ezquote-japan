/**
 * Which occupancy categories make sense for the size of the party.
 *
 * Every category used to be selectable regardless of the group, so an agent
 * quoting two people could tick QUAD SHARE and send a client a rate for a room
 * those two cannot fill. The supervisor's examples are the specification:
 *
 *   2 travellers  -> twin. Quad and triple need more people.
 *   4 travellers  -> quad (one room) or twin (two rooms). Not solo: four pair
 *                    evenly, so nobody is left on their own.
 *   5 travellers  -> triple and twin, and now solo, because the fifth person
 *                    has no one to share with.
 *
 * Nothing here removes a category that is already selected. As with city scope,
 * a quotation that no longer fits its party is flagged rather than quietly
 * rewritten: the agent decides what to drop.
 */

export type OccupancyCode = 'quad' | 'triple' | 'twin' | 'solo' | 'child' | 'sneak_in';

/** How many adults share one room of this type. */
const CAPACITY: Readonly<Record<string, number>> = {
  quad: 4,
  triple: 3,
  twin: 2,
  solo: 1,
};

export interface CategoryFit {
  readonly code: string;
  readonly allowed: boolean;
  /** Why not, in words an agent can act on. Null when allowed. */
  readonly reason: string | null;
  /** Rooms needed, when the party divides evenly into this type. */
  readonly rooms: number | null;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Whether one category suits this party, and how many rooms it would take.
 *
 * `adults` and `children` are the counts on the quotation. Children and
 * sneak-ins are priced per head rather than per room, so they depend only on
 * whether anyone of that kind is travelling.
 */
export function categoryFit(code: string, adults: number, children: number): CategoryFit {
  if (code === 'child') {
    return children > 0
      ? { code, allowed: true, reason: null, rooms: null }
      : { code, allowed: false, reason: 'No children on this quotation.', rooms: null };
  }

  if (code === 'sneak_in') {
    // An extra head in a room someone else has paid for, so it needs a room to
    // sneak into and at least one other traveller.
    return adults > 0
      ? { code, allowed: true, reason: null, rooms: null }
      : { code, allowed: false, reason: 'Needs at least one adult to share with.', rooms: null };
  }

  const capacity = CAPACITY[code];
  if (capacity === undefined) {
    // An unknown category is left alone rather than silently disabled.
    return { code, allowed: true, reason: null, rooms: null };
  }

  if (code === 'solo') {
    if (adults === 0) {
      return { code, allowed: false, reason: 'No adults on this quotation.', rooms: null };
    }
    // One traveller is always solo; otherwise solo only appears when the party
    // cannot pair off and somebody is left with a room to themselves.
    if (adults === 1) return { code, allowed: true, reason: null, rooms: 1 };
    return adults % 2 === 1
      ? { code, allowed: true, reason: null, rooms: 1 }
      : {
          code,
          allowed: false,
          reason: `${plural(adults, 'traveller')} pair evenly, so nobody is on their own.`,
          rooms: null,
        };
  }

  if (adults < capacity) {
    return {
      code,
      allowed: false,
      reason: `Needs at least ${plural(capacity, 'traveller')}; this quotation has ${String(adults)}.`,
      rooms: null,
    };
  }

  return {
    code,
    allowed: true,
    reason: null,
    // Only stated when it divides cleanly: "2 rooms" for four in twins is
    // useful, "2.5 rooms" for five is not.
    rooms: adults % capacity === 0 ? adults / capacity : null,
  };
}

export function categoryFits(
  codes: readonly string[],
  adults: number,
  children: number,
): readonly CategoryFit[] {
  return codes.map((code) => categoryFit(code, adults, children));
}

/** Selected categories that no longer suit the party — flagged, never removed. */
export function unfitSelected(
  selected: readonly string[],
  adults: number,
  children: number,
): readonly CategoryFit[] {
  return selected.map((code) => categoryFit(code, adults, children)).filter((fit) => !fit.allowed);
}

/** The label beside a category: "2 rooms", or the reason it is unavailable. */
export function fitHint(fit: CategoryFit): string | null {
  if (!fit.allowed) return fit.reason;
  return fit.rooms === null ? null : plural(fit.rooms, 'room');
}
