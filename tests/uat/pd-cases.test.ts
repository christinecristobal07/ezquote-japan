/**
 * BRD 14.1 scenario 17: every Product Development test case matches.
 *
 * The cases live in docs/uat/pd-test-cases.csv so Product Development can add
 * their own rows without touching code. Each row is inputs plus the rate they
 * expect, before and after rounding. A mismatch names the case and shows both
 * figures, so the conversation is about the rule, not about the test.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { snapshotJson } from '../../src/domain/__fixtures__/snapshot.ts';
import { formatPhp, fromPhp } from '../../src/domain/money.ts';
import { parseSnapshot } from '../../src/domain/snapshot.ts';
import {
  calculateQuotation,
  type QuotationAdjustment,
  type SelectedService,
} from '../../src/domain/rateEngine.ts';

const CSV_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/uat/pd-test-cases.csv',
);

/** A CSV reader that handles quoted fields; the file is hand-edited. */
function num(value: string | undefined, fallback = 0): number {
  const parsed = Number((value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') {
      cell += character;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const header = rows.shift();
  if (header === undefined) throw new Error('the PD test case file is empty');

  return rows
    .filter((entry) => entry.some((value) => value.trim() !== ''))
    .map((entry) => Object.fromEntries(header.map((name, i) => [name.trim(), entry[i] ?? ''])));
}

interface PdCase {
  readonly caseId: string;
  readonly description: string;
  readonly paxTotal: number;
  readonly serviceCodes: readonly string[];
  readonly addonNames: readonly string[];
  readonly category: string;
  readonly hotelRoomCostPhp: number;
  readonly changeRatePhp: number;
  readonly airfarePhp: number;
  readonly packageMarkup: { type: 'fixed' | 'percent'; value: number } | null;
  readonly fxJpy: number;
  readonly expectedBeforeRounding: number;
  readonly expectedFinal: number;
}

function list(value: string, separator: string): string[] {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function toCase(row: Record<string, string>): PdCase {
  const markupType = row.package_markup_type?.trim() ?? '';
  return {
    caseId: row.case_id ?? '',
    description: row.description ?? '',
    paxTotal: num(row.pax_adults) + num(row.pax_children),
    serviceCodes: list(row.services ?? '', ';'),
    addonNames: list(row.addons ?? '', ';'),
    category: (row.category ?? '').trim(),
    hotelRoomCostPhp: num(row.hotel_room_cost_php),
    changeRatePhp: num(row.change_rate_php),
    airfarePhp: num(row.airfare_php),
    packageMarkup:
      markupType === 'fixed' || markupType === 'percent'
        ? { type: markupType, value: num(row.package_markup_value) }
        : null,
    fxJpy: num(row.fx_jpy, 0.5),
    expectedBeforeRounding: num(row.expected_before_rounding),
    expectedFinal: num(row.expected_final),
  };
}

const cases = parseCsv(readFileSync(CSV_PATH, 'utf8')).map(toCase);

describe('UAT-17 · Product Development test cases', () => {
  it('the case file has rows to run', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it('every case has a unique id', () => {
    expect(new Set(cases.map((entry) => entry.caseId)).size).toBe(cases.length);
  });

  it.each(cases.map((entry) => [entry.caseId, entry.description, entry] as const))(
    '%s %s',
    (_caseId, _description, testCase) => {
      const snapshot = parseSnapshot(snapshotJson(testCase.fxJpy));

      const services: SelectedService[] = testCase.serviceCodes.map((code) => {
        const service = snapshot.services.find((entry) => entry.code === code);
        if (service === undefined) throw new Error(`no service with code "${code}"`);
        const addonIds = service.addons
          .filter((addon) => testCase.addonNames.includes(addon.name))
          .map((addon) => addon.id);
        return addonIds.length > 0
          ? { serviceId: service.serviceId, addonIds }
          : { serviceId: service.serviceId };
      });

      const adjustments: QuotationAdjustment[] = [
        {
          paxCategory: testCase.category,
          kind: 'hotel',
          amount: testCase.hotelRoomCostPhp,
          currency: 'PHP',
        },
      ];
      if (testCase.changeRatePhp !== 0) {
        adjustments.push({
          paxCategory: testCase.category,
          kind: 'other',
          amount: testCase.changeRatePhp,
          currency: 'PHP',
        });
      }

      const result = calculateQuotation({
        snapshot,
        paxTotal: testCase.paxTotal,
        services,
        outputCategories: [testCase.category],
        adjustments,
        airfarePhp: testCase.airfarePhp,
        packageMarkup: testCase.packageMarkup,
      });

      const priced = result.categories[0];
      if (priced === undefined) throw new Error('the engine priced no category');

      const blocking = result.issues.filter((issue) => issue.severity === 'error');
      expect(blocking, `${testCase.caseId} priced with errors`).toEqual([]);

      expect(formatPhp(priced.subtotal), `${testCase.caseId} before rounding`).toBe(
        formatPhp(fromPhp(testCase.expectedBeforeRounding)),
      );

      expect(formatPhp(priced.final ?? 0), `${testCase.caseId} final`).toBe(
        formatPhp(fromPhp(testCase.expectedFinal)),
      );
    },
  );
});
