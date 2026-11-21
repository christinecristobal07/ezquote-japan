import type { Markup, RateSnapshot, SnapshotService, SnapshotTier } from '../snapshot.ts';
import { FX_SCALE } from '../money.ts';

export interface FxChange {
  readonly currency: string;
  readonly oldRate: number | null;
  readonly newRate: number | null;
}

export interface MarkupChange {
  readonly key: string;
  readonly oldMarkup: Markup | null;
  readonly newMarkup: Markup | null;
}

export interface TierChange {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly paxType: string;
  readonly minPax: number;
  readonly maxPax: number;
  readonly oldAmount: number | null;
  readonly newAmount: number | null;
}

export interface ServiceChange {
  readonly serviceId: string;
  readonly serviceName: string;
}

export interface SnapshotDiff {
  readonly fx: readonly FxChange[];
  readonly categoryMarkups: readonly MarkupChange[];
  readonly serviceMarkups: readonly MarkupChange[];
  readonly tiers: readonly TierChange[];
  readonly servicesAdded: readonly ServiceChange[];
  readonly servicesRemoved: readonly ServiceChange[];
  readonly hasChanges: boolean;
}

function unscale(scaled: number | undefined): number | null {
  return scaled === undefined ? null : scaled / FX_SCALE;
}

/** A markup as one comparable string, so "missing" compares cleanly too. */
function markupKey(markup: Markup | null): string {
  return markup === null ? '' : `${markup.type}:${String(markup.value)}`;
}

function tierKey(tier: SnapshotTier): string {
  return `${tier.paxType}:${String(tier.minPax)}-${String(tier.maxPax)}`;
}

function diffMarkups(
  oldSet: Readonly<Record<string, Markup>>,
  newSet: Readonly<Record<string, Markup>>,
): MarkupChange[] {
  const keys = [...new Set([...Object.keys(oldSet), ...Object.keys(newSet)])].sort();
  const changes: MarkupChange[] = [];
  for (const key of keys) {
    const before = oldSet[key] ?? null;
    const after = newSet[key] ?? null;
    if (markupKey(before) === markupKey(after)) continue;
    changes.push({ key, oldMarkup: before, newMarkup: after });
  }
  return changes;
}

function diffService(oldService: SnapshotService, newService: SnapshotService): TierChange[] {
  const oldTiers = new Map(oldService.tiers.map((tier) => [tierKey(tier), tier]));
  const newTiers = new Map(newService.tiers.map((tier) => [tierKey(tier), tier]));

  function change(tier: SnapshotTier, oldAmount: number | null, newAmount: number | null) {
    return {
      serviceId: newService.serviceId,
      serviceName: newService.name,
      paxType: tier.paxType,
      minPax: tier.minPax,
      maxPax: tier.maxPax,
      oldAmount,
      newAmount,
    };
  }

  const changes: TierChange[] = [];
  for (const [key, after] of newTiers) {
    const before = oldTiers.get(key);
    if (before?.amount === after.amount) continue;
    changes.push(change(after, before?.amount ?? null, after.amount));
  }
  // A band that has been withdrawn matters as much as one that moved.
  for (const [key, before] of oldTiers) {
    if (newTiers.has(key)) continue;
    changes.push(change(before, before.amount, null));
  }

  return changes.sort((a, b) => a.minPax - b.minPax);
}

/**
 * What moved between the snapshot frozen into a quotation and the rates in
 * force now.
 *
 * This is what the "rates have changed since this quote" panel reads, so an
 * agent can see whether requoting is worth it before doing it.
 */
export function diffSnapshots(oldSnap: RateSnapshot, current: RateSnapshot): SnapshotDiff {
  const currencies = [...new Set([...Object.keys(oldSnap.fx), ...Object.keys(current.fx)])].sort();
  const fx = currencies
    .filter((currency) => oldSnap.fx[currency] !== current.fx[currency])
    .map((currency) => ({
      currency,
      oldRate: unscale(oldSnap.fx[currency]),
      newRate: unscale(current.fx[currency]),
    }));

  const oldById = oldSnap.serviceById;
  const newById = current.serviceById;

  const servicesRemoved: ServiceChange[] = [...oldById.values()]
    .filter((service) => !newById.has(service.serviceId))
    .map((service) => ({ serviceId: service.serviceId, serviceName: service.name }));

  const servicesAdded: ServiceChange[] = [...newById.values()]
    .filter((service) => !oldById.has(service.serviceId))
    .map((service) => ({ serviceId: service.serviceId, serviceName: service.name }));

  const tiers: TierChange[] = [];
  for (const [serviceId, newService] of newById) {
    const oldService = oldById.get(serviceId);
    if (oldService === undefined) continue;
    tiers.push(...diffService(oldService, newService));
  }

  const categoryMarkups = diffMarkups(oldSnap.categoryMarkups, current.categoryMarkups);
  const serviceMarkups = diffMarkups(oldSnap.serviceMarkups, current.serviceMarkups);

  return {
    fx,
    categoryMarkups,
    serviceMarkups,
    tiers,
    servicesAdded,
    servicesRemoved,
    hasChanges:
      fx.length > 0 ||
      categoryMarkups.length > 0 ||
      serviceMarkups.length > 0 ||
      tiers.length > 0 ||
      servicesAdded.length > 0 ||
      servicesRemoved.length > 0,
  };
}
