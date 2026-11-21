import { describe, expect, it } from 'vitest';
import {
  autoAssignDays,
  buildItinerary,
  defaultPackageTitle,
  tourDayRange,
  type ItineraryService,
} from './itinerary.ts';
import { tierLabel, toEngineInput } from './toEngineInput.ts';
import { parseSnapshot } from '../snapshot.ts';
import { AIRPORT_ID, MT_FUJI_ID, snapshotJson } from '../__fixtures__/snapshot.ts';

const TEXTS = {
  arrivalText: 'Welcome to Japan!',
  departureText: 'Safe travels back home!',
  freeDayText: 'Free time own leisure',
};

function service(overrides: Partial<ItineraryService> = {}): ItineraryService {
  return {
    serviceId: 'svc-1',
    name: 'Mt Fuji Tour',
    consumesDay: true,
    addsNight: false,
    dayNumber: null,
    itineraryTitle: 'MT. FUJI TOUR',
    itineraryText: '🗻Chureito Pagoda\n🗻Oishi Park',
    ...overrides,
  };
}

const AIRPORT = service({
  serviceId: 'airport',
  name: 'Airport Transfer',
  consumesDay: false,
  itineraryTitle: null,
  itineraryText: null,
});

// -----------------------------------------------------------------------------
// An unassigned tour must still reach the itinerary. It used to be dropped, so
// an agent who ticked tours and never touched the day dropdowns sent a client a
// quotation with no tours on its itinerary at all.
// -----------------------------------------------------------------------------
describe('unassigned tours', () => {
  it('places a tour the agent never assigned onto a free day', () => {
    const result = buildItinerary({
      durationDays: 3,
      services: [service({ serviceId: 'fuji', dayNumber: null })],
      ...TEXTS,
    });
    const day2 = result.days.find((day) => day.dayNumber === 2);
    expect(day2?.serviceIds).toEqual(['fuji']);
    expect(day2?.kind).toBe('service');
    expect(result.issues).toEqual([]);
  });

  it('spreads several unassigned tours across the free days in order', () => {
    const result = buildItinerary({
      durationDays: 5,
      services: [
        service({ serviceId: 'fuji', dayNumber: null }),
        service({ serviceId: 'hakone', dayNumber: null }),
        service({ serviceId: 'tokyo', dayNumber: null }),
      ],
      ...TEXTS,
    });
    expect(result.days.map((day) => day.serviceIds)).toEqual([
      [],
      ['fuji'],
      ['hakone'],
      ['tokyo'],
      [],
    ]);
    expect(result.issues).toEqual([]);
  });

  it('does not take a day an assigned tour already owns', () => {
    const result = buildItinerary({
      durationDays: 4,
      services: [
        service({ serviceId: 'fuji', dayNumber: null }),
        service({ serviceId: 'hakone', dayNumber: 2 }),
      ],
      ...TEXTS,
    });
    expect(result.days.find((day) => day.dayNumber === 2)?.serviceIds).toEqual(['hakone']);
    expect(result.days.find((day) => day.dayNumber === 3)?.serviceIds).toEqual(['fuji']);
    expect(result.issues).toEqual([]);
  });

  it('still flags a tour that has nowhere to go', () => {
    // 3D2N has exactly one middle day, so the second tour cannot be placed.
    const result = buildItinerary({
      durationDays: 3,
      services: [
        service({ serviceId: 'fuji', dayNumber: null }),
        service({ serviceId: 'hakone', dayNumber: null }),
      ],
      ...TEXTS,
    });
    expect(result.days.find((day) => day.dayNumber === 2)?.serviceIds).toEqual(['fuji']);
    expect(result.issues).toEqual([{ code: 'UNASSIGNED_SERVICE', serviceId: 'hakone' }]);
  });

  it('leaves a transfer alone: it takes no day and rides arrival and departure', () => {
    const result = buildItinerary({
      durationDays: 3,
      services: [AIRPORT, service({ serviceId: 'fuji', dayNumber: null })],
      ...TEXTS,
    });
    expect(result.days[0]?.serviceIds).toEqual(['airport']);
    expect(result.days[2]?.serviceIds).toEqual(['airport']);
    expect(result.days[1]?.serviceIds).toEqual(['fuji']);
  });

  it('carries the tour text through, which is what the quotation prints', () => {
    const result = buildItinerary({
      durationDays: 3,
      services: [service({ serviceId: 'fuji', dayNumber: null })],
      ...TEXTS,
    });
    expect(result.days[1]?.title).toBe('MT. FUJI TOUR');
    expect(result.days[1]?.body).toContain('Chureito Pagoda');
  });
});

