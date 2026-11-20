import type { FixedConfig, SeedContentItem } from './types.ts';

/**
 * Fixed configuration from the BRD. None of this comes from the workbook, and
 * where the two disagree the BRD wins.
 */

const CONTENT: readonly (readonly [string, readonly string[]])[] = [
  ['inclusion', ['{{duration}} Hotel Accommodation', 'Daily hotel breakfast (except budget inn)']],
  [
    'exclusion',
    [
      'Compulsory tipping (pay on spot)',
      'Surcharge for Non-PH / foreign passport holders',
      'Tour tickets and meals',
      'Travel Insurance (Mandatory)',
      'Other items not mentioned or specified',
      'Hotel security deposit',
    ],
  ],
  [
    'note',
    [
      'Tour ticket costs are not included and are subject to quotation. Please check with the team for confirmation.',
    ],
  ],
  [
    'requirement',
    [
      'Valid visa, for applicable passport holders',
      'E-Travel Registration (departing and returning to PH)',
    ],
  ],
  [
    'remark',
    [
      'Rates subject to availability and revision.',
      'Hotel choices subject to availability.',
      'Booking confirmation is subject to supplier approval.',
    ],
  ],
  [
    'availability_reminder',
    ['Rooms & Rates are subjected to AVAILABILITY and REVISION at point of confirmation or prior'],
  ],
  ['booking_disclaimer', ['Nothing booked yet. Pls book early to enjoy this promo rate!']],
  ['personal_transactions', ['PERSONAL TRANSACTIONS NOT ALLOWED']],
];

function buildContentItems(): SeedContentItem[] {
  const items: SeedContentItem[] = [];
  for (const [contentType, bodies] of CONTENT) {
    bodies.forEach((body, index) => {
      items.push({ contentType, body, sortOrder: index + 1 });
    });
  }
  return items;
}

export const FIXED: FixedConfig = {
  // Operator rates are in JPY; USD is kept for USD-denominated charges.
  fxRates: [
    { currency: 'JPY', phpPerUnit: 0.5 },
    { currency: 'USD', phpPerUnit: 67 },
  ],
  categoryMarkups: [
    { paxCategory: 'quad', value: 2500 },
    { paxCategory: 'triple', value: 2600 },
    { paxCategory: 'twin', value: 2700 },
    { paxCategory: 'solo', value: 3500 },
    { paxCategory: 'child', value: 2000 },
    { paxCategory: 'sneak_in', value: 0 },
  ],
  serviceMarkups: [
    { serviceType: 'tour', value: 1000 },
    { serviceType: 'transfer', value: 2000 },
  ],
  contentItems: buildContentItems(),
};

export const DEFAULT_SERVICE_CODES = ['airport_transfer'];

export const CITIES = ['Tokyo', 'Osaka', 'Sapporo'];
