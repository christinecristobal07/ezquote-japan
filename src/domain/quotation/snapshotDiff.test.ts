import { describe, expect, it } from 'vitest';
import { diffSnapshots } from './snapshotDiff.ts';
import { parseSnapshot } from '../snapshot.ts';
import { AIRPORT_ID, MT_FUJI_ID, snapshotJson } from '../__fixtures__/snapshot.ts';

/** The fixture shares its tier arrays between calls, so edits work on a copy. */
function rawSnapshot(jpyRate?: number): Record<string, unknown> {
  return structuredClone(snapshotJson(jpyRate)) as Record<string, unknown>;
}

interface RawTier {
  paxType: string;
  minPax: number;
  maxPax: number;
  amount: number;
}
interface RawService {
  serviceId: string;
  name: string;
  tiers: RawTier[];
}

describe('diffSnapshots', () => {
  const base = parseSnapshot(rawSnapshot());

  it('finds nothing when the snapshots match', () => {
    const diff = diffSnapshots(base, parseSnapshot(rawSnapshot()));
    expect(diff.hasChanges).toBe(false);
    expect(diff).toMatchObject({
      fx: [],
      categoryMarkups: [],
      serviceMarkups: [],
      tiers: [],
      servicesAdded: [],
      servicesRemoved: [],
    });
  });

  it('reports an FX move with both rates unscaled', () => {
    const diff = diffSnapshots(base, parseSnapshot(rawSnapshot(0.42)));
    expect(diff.hasChanges).toBe(true);
    expect(diff.fx).toEqual([{ currency: 'JPY', oldRate: 0.5, newRate: 0.42 }]);
  });

  it('reports a tier amount change against the right service', () => {
    const json = rawSnapshot();
    const services = json.services as RawService[];
    const tier = services[0]?.tiers.find((entry) => entry.minPax === 2);
    expect(tier).toBeDefined();
    if (tier) tier.amount = 11_000;

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.tiers).toEqual([
      {
        serviceId: MT_FUJI_ID,
        serviceName: 'Mt Fuji Tour',
        paxType: 'adult',
        minPax: 2,
        maxPax: 6,
        oldAmount: 10_850,
        newAmount: 11_000,
      },
    ]);
  });

  it('sorts several tier changes by group size', () => {
    const json = rawSnapshot();
    const services = json.services as RawService[];
    for (const tier of services[0]?.tiers ?? []) tier.amount += 100;

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.tiers.map((change) => change.minPax)).toEqual([1, 2, 7, 10, 19, 30]);
  });

  it('reports a tier that has been dropped from a service', () => {
    const json = rawSnapshot();
    const services = json.services as RawService[];
    const first = services[0];
    if (first) first.tiers = first.tiers.filter((tier) => tier.minPax !== 1);

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.tiers).toEqual([
      {
        serviceId: MT_FUJI_ID,
        serviceName: 'Mt Fuji Tour',
        paxType: 'adult',
        minPax: 1,
        maxPax: 1,
        oldAmount: 50_000,
        newAmount: null,
      },
    ]);
  });

  it('reports a tier band that has been added', () => {
    const json = rawSnapshot();
    const services = json.services as RawService[];
    // A child band where there was none before: a key the old snapshot lacks.
    services[0]?.tiers.push({ paxType: 'child', minPax: 2, maxPax: 6, amount: 7_500 });

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.tiers).toEqual([
      {
        serviceId: MT_FUJI_ID,
        serviceName: 'Mt Fuji Tour',
        paxType: 'child',
        minPax: 2,
        maxPax: 6,
        oldAmount: null,
        newAmount: 7_500,
      },
    ]);
  });

  it('reports an exchange rate that is no longer quoted', () => {
    const json = rawSnapshot();
    const fx = json.fx as Record<string, number>;
    delete fx.USD;

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.fx).toEqual([{ currency: 'USD', oldRate: 67, newRate: null }]);
  });

  it('reports an exchange rate that has appeared', () => {
    const json = rawSnapshot();
    const fx = json.fx as Record<string, number>;
    delete fx.USD;

    const diff = diffSnapshots(parseSnapshot(json), base);
    expect(diff.fx).toEqual([{ currency: 'USD', oldRate: null, newRate: 67 }]);
  });

  it('reports a markup that has been introduced', () => {
    const json = rawSnapshot();
    (json.categoryMarkups as Record<string, unknown>).infant = { type: 'fixed', value: 500 };

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.categoryMarkups).toEqual([
      { key: 'infant', oldMarkup: null, newMarkup: { type: 'fixed', value: 500 } },
    ]);
  });

  it('reports a service that has dropped out', () => {
    const json = rawSnapshot();
    json.services = (json.services as RawService[]).slice(0, 1);

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.servicesRemoved).toEqual([
      { serviceId: AIRPORT_ID, serviceName: 'Airport Transfer (Kansai / Narita / Haneda)' },
    ]);
    expect(diff.servicesAdded).toEqual([]);
    // A service that is gone contributes no tier noise.
    expect(diff.tiers).toEqual([]);
  });

  it('reports a service that has appeared', () => {
    const json = rawSnapshot();
    json.services = (json.services as RawService[]).slice(0, 1);
    const diff = diffSnapshots(parseSnapshot(json), base);
    expect(diff.servicesAdded).toEqual([
      { serviceId: AIRPORT_ID, serviceName: 'Airport Transfer (Kansai / Narita / Haneda)' },
    ]);
    expect(diff.servicesRemoved).toEqual([]);
  });

  it('reports a category markup change', () => {
    const json = rawSnapshot();
    (json.categoryMarkups as Record<string, unknown>).quad = { type: 'fixed', value: 3000 };

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.categoryMarkups).toEqual([
      {
        key: 'quad',
        oldMarkup: { type: 'fixed', value: 2500 },
        newMarkup: { type: 'fixed', value: 3000 },
      },
    ]);
  });

  it('reports a service markup switching from fixed to percent', () => {
    const json = rawSnapshot();
    (json.serviceMarkups as Record<string, unknown>).tour = { type: 'percent', value: 10 };

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.serviceMarkups).toEqual([
      {
        key: 'tour',
        oldMarkup: { type: 'fixed', value: 1000 },
        newMarkup: { type: 'percent', value: 10 },
      },
    ]);
  });

  it('reports a markup that has been removed entirely', () => {
    const json = rawSnapshot();
    const markups = json.categoryMarkups as Record<string, unknown>;
    delete markups.sneak_in;

    const diff = diffSnapshots(base, parseSnapshot(json));
    expect(diff.categoryMarkups).toEqual([
      { key: 'sneak_in', oldMarkup: { type: 'fixed', value: 0 }, newMarkup: null },
    ]);
  });
});
