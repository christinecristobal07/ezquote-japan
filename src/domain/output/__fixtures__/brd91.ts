import { parseSnapshot, type RateSnapshot } from '../../snapshot.ts';
import { AIRPORT_ID, MT_FUJI_ID, snapshotJson } from '../../__fixtures__/snapshot.ts';
import { buildItinerary } from '../../quotation/itinerary.ts';
import { toEngineInput } from '../../quotation/toEngineInput.ts';
import type { QuotationModelInput, OutputContentItem } from '../quotationOutput.ts';

export const SNAPSHOT: RateSnapshot = parseSnapshot(snapshotJson());

/** The five 3-star Osaka properties from the seeded workbook. */
export const THREE_STAR_HOTELS = [
  { name: 'Comfort Hotel Osaka Shinsaibashi', starRating: 3 },
  { name: 'Holiday Inn Osaka Namba', starRating: 3 },
  { name: 'Hotel Gracery Osaka Namba', starRating: 3 },
  { name: 'Sotetsu Fresa Inn Osaka Namba', starRating: 3 },
  { name: 'Crystal Hotel Namba', starRating: 3 },
];

export const TODAY = '2026-11-21';

let nextId = 0;
function item(
  contentType: OutputContentItem['contentType'],
  body: string,
  overrides: Partial<OutputContentItem> = {},
): OutputContentItem {
  nextId += 1;
  return {
    id: `c${String(nextId)}`,
    contentType,
    body,
    isActive: true,
    startsOn: null,
    endsOn: null,
    sortOrder: nextId,
    conditionServiceId: null,
    ...overrides,
  };
}

export function brdContent(): OutputContentItem[] {
  nextId = 0;
  return [
    item('inclusion', '{{duration}} Hotel Accommodation'),
    item('inclusion', 'Daily hotel breakfast (except budget inn)'),
    item('exclusion', 'Compulsory tipping (pay on spot)'),
    item('exclusion', 'Surcharge for Non-PH / foreign passport holders'),
    item('exclusion', 'Tour tickets and meals'),
    item('exclusion', 'Travel Insurance (Mandatory)'),
    item('exclusion', 'Other items not mentioned or specified'),
    item('exclusion', 'Hotel security deposit'),
    item(
      'note',
      'Tour ticket costs are not included and are subject to quotation. Please check with the team for confirmation.',
    ),
    item('requirement', 'Valid visa, for applicable passport holders'),
    item('requirement', 'E-Travel Registration (departing and returning to PH)'),
    item('remark', 'Rates subject to availability and revision.'),
    item('remark', 'Hotel choices subject to availability.'),
    item('remark', 'Booking confirmation is subject to supplier approval.'),
    item(
      'availability_reminder',
      'Rooms & Rates are subjected to AVAILABILITY and REVISION at point of confirmation or prior',
    ),
    item('booking_disclaimer', 'Nothing booked yet. Pls book early to enjoy this promo rate!'),
    item('personal_transactions', 'PERSONAL TRANSACTIONS NOT ALLOWED'),
  ];
}

const MT_FUJI_ITINERARY =
  '\u{1F3E8}Hotel Pickup 7:00am\n\u{1F5FB}Chureito Pagoda\n\u{1F5FB}Oishi Park\n⛩️Oshino Hakkai';

/** A 3D2N quote for 4 travellers: Mt Fuji on day 2 plus the airport transfer. */
export function brdModelInput(overrides: Partial<QuotationModelInput> = {}): QuotationModelInput {
  const adjustments = [
    { paxCategory: 'quad', kind: 'hotel', amount: 20_000, currency: 'PHP' as const },
    { paxCategory: 'twin', kind: 'hotel', amount: 12_000, currency: 'PHP' as const },
    { paxCategory: 'solo', kind: 'hotel', amount: 6_000, currency: 'PHP' as const },
  ];

  const engineInput = toEngineInput(
    SNAPSHOT,
    {
      paxAdults: 4,
      paxChildren: 0,
      airfarePhp: 0,
      packageMarkupType: null,
      packageMarkupValue: null,
      outputCategories: ['quad', 'twin', 'solo'],
    },
    [
      { serviceId: MT_FUJI_ID, sortOrder: 1 },
      { serviceId: AIRPORT_ID, sortOrder: 2 },
    ],
    [],
    adjustments,
  );

  const itinerary = buildItinerary({
    durationDays: 3,
    services: [
      {
        serviceId: MT_FUJI_ID,
        name: 'Mt Fuji Tour',
        consumesDay: true,
        addsNight: false,
        dayNumber: 2,
        itineraryTitle: 'Explore Mt Fuji tours',
        itineraryText: MT_FUJI_ITINERARY,
      },
      {
        serviceId: AIRPORT_ID,
        name: 'Airport Transfer',
        consumesDay: false,
        addsNight: false,
        dayNumber: null,
        itineraryTitle: null,
        itineraryText: null,
      },
    ],
    arrivalText: 'Welcome to Japan!',
    departureText: 'Safe travels back home!',
    freeDayText: 'Free time own leisure',
  });

  return {
    snapshot: SNAPSHOT,
    engineInput,
    agentName: 'Aira',
    agentBadUrl: 'https://bit.ly/AIRA-BAD',
    agentGreatUrl: 'https://bit.ly/AIRA-OKAY',
    packageTitle: '3D2N JPN LAND ARRANGEMENT PACKAGE',
    validityLabel: 'LAND ARRANGEMENT VALID UNTIL NOVEMBER 2027',
    seasonLabel: null,
    durationLabel: '3D2N',
    hotelCategory: 3,
    selectedHotels: [],
    categoryHotels: THREE_STAR_HOTELS,
    services: [
      {
        serviceId: AIRPORT_ID,
        name: 'Airport Transfer',
        consumesDay: false,
        inclusionText: 'Round-trip Airport Transfers',
        dayNumber: null,
        selectedAddonNames: [],
      },
      {
        serviceId: MT_FUJI_ID,
        name: 'Mt Fuji Tour',
        consumesDay: true,
        inclusionText: 'with MT FUJI TOUR',
        dayNumber: 2,
        selectedAddonNames: [],
      },
    ],
    content: brdContent(),
    itinerary: itinerary.days,
    bookingStatus: 'not_booked',
    today: TODAY,
    ...overrides,
  };
}
