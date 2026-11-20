import { describe, expect, it } from 'vitest';
import { snapshotJson } from './__fixtures__/snapshot.ts';
import { parseSnapshot, SnapshotError } from './snapshot.ts';

describe('parseSnapshot', () => {
  it('accepts what the database produces', () => {
    const snapshot = parseSnapshot(snapshotJson());
    expect(snapshot.asOf).toBe('2026-11-20T10:00:00.000Z');
    expect(snapshot.services).toHaveLength(2);
    expect(snapshot.categories).toHaveLength(6);
    expect(snapshot.serviceById.size).toBe(2);
    expect(snapshot.categoryByCode.get('solo')?.hotelMultiplier).toBe(2);
  });

  it('scales FX into integers', () => {
    const snapshot = parseSnapshot(snapshotJson(0.42));
    expect(snapshot.fx.JPY).toBe(420_000);
    expect(snapshot.fx.PHP).toBe(1_000_000);
    expect(snapshot.fx.USD).toBe(67_000_000);
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['missing fx', { ...(snapshotJson() as object), fx: undefined }],
    ['missing categories', { ...(snapshotJson() as object), categories: [] }],
    ['a negative FX rate', { ...(snapshotJson() as object), fx: { JPY: -1, PHP: 1 } }],
    ['no PHP base', { ...(snapshotJson() as object), fx: { JPY: 0.5 } }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseSnapshot(input)).toThrow(SnapshotError);
  });

  it('rejects a tier whose range is inverted', () => {
    const json = snapshotJson() as { services: { tiers: unknown[] }[] };
    json.services[0]!.tiers = [{ paxType: 'adult', minPax: 9, maxPax: 2, amount: 100 }];
    expect(() => parseSnapshot(json)).toThrow(/minPax 9 > maxPax 2/);
  });

  it('names where the snapshot went wrong', () => {
    const json = snapshotJson() as { services: { currency: string }[] };
    json.services[0]!.currency = 'GBP';
    expect(() => parseSnapshot(json)).toThrow(/services\.0\.currency/);
  });
});
