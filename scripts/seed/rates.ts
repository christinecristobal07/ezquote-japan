import type { Workbook, Worksheet } from 'exceljs';
import { amount, at, fail, flat, sheet, text } from './workbook.ts';
import type { Addon, RateVersion, SeedService, Tier } from './types.ts';

/** Group-size tiers, per-pax. Tours use six bands, transfers eight. */
const TOUR_TIERS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 6],
  [7, 9],
  [10, 18],
  [19, 29],
  [30, 60],
];

const TRANSFER_TIERS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 4],
  [5, 6],
  [7, 9],
  [10, 16],
  [17, 28],
  [29, 45],
  [46, 60],
];

interface TourSheet {
  readonly sheetName: string;
  readonly code: string;
  readonly name: string;
  readonly city: string;
  readonly inclusion: string;
  readonly itineraryKey: string;
  /** Set when the sheet's own A1 title is known to be wrong. */
  readonly expectTitle?: string;
}

const TOUR_SHEETS: readonly TourSheet[] = [
  {
    sheetName: 'FUJI TOUR',
    code: 'mt_fuji_tour',
    name: 'Mt Fuji Tour',
    city: 'Tokyo',
    inclusion: 'with MT FUJI TOUR',
    itineraryKey: 'MT. FUJI TOUR',
    expectTitle: 'NAGOYA TOUR',
  },
  {
    sheetName: 'HAKONE TOUR',
    code: 'hakone_tour',
    name: 'Hakone Tour',
    city: 'Tokyo',
    inclusion: 'with HAKONE TOUR',
    itineraryKey: 'HAKONE TOUR',
  },
  {
    sheetName: 'TOKYO TOUR',
    code: 'tokyo_tour',
    name: 'Tokyo Tour',
    city: 'Tokyo',
    inclusion: 'with TOKYO TOUR',
    itineraryKey: 'TOKYO TOUR',
  },
  {
    sheetName: 'YOKOHAMA TOUR',
    code: 'yokohama_tour',
    name: 'Yokohama Tour',
    city: 'Tokyo',
    inclusion: 'with YOKOHAMA TOUR',
    itineraryKey: 'YOKOHAMA TOUR',
  },
  {
    sheetName: 'OSAKA TOUR',
    code: 'osaka_tour',
    name: 'Osaka Tour',
    city: 'Osaka',
    inclusion: 'with OSAKA TOUR',
    itineraryKey: 'OSAKA TOUR',
  },
  {
    sheetName: 'KYOTO-NARA TOUR',
    code: 'kyoto_nara_tour',
    name: 'Kyoto & Nara Tour',
    city: 'Osaka',
    inclusion: 'with KYOTO & NARA TOUR',
    itineraryKey: 'KYOTO & NARA TOUR',
  },
];

interface TransferBlock {
  readonly headerRow: number;
  readonly headerMatch: RegExp;
  readonly firstTierRow: number;
  readonly code: string;
  readonly name: string;
  readonly city: string | null;
  readonly inclusion: string;
  readonly consumesDay: boolean;
}

const TRANSFER_BLOCKS: readonly TransferBlock[] = [
  {
    headerRow: 1,
    headerMatch: /disney/i,
    firstTierRow: 3,
    code: 'disney_transfer',
    name: 'Disney Transfer',
    city: 'Tokyo',
    inclusion: 'with DISNEY TRANSFER',
    consumesDay: true,
  },
  {
    headerRow: 11,
    // The workbook spells it "AIPORT TRANSFER".
    headerMatch: /ai?r?port/i,
    firstTierRow: 14,
    code: 'airport_transfer',
    name: 'Airport Transfer (Kansai / Narita / Haneda)',
    city: null,
    inclusion: 'Round-trip Airport Transfers',
    consumesDay: false,
  },
  {
    headerRow: 22,
    headerMatch: /universal/i,
    firstTierRow: 24,
    code: 'usj_transfer',
    name: 'Universal Studios Japan Transfer',
    city: 'Osaka',
    inclusion: 'with UNIVERSAL STUDIOS JAPAN TRANSFER',
    consumesDay: true,
  },
];

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "valid until November 2027" -> 2027-11-30 (last day of that month). */
function parseValidity(note: string, context: string): { date: string; label: string } {
  const match = /valid\s+until\s+([A-Za-z]+)\s+(\d{4})/i.exec(note);
  if (!match) {
    return fail(`${context}: could not find a "valid until <Month> <Year>" note.`);
  }
  const monthName = (match[1] ?? '').toLowerCase();
  const year = Number.parseInt(match[2] ?? '', 10);
  const monthIndex = MONTHS.indexOf(monthName);
  if (monthIndex < 0 || !Number.isFinite(year)) {
    return fail(`${context}: unrecognised validity "${match[0]}".`);
  }
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const mm = String(monthIndex + 1).padStart(2, '0');
  return {
    date: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    label: `LAND ARRANGEMENT VALID UNTIL ${monthName.toUpperCase()} ${year}`,
  };
}

/** Reads the integers out of a tier label such as "MIN OF 2\nMAX OF 6" or "2-4 Pax". */
function labelRange(label: string): readonly number[] {
  return [...label.matchAll(/\d+/g)].map((m) => Number.parseInt(m[0], 10));
}

