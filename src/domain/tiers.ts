import type { SnapshotService, SnapshotTier } from './snapshot.ts';

export type PaxType = 'adult' | 'child';

/**
 * Picks the group-size tier for a service.
 *
 * The band is chosen by the TOTAL number of travellers in the quotation,
 * children included — not by how many people sit in the category being priced.
 * A child uses a 'child' tier when the service has one covering that size, and
 * otherwise falls back to the adult tier.
 */
export function findTier(
  service: SnapshotService,
  paxTotal: number,
  paxType: PaxType,
): SnapshotTier | null {
  const covering = (type: PaxType): SnapshotTier | undefined =>
    service.tiers.find((t) => t.paxType === type && paxTotal >= t.minPax && paxTotal <= t.maxPax);

  if (paxType === 'child') {
    return covering('child') ?? covering('adult') ?? null;
  }
  return covering('adult') ?? null;
}
