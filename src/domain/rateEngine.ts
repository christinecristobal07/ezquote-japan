import {
  add,
  fromPhp,
  percentOf,
  scaleBy,
  toPhp,
  type Centavos,
  type CurrencyCode,
} from './money.ts';
import { roundUpTo99 } from './rounding.ts';
import { findTier, type PaxType } from './tiers.ts';
import type { Markup, RateSnapshot, SnapshotService } from './snapshot.ts';

export const MIN_PAX = 1;
export const MAX_PAX = 60;

export type IssueCode =
  | 'SERVICE_NOT_IN_SNAPSHOT'
  | 'NO_TIER_FOR_PAX'
  | 'UNKNOWN_ADDON'
  | 'MISSING_FX'
  | 'PAX_OUT_OF_RANGE'
  | 'NON_POSITIVE_TOTAL'
  | 'MISSING_HOTEL_COST'
  | 'PRIVATE_RATE_NOT_SUPPORTED'
  | 'UNKNOWN_CATEGORY';

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly paxCategory?: string | undefined;
  readonly serviceId?: string | undefined;
  readonly addonId?: string | undefined;
}

export type BreakdownKind =
  | 'hotel'
  | 'service'
  | 'service_markup'
  | 'category_markup'
  | 'package_markup'
  | 'airfare'
  | 'adjustment'
  | 'rounding';

export interface BreakdownLine {
  readonly kind: BreakdownKind;
  readonly label: string;
  readonly amount: Centavos;
  readonly serviceId?: string | undefined;
}

export interface CategoryResult {
  readonly paxCategory: string;
  readonly outputLabel: string;
  /** null when a blocking issue prevents pricing this category. */
  readonly final: Centavos | null;
  readonly subtotal: Centavos;
  readonly breakdown: readonly BreakdownLine[];
}

export interface QuotationResult {
  readonly categories: readonly CategoryResult[];
  readonly issues: readonly Issue[];
}

export interface SelectedService {
  readonly serviceId: string;
  readonly addonIds?: readonly string[] | undefined;
}

export interface QuotationAdjustment {
  readonly paxCategory: string;
  readonly kind: string;
  /** Signed major units. Reversals are ordinary negative rows. */
  readonly amount: number;
  readonly currency: CurrencyCode;
}

export interface QuotationInput {
  readonly snapshot: RateSnapshot;
  readonly paxTotal: number;
  readonly services: readonly SelectedService[];
  readonly adjustments?: readonly QuotationAdjustment[] | undefined;
  readonly airfarePhp?: number | undefined;
  readonly packageMarkup?: Markup | null | undefined;
  readonly outputCategories: readonly string[];
}

function issueKey(issue: Issue): string {
  return [issue.code, issue.paxCategory ?? '', issue.serviceId ?? '', issue.addonId ?? ''].join(
    '|',
  );
}

function applyMarkup(markup: Markup | undefined, base: Centavos): Centavos {
  if (!markup) return 0;
  return markup.type === 'fixed' ? fromPhp(markup.value) : percentOf(base, markup.value);
}

interface PricedService {
  readonly service: SnapshotService;
  /** Tier plus selected add-ons, in PHP centavos. Part of the percent base. */
  readonly net: Centavos;
  readonly markup: Centavos;
}

/**
 * Prices a quotation for every requested output category.
 *
 * Pure and deterministic: everything it needs is in `input`, including the
 * frozen snapshot, so re-running an old quotation against its own snapshot
 * always reproduces the original numbers.
 */