function readTiers(
  ws: Worksheet,
  firstRow: number,
  expected: readonly (readonly [number, number])[],
  context: string,
): Tier[] {
  return expected.map(([min, max], index) => {
    const row = firstRow + index;
    const label = flat(at(ws, `A${row}`));
    const found = labelRange(label);
    const foundMin = found[0];
    const foundMax = found.length > 1 ? found[found.length - 1] : found[0];
    if (foundMin !== min || foundMax !== max) {
      fail(
        `${context}: row ${row} should be the ${min}-${max} pax tier but reads "${label}". ` +
          `The sheet layout has changed.`,
      );
    }
    return {
      paxType: 'adult',
      minPax: min,
      maxPax: max,
      amount: amount(ws, `B${row}`, `${context} tier ${min}-${max}`),
    } satisfies Tier;
  });
}

export interface RatesResult {
  readonly services: SeedService[];
  readonly validityLabel: string;
  readonly warnings: string[];
}

export function readRates(wb: Workbook): RatesResult {
  const services: SeedService[] = [];
  const warnings: string[] = [];
  const validities = new Map<string, string>();
  let validityLabel: string | null = null;
  let sortOrder = 0;

  for (const config of TOUR_SHEETS) {
    const ws = sheet(wb, config.sheetName);
    const context = `Sheet "${config.sheetName}"`;

    const title = flat(at(ws, 'A1'));
    if (config.expectTitle !== undefined && title.toUpperCase() === config.expectTitle) {
      warnings.push(
        `${config.sheetName}: A1 reads "${title}" but these are ${config.name} rates. ` +
          `Treating the sheet as ${config.name}.`,
      );
    }

    const tiers = readTiers(ws, 3, TOUR_TIERS, context);

    // Row 16 is the optional entrance ticket add-on.
    const addons: Addon[] = [];
    const addonLabel = flat(at(ws, 'A16'));
    if (/entrance\s+ticket/i.test(addonLabel)) {
      addons.push({
        name: 'Entrance ticket',
        amount: amount(ws, 'B16', `${context} entrance ticket`),
        defaultSelected: false,
      });
    }

    // The notes block is merged across A19:B22, so A19 and A20 both resolve to it.
    const note = text(at(ws, 'A19')) || text(at(ws, 'A20'));
    const validity = parseValidity(note, context);
    validities.set(config.sheetName, validity.date);
    validityLabel ??= validity.label;

    sortOrder += 1;
    services.push({
      code: config.code,
      name: config.name,
      serviceType: 'tour',
      cityName: config.city,
      inclusionText: config.inclusion,
      itineraryKey: config.itineraryKey,
      itineraryTitle: null,
      itineraryText: null,
      consumesDay: true,
      transferDirection: null,
      sortOrder,
      rate: {
        currency: 'JPY',
        pricingBasis: 'per_pax',
        validUntil: validity.date,
        tiers,
        addons,
      } satisfies RateVersion,
    });
  }

  const distinct = new Set(validities.values());
  if (distinct.size > 1) {
    const detail = [...validities].map(([name, date]) => `${name}=${date}`).join(', ');
    fail(`Tour sheets disagree on validity: ${detail}. They must all match.`);
  }
  if (validityLabel === null) fail('No validity note was found on any tour sheet.');

  // Sapporo is quoted on request: itinerary only, no rate version.
  sortOrder += 1;
  services.push({
    code: 'sapporo_tour',
    name: 'Sapporo Tour',
    serviceType: 'tour',
    cityName: 'Sapporo',
    inclusionText: 'with SAPPORO TOUR',
    itineraryKey: 'SAPPORO TOUR',
    itineraryTitle: null,
    itineraryText: null,
    consumesDay: true,
    transferDirection: null,
    sortOrder,
    rate: null,
  });

  const transfers = sheet(wb, 'TRANSFERS');
  const validUntil = [...distinct][0] ?? null;

  for (const block of TRANSFER_BLOCKS) {
    const header = flat(at(transfers, `A${block.headerRow}`));
    if (!block.headerMatch.test(header)) {
      fail(
        `Sheet "TRANSFERS": expected ${block.name} at A${block.headerRow}, found "${header}". ` +
          `The sheet layout has changed.`,
      );
    }
    sortOrder += 1;
    services.push({
      code: block.code,
      name: block.name,
      serviceType: 'transfer',
      cityName: block.city,
      inclusionText: block.inclusion,
      itineraryKey: null,
      itineraryTitle: null,
      itineraryText: null,
      consumesDay: block.consumesDay,
      transferDirection: 'round_trip',
      sortOrder,
      rate: {
        currency: 'JPY',
        pricingBasis: 'per_pax',
        validUntil,
        tiers: readTiers(
          transfers,
          block.firstTierRow,
          TRANSFER_TIERS,
          `Sheet "TRANSFERS" (${block.name})`,
        ),
        addons: [],
      } satisfies RateVersion,
    });
  }

  warnings.push(
    'TRANSFERS rows 32-42: unnamed NARITA/HANEDA block with a broken formula. Skipped.',
  );

  return { services, validityLabel, warnings };
}
