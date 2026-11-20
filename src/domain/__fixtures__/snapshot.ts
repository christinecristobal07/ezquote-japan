/**
 * A snapshot built from the real seeded values, in the exact JSON shape that
 * app.build_rate_snapshot() returns.
 */

export const MT_FUJI_ID = '11111111-1111-5111-8111-111111111111';
export const AIRPORT_ID = '22222222-2222-5222-8222-222222222222';
export const ENTRANCE_ADDON_ID = '33333333-3333-5333-8333-333333333333';

const CATEGORIES = [
  {
    code: 'quad',
    label: 'Quad sharing',
    outputLabel: 'QUAD SHARE',
    hotelDivisor: 4,
    hotelMultiplier: 1,
    hasBed: true,
  },
  {
    code: 'triple',
    label: 'Triple sharing',
    outputLabel: 'TRIPLE SHARE',
    hotelDivisor: 3,
    hotelMultiplier: 1,
    hasBed: true,
  },
  {
    code: 'twin',
    label: 'Twin sharing',
    outputLabel: 'TWIN SHARE',
    hotelDivisor: 2,
    hotelMultiplier: 1,
    hasBed: true,
  },
  {
    code: 'solo',
    label: 'Solo',
    outputLabel: 'SOLO',
    hotelDivisor: 1,
    hotelMultiplier: 2,
    hasBed: true,
  },
  {
    code: 'child',
    label: 'Child',
    outputLabel: 'CHILD',
    hotelDivisor: 1,
    hotelMultiplier: 1,
    hasBed: true,
  },
  {
    code: 'sneak_in',
    label: 'Sneak-in',
    outputLabel: 'SNEAK-IN',
    hotelDivisor: 1,
    hotelMultiplier: 1,
    hasBed: false,
  },
];

const TOUR_TIERS = [
  { paxType: 'adult', minPax: 1, maxPax: 1, amount: 50000 },
  { paxType: 'adult', minPax: 2, maxPax: 6, amount: 10850 },
  { paxType: 'adult', minPax: 7, maxPax: 9, amount: 9450 },
  { paxType: 'adult', minPax: 10, maxPax: 18, amount: 8889 },
  { paxType: 'adult', minPax: 19, maxPax: 29, amount: 6380 },
  { paxType: 'adult', minPax: 30, maxPax: 60, amount: 4167 },
];

const TRANSFER_TIERS = [
  { paxType: 'adult', minPax: 1, maxPax: 1, amount: 18000 },
  { paxType: 'adult', minPax: 2, maxPax: 4, amount: 6250 },
  { paxType: 'adult', minPax: 5, maxPax: 6, amount: 5000 },
  { paxType: 'adult', minPax: 7, maxPax: 9, amount: 3889 },
  { paxType: 'adult', minPax: 10, maxPax: 16, amount: 3750 },
  { paxType: 'adult', minPax: 17, maxPax: 28, amount: 3572 },
  { paxType: 'adult', minPax: 29, maxPax: 45, amount: 3334 },
  { paxType: 'adult', minPax: 46, maxPax: 60, amount: 2834 },
];

/** The raw jsonb a quotation carries. `jpyRate` lets tests age the snapshot. */
export function snapshotJson(jpyRate = 0.5): unknown {
  return {
    asOf: '2026-11-20T10:00:00.000Z',
    fx: { JPY: jpyRate, PHP: 1, USD: 67 },
    categoryMarkups: {
      quad: { type: 'fixed', value: 2500 },
      triple: { type: 'fixed', value: 2600 },
      twin: { type: 'fixed', value: 2700 },
      solo: { type: 'fixed', value: 3500 },
      child: { type: 'fixed', value: 2000 },
      sneak_in: { type: 'fixed', value: 0 },
    },
    serviceMarkups: {
      tour: { type: 'fixed', value: 1000 },
      transfer: { type: 'fixed', value: 2000 },
    },
    categories: CATEGORIES,
    services: [
      {
        serviceId: MT_FUJI_ID,
        code: 'mt_fuji_tour',
        serviceType: 'tour',
        name: 'Mt Fuji Tour',
        consumesDay: true,
        addsNight: false,
        transferDirection: null,
        rateVersionId: 'rv-fuji',
        currency: 'JPY',
        pricingBasis: 'per_pax',
        validUntil: '2027-11-30',
        childMinAge: null,
        childMaxAge: null,
        tiers: TOUR_TIERS,
        addons: [
          { id: ENTRANCE_ADDON_ID, name: 'Entrance ticket', amount: 3000, defaultSelected: false },
        ],
      },
      {
        serviceId: AIRPORT_ID,
        code: 'airport_transfer',
        serviceType: 'transfer',
        name: 'Airport Transfer (Kansai / Narita / Haneda)',
        consumesDay: false,
        addsNight: false,
        transferDirection: 'round_trip',
        rateVersionId: 'rv-airport',
        currency: 'JPY',
        pricingBasis: 'per_pax',
        validUntil: '2027-11-30',
        childMinAge: null,
        childMaxAge: null,
        tiers: TRANSFER_TIERS,
        addons: [],
      },
    ],
  };
}
