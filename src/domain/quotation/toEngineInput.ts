import type { QuotationAdjustment, QuotationInput, SelectedService } from '../rateEngine.ts';
import type { RateSnapshot } from '../snapshot.ts';
import type { Markup } from '../snapshot.ts';

export interface QuotationRow {
  readonly paxAdults: number;
  readonly paxChildren: number;
  readonly airfarePhp: number;
  readonly packageMarkupType: 'fixed' | 'percent' | null;
  readonly packageMarkupValue: number | null;
  readonly outputCategories: readonly string[];
}

export interface SelectedServiceRow {
  readonly serviceId: string;
  readonly sortOrder: number;
}

export interface SelectedAddonRow {
  readonly serviceId: string;
  readonly addonId: string;
}

/**
 * The one place a stored quotation becomes rate-engine input.
 *
 * Everything priced comes from the snapshot the database froze at insert time;
 * these rows only say which of those services the agent picked.
 */
export function toEngineInput(
  snapshot: RateSnapshot,
  quotation: QuotationRow,
  services: readonly SelectedServiceRow[],
  addons: readonly SelectedAddonRow[],
  adjustments: readonly QuotationAdjustment[] = [],
): QuotationInput {
  const addonsByService = new Map<string, string[]>();
  for (const addon of addons) {
    addonsByService.set(addon.serviceId, [
      ...(addonsByService.get(addon.serviceId) ?? []),
      addon.addonId,
    ]);
  }

  const selected: SelectedService[] = [...services]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((service) => {
      const ids = addonsByService.get(service.serviceId);
      return ids === undefined
        ? { serviceId: service.serviceId }
        : { serviceId: service.serviceId, addonIds: ids };
    });

  const packageMarkup: Markup | null =
    quotation.packageMarkupType === null || quotation.packageMarkupValue === null
      ? null
      : { type: quotation.packageMarkupType, value: quotation.packageMarkupValue };

  return {
    snapshot,
    paxTotal: quotation.paxAdults + quotation.paxChildren,
    services: selected,
    adjustments,
    airfarePhp: quotation.airfarePhp,
    packageMarkup,
    outputCategories: quotation.outputCategories,
  };
}

/** The band label for the current group size, e.g. "2–6 pax". */
export function tierLabel(
  snapshot: RateSnapshot,
  serviceId: string,
  paxTotal: number,
): string | null {
  const service = snapshot.serviceById.get(serviceId);
  if (service === undefined) return null;
  const tier = service.tiers.find(
    (band) => band.paxType === 'adult' && paxTotal >= band.minPax && paxTotal <= band.maxPax,
  );
  if (tier === undefined) return null;
  return tier.minPax === tier.maxPax
    ? `${String(tier.minPax)} pax`
    : `${String(tier.minPax)}–${String(tier.maxPax)} pax`;
}
