import { describe, expect, it } from 'vitest';
import { MT_FUJI_ID, snapshotJson } from './__fixtures__/snapshot.ts';
import { parseSnapshot, type SnapshotService } from './snapshot.ts';
import { findTier } from './tiers.ts';

const snapshot = parseSnapshot(snapshotJson());
const fuji = snapshot.serviceById.get(MT_FUJI_ID)!;

describe('findTier', () => {
  it('picks the band each boundary falls in', () => {
    const cases: readonly [number, number][] = [
      [1, 50_000],
      [2, 10_850],
      [6, 10_850],
      [7, 9_450],
      [9, 9_450],
      [10, 8_889],
      [18, 8_889],
      [19, 6_380],
      [29, 6_380],
      [30, 4_167],
      [60, 4_167],
    ];
    for (const [pax, amount] of cases) {
      expect(findTier(fuji, pax, 'adult')?.amount, `${pax} pax`).toBe(amount);
    }
  });

  it('returns null outside the published bands', () => {
    expect(findTier(fuji, 0, 'adult')).toBeNull();
    expect(findTier(fuji, 61, 'adult')).toBeNull();
  });

  it('falls back to the adult tier when the service has no child rate', () => {
    expect(findTier(fuji, 4, 'child')?.amount).toBe(10_850);
    expect(findTier(fuji, 4, 'child')?.paxType).toBe('adult');
  });

  it('prefers a child tier when one covers the group size', () => {
    const withChild: SnapshotService = {
      ...fuji,
      tiers: [...fuji.tiers, { paxType: 'child', minPax: 2, maxPax: 6, amount: 5_000 }],
    };
    const tier = findTier(withChild, 4, 'child');
    expect(tier?.paxType).toBe('child');
    expect(tier?.amount).toBe(5_000);

    // Outside the child band it still falls back to adult.
    expect(findTier(withChild, 10, 'child')?.paxType).toBe('adult');
  });
});
