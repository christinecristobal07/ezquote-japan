import type { Workbook } from 'exceljs';
import { at, fail, sheet, text } from './workbook.ts';
import type { SeedHotel, SeedService, SeedSetting } from './types.ts';

const OSAKA_PATTERN = /osaka|namba|shinsaibashi|tennoji/i;

/** Entries read "Hotel Name – ~5 min walk to X Station" with an en dash. */
const ENTRY_PATTERN = /^(.*?)\s*[–—-]\s*(.*)$/;

export function readHotels(wb: Workbook): SeedHotel[] {
  const ws = sheet(wb, 'JAPAN QUOTATION');
  const hotels: SeedHotel[] = [];
  let sortOrder = 0;

  for (let row = 58; row <= 60; row += 1) {
    const heading = text(at(ws, `C${row}`));
    const starMatch = /(\d)\s*STAR/i.exec(heading);
    if (!starMatch) {
      fail(
        `Sheet "JAPAN QUOTATION": C${row} should read "HOTEL CATEGORY: N STAR", found "${heading}".`,
      );
    }
    const starRating = Number.parseInt(starMatch[1] ?? '', 10);
    if (starRating < 3 || starRating > 5) {
      fail(`Sheet "JAPAN QUOTATION": C${row} has an unsupported star rating ${starRating}.`);
    }

    const entries = text(at(ws, `D${row}`))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '');

    if (entries.length === 0) {
      fail(`Sheet "JAPAN QUOTATION": D${row} has no hotels for the ${starRating} star category.`);
    }

    for (const entry of entries) {
      const match = ENTRY_PATTERN.exec(entry);
      const name = (match?.[1] ?? entry).trim();
      const walk = match?.[2]?.trim() ?? '';
      if (name === '') continue;
      sortOrder += 1;
      hotels.push({
        name,
        cityName: OSAKA_PATTERN.test(name) ? 'Osaka' : 'Tokyo',
        starRating,
        walkToStation: walk === '' ? null : walk,
        sortOrder,
      });
    }
  }

  return hotels;
}

export interface ItineraryResult {
  readonly settings: SeedSetting[];
  readonly unmatchedKeys: string[];
}

/**
 * Reads the day-by-day list (B107:C116) and attaches it to the services.
 * Arrival, Departure and the free day are app settings, not services.
 */
export function applyItineraries(wb: Workbook, services: SeedService[]): ItineraryResult {
  const ws = sheet(wb, 'JAPAN QUOTATION');
  const byKey = new Map<string, SeedService>();
  for (const service of services) {
    if (service.itineraryKey !== null) byKey.set(service.itineraryKey.toUpperCase(), service);
  }

  const settings: SeedSetting[] = [];
  const unmatchedKeys: string[] = [];
  const specialKeys: Record<string, { key: string; description: string }> = {
    ARRIVAL: { key: 'itinerary.arrival_text', description: 'Arrival day text in the output.' },
    DEPARTURE: {
      key: 'itinerary.departure_text',
      description: 'Departure day text in the output.',
    },
    'FREE TIME (NO TOUR)': {
      key: 'itinerary.free_day_text',
      description: 'Free day text in the output.',
    },
  };

  let found = 0;
  for (let row = 107; row <= 116; row += 1) {
    const label = text(at(ws, `B${row}`)).trim();
    if (label === '') continue;
    found += 1;

    const body = text(at(ws, `C${row}`));
    const key = label.toUpperCase();

    const special = specialKeys[key];
    if (special) {
      settings.push({ key: special.key, value: body.trim(), description: special.description });
      continue;
    }

    const service = byKey.get(key);
    if (!service) {
      unmatchedKeys.push(label);
      continue;
    }

    const bodyLines = body.split(/\r?\n/);
    const title = (bodyLines[0] ?? '').trim();
    // Keep interior blank lines and emoji exactly as written, trim only the edges.
    const rest = bodyLines.slice(1).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
    service.itineraryTitle = title === '' ? null : title;
    service.itineraryText = rest === '' ? null : rest;
  }

  if (found === 0) {
    fail('Sheet "JAPAN QUOTATION": no itinerary rows found in B107:B116.');
  }

  return { settings, unmatchedKeys };
}