// -----------------------------------------------------------------------------
describe('tourDayRange', () => {
  it.each([
    [3, [2]],
    [4, [2, 3]],
    [7, [2, 3, 4, 5, 6]],
  ])('%iD has middle days %j', (days, expected) => {
    expect(tourDayRange(days)).toEqual(expected);
  });

  it('has no middle days below 3', () => {
    expect(tourDayRange(2)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
describe('buildItinerary', () => {
  it('3D2N with one tour: arrival, tour, departure', () => {
    const result = buildItinerary({
      durationDays: 3,
      services: [service({ dayNumber: 2 })],
      ...TEXTS,
    });

    expect(result.issues).toEqual([]);
    expect(result.days.map((day) => day.kind)).toEqual(['arrival', 'service', 'departure']);
    expect(result.days[1]?.title).toBe('MT. FUJI TOUR');
    expect(result.days[1]?.body).toContain('🗻Chureito Pagoda');
    expect(result.days[0]?.body).toBe('Welcome to Japan!');
    expect(result.days[2]?.body).toBe('Safe travels back home!');
  });

  it('5D4N with three tours and an airport transfer', () => {
    const result = buildItinerary({
      durationDays: 5,
      services: [
        service({ serviceId: 'a', dayNumber: 2 }),
        service({ serviceId: 'b', dayNumber: 3 }),
        service({ serviceId: 'c', dayNumber: 4 }),
        AIRPORT,
      ],
      ...TEXTS,
    });

    expect(result.issues).toEqual([]);
    expect(result.days.map((day) => day.kind)).toEqual([
      'arrival',
      'service',
      'service',
      'service',
      'departure',
    ]);
    // The transfer rides on the first and last days without owning either.
    expect(result.days[0]?.serviceIds).toEqual(['airport']);
    expect(result.days[4]?.serviceIds).toEqual(['airport']);
  });

  it('turns unclaimed middle days into free time', () => {
    const result = buildItinerary({
      durationDays: 5,
      services: [service({ dayNumber: 2 })],
      ...TEXTS,
    });
    expect(result.days.map((day) => day.kind)).toEqual([
      'arrival',
      'service',
      'free',
      'free',
      'departure',
    ]);
    expect(result.days[2]?.body).toBe('Free time own leisure');
  });

  it('reports two day-consuming services on the same day', () => {
    const result = buildItinerary({
      durationDays: 4,
      services: [
        service({ serviceId: 'a', dayNumber: 2 }),
        service({ serviceId: 'b', dayNumber: 2 }),
      ],
      ...TEXTS,
    });
    expect(result.issues).toEqual([{ code: 'DAY_CONFLICT', serviceId: 'b', dayNumber: 2 }]);
  });

  it.each([
    [1, 'the arrival day'],
    [3, 'the departure day'],
    [9, 'past the end'],
  ])('reports day %i as out of range (%s)', (dayNumber) => {
    const result = buildItinerary({
      durationDays: 3,
      services: [service({ dayNumber })],
      ...TEXTS,
    });
    expect(result.issues[0]).toMatchObject({ code: 'DAY_OUT_OF_RANGE', dayNumber });
  });

  it('places a day-consuming service with no day, rather than dropping it', () => {
    const result = buildItinerary({ durationDays: 4, services: [service()], ...TEXTS });
    expect(result.days.find((day) => day.dayNumber === 2)?.serviceIds).toEqual(['svc-1']);
    // Only a tour with nowhere left to go is still an issue; see
    // "unassigned tours" above.
    expect(result.issues).toEqual([]);
  });

  it('never lets a non-day-consuming service occupy a middle day', () => {
    const result = buildItinerary({ durationDays: 4, services: [AIRPORT], ...TEXTS });
    expect(result.days.map((day) => day.kind)).toEqual(['arrival', 'free', 'free', 'departure']);
    expect(result.issues).toEqual([]);
  });

  it('honours an explicit day for a non-day-consuming service', () => {
    const result = buildItinerary({
      durationDays: 4,
      services: [{ ...AIRPORT, dayNumber: 2 }],
      ...TEXTS,
    });
    expect(result.days[1]?.kind).toBe('free');
    expect(result.days[1]?.serviceIds).toEqual(['airport']);
  });

  it('gives an adds-night service the longer trip it earns', () => {
    // resolveDuration turns one adds-night tour into 4 days; the extra day
    // shows up here as free time rather than a second tour slot.
    const result = buildItinerary({
      durationDays: 4,
      services: [service({ addsNight: true, dayNumber: 2 })],
      ...TEXTS,
    });
    expect(result.days.map((day) => day.kind)).toEqual(['arrival', 'service', 'free', 'departure']);
  });

  it('falls back to the service name when there is no itinerary title', () => {
    const result = buildItinerary({
      durationDays: 3,
      services: [service({ dayNumber: 2, itineraryTitle: null })],
      ...TEXTS,
    });
    expect(result.days[1]?.title).toBe('Mt Fuji Tour');
  });
});

// -----------------------------------------------------------------------------
describe('autoAssignDays', () => {
  it('fills the middle days in selection order', () => {
    const assigned = autoAssignDays(
      [service({ serviceId: 'a' }), service({ serviceId: 'b' }), AIRPORT],
      4,
    );
    expect(assigned.map((s) => [s.serviceId, s.dayNumber])).toEqual([
      ['a', 2],
      ['b', 3],
      ['airport', null],
    ]);
  });

  it('keeps a manual assignment that is still valid', () => {
    const assigned = autoAssignDays(
      [service({ serviceId: 'a' }), service({ serviceId: 'b', dayNumber: 2 })],
      4,
    );
    expect(assigned.map((s) => [s.serviceId, s.dayNumber])).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });

  it('discards a manual day that no longer exists', () => {
    const assigned = autoAssignDays([service({ serviceId: 'a', dayNumber: 6 })], 4);
    expect(assigned[0]?.dayNumber).toBe(2);
  });

  it('leaves services with nowhere to go unassigned', () => {
    const assigned = autoAssignDays(
      [service({ serviceId: 'a' }), service({ serviceId: 'b' })],
      3, // only day 2 exists
    );
    expect(assigned.map((s) => s.dayNumber)).toEqual([2, null]);
  });

  it('keeps only the first claim when two services name the same day', () => {
    const assigned = autoAssignDays(
      [service({ serviceId: 'a', dayNumber: 2 }), service({ serviceId: 'b', dayNumber: 2 })],
      4,
    );
    expect(assigned.map((s) => s.dayNumber)).toEqual([2, 3]);
  });
});

// -----------------------------------------------------------------------------
describe('defaultPackageTitle', () => {
  it.each([
    ['3D2N', '3D2N JPN LAND ARRANGEMENT PACKAGE'],
    ['7D6N', '7D6N JPN LAND ARRANGEMENT PACKAGE'],
  ])('%s -> %s', (label, expected) => {
    expect(defaultPackageTitle(label)).toBe(expected);
  });
});

// -----------------------------------------------------------------------------
describe('toEngineInput', () => {
  const snapshot = parseSnapshot(snapshotJson());
  const quotation = {
    paxAdults: 3,
    paxChildren: 1,
    airfarePhp: 15_000,
    packageMarkupType: 'percent' as const,
    packageMarkupValue: 10,
    outputCategories: ['quad', 'twin'],
  };

  it('adds adults and children for the group size', () => {
    const input = toEngineInput(snapshot, quotation, [], []);
    expect(input.paxTotal).toBe(4);
  });

  it('orders services by sortOrder and attaches their add-ons', () => {
    const input = toEngineInput(
      snapshot,
      quotation,
      [
        { serviceId: AIRPORT_ID, sortOrder: 2 },
        { serviceId: MT_FUJI_ID, sortOrder: 1 },
      ],
      [{ serviceId: MT_FUJI_ID, addonId: 'addon-1' }],
    );
    expect(input.services.map((s) => s.serviceId)).toEqual([MT_FUJI_ID, AIRPORT_ID]);
    expect(input.services[0]?.addonIds).toEqual(['addon-1']);
    expect(input.services[1]?.addonIds).toBeUndefined();
  });

  it('passes the package markup through, and null when unset', () => {
    expect(toEngineInput(snapshot, quotation, [], []).packageMarkup).toEqual({
      type: 'percent',
      value: 10,
    });
    expect(
      toEngineInput(
        snapshot,
        { ...quotation, packageMarkupType: null, packageMarkupValue: null },
        [],
        [],
      ).packageMarkup,
    ).toBeNull();
  });

  it('carries airfare and the chosen output categories', () => {
    const input = toEngineInput(snapshot, quotation, [], []);
    expect(input.airfarePhp).toBe(15_000);
    expect(input.outputCategories).toEqual(['quad', 'twin']);
  });
});

describe('tierLabel', () => {
  const snapshot = parseSnapshot(snapshotJson());

  it.each([
    [1, '1 pax'],
    [4, '2–6 pax'],
    [8, '7–9 pax'],
    [30, '30–60 pax'],
  ])('%i travellers reads "%s"', (pax, expected) => {
    expect(tierLabel(snapshot, MT_FUJI_ID, pax)).toBe(expected);
  });

  it('is null outside the bands or for an unknown service', () => {
    expect(tierLabel(snapshot, MT_FUJI_ID, 61)).toBeNull();
    expect(tierLabel(snapshot, 'nope', 4)).toBeNull();
  });
});