export function calculateQuotation(input: QuotationInput): QuotationResult {
  const { snapshot, paxTotal } = input;
  const issues = new Map<string, Issue>();
  const addIssue = (issue: Issue): void => {
    issues.set(issueKey(issue), issue);
  };

  const paxValid = Number.isInteger(paxTotal) && paxTotal >= MIN_PAX && paxTotal <= MAX_PAX;
  if (!paxValid) addIssue({ code: 'PAX_OUT_OF_RANGE', severity: 'error' });

  const adjustments = input.adjustments ?? [];
  const airfare = input.airfarePhp === undefined ? 0 : fromPhp(input.airfarePhp);

  const categories: CategoryResult[] = [];

  for (const code of input.outputCategories) {
    const category = snapshot.categoryByCode.get(code);
    if (!category) {
      addIssue({ code: 'UNKNOWN_CATEGORY', severity: 'error', paxCategory: code });
      categories.push({
        paxCategory: code,
        outputLabel: code,
        final: null,
        subtotal: 0,
        breakdown: [],
      });
      continue;
    }

    let blocked = !paxValid;
    const lines: BreakdownLine[] = [];
    const paxType: PaxType = code === 'child' ? 'child' : 'adult';

    // -- (a) hotel ------------------------------------------------------------
    const hotelRows = adjustments.filter((a) => a.paxCategory === code && a.kind === 'hotel');
    if (hotelRows.length === 0) {
      addIssue({ code: 'MISSING_HOTEL_COST', severity: 'warning', paxCategory: code });
    }

    let roomCost: Centavos = 0;
    for (const row of hotelRows) {
      try {
        roomCost += toPhp(row.amount, row.currency, snapshot.fx);
      } catch {
        addIssue({ code: 'MISSING_FX', severity: 'error', paxCategory: code });
        blocked = true;
      }
    }
    const hotelPerPerson = scaleBy(roomCost, category.hotelDivisor, category.hotelMultiplier);
    lines.push({ kind: 'hotel', label: 'Hotel', amount: hotelPerPerson });

    // -- (b) services ---------------------------------------------------------
    const priced: PricedService[] = [];

    for (const selection of input.services) {
      const service = snapshot.serviceById.get(selection.serviceId);
      if (!service) {
        addIssue({
          code: 'SERVICE_NOT_IN_SNAPSHOT',
          severity: 'error',
          serviceId: selection.serviceId,
        });
        blocked = true;
        continue;
      }

      if (service.pricingBasis === 'private_total') {
        addIssue({
          code: 'PRIVATE_RATE_NOT_SUPPORTED',
          severity: 'error',
          serviceId: service.serviceId,
        });
        blocked = true;
        continue;
      }

      const tier = paxValid ? findTier(service, paxTotal, paxType) : null;
      if (!tier) {
        if (paxValid) {
          addIssue({
            code: 'NO_TIER_FOR_PAX',
            severity: 'error',
            serviceId: service.serviceId,
            paxCategory: code,
          });
        }
        blocked = true;
        continue;
      }

      let tierPhp: Centavos;
      try {
        tierPhp = toPhp(tier.amount, service.currency, snapshot.fx);
      } catch {
        addIssue({ code: 'MISSING_FX', severity: 'error', serviceId: service.serviceId });
        blocked = true;
        continue;
      }

      let addonsPhp: Centavos = 0;
      for (const addonId of selection.addonIds ?? []) {
        const addon = service.addons.find((a) => a.id === addonId);
        if (!addon) {
          addIssue({
            code: 'UNKNOWN_ADDON',
            severity: 'error',
            serviceId: service.serviceId,
            addonId,
          });
          blocked = true;
          continue;
        }
        try {
          addonsPhp += toPhp(addon.amount, service.currency, snapshot.fx);
        } catch {
          addIssue({ code: 'MISSING_FX', severity: 'error', serviceId: service.serviceId });
          blocked = true;
        }
      }

      // Add-ons never attract a markup; a percent service markup applies to the
      // converted tier amount only.
      const markup = applyMarkup(snapshot.serviceMarkups[service.serviceType], tierPhp);

      priced.push({ service, net: tierPhp + addonsPhp, markup });
      lines.push({
        kind: 'service',
        label: service.name,
        amount: tierPhp + addonsPhp,
        serviceId: service.serviceId,
      });
    }

    for (const entry of priced) {
      if (entry.markup === 0) continue;
      lines.push({
        kind: 'service_markup',
        label: `${entry.service.name} markup`,
        amount: entry.markup,
        serviceId: entry.service.serviceId,
      });
    }

    // -- (c) percent base -----------------------------------------------------
    const base = add(hotelPerPerson, ...priced.map((p) => p.net));

    // -- (d) category and package markups -------------------------------------
    const categoryMarkup = applyMarkup(snapshot.categoryMarkups[code], base);
    if (categoryMarkup !== 0) {
      lines.push({
        kind: 'category_markup',
        label: `${category.label} markup`,
        amount: categoryMarkup,
      });
    }

    const packageMarkup = applyMarkup(input.packageMarkup ?? undefined, base);
    if (packageMarkup !== 0) {
      lines.push({ kind: 'package_markup', label: 'Package markup', amount: packageMarkup });
    }

    // -- (e) airfare and other Change Rate entries ----------------------------
    if (airfare !== 0) lines.push({ kind: 'airfare', label: 'Airfare', amount: airfare });

    for (const row of adjustments) {
      if (row.paxCategory !== code || row.kind === 'hotel') continue;
      try {
        lines.push({
          kind: 'adjustment',
          label: `Change Rate: ${row.kind}`,
          amount: toPhp(row.amount, row.currency, snapshot.fx),
        });
      } catch {
        addIssue({ code: 'MISSING_FX', severity: 'error', paxCategory: code });
        blocked = true;
      }
    }

    // -- (f) total ------------------------------------------------------------
    const subtotal = add(...lines.map((l) => l.amount));

    if (!blocked && subtotal <= 0) {
      addIssue({ code: 'NON_POSITIVE_TOTAL', severity: 'error', paxCategory: code });
      blocked = true;
    }

    if (blocked) {
      categories.push({
        paxCategory: code,
        outputLabel: category.outputLabel,
        final: null,
        subtotal,
        breakdown: lines,
      });
      continue;
    }

    const final = roundUpTo99(subtotal);
    const rounding = final - subtotal;
    if (rounding !== 0) {
      lines.push({ kind: 'rounding', label: 'Rounding to 99', amount: rounding });
    }

    categories.push({
      paxCategory: code,
      outputLabel: category.outputLabel,
      final,
      subtotal,
      breakdown: lines,
    });
  }

  return { categories, issues: [...issues.values()] };
}
