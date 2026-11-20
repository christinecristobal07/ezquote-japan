import { z } from 'zod';
import { toScaledRate, type FxTable } from './money.ts';

/**
 * Shape of quotations.snapshot, produced by app.build_rate_snapshot(). The
 * database is the only writer, but the browser still validates: a malformed
 * snapshot must fail here with a clear error, never halfway through pricing.
 */

export class SnapshotError extends Error {
  override readonly name = 'SnapshotError';
}

const markupSchema = z.object({
  type: z.enum(['fixed', 'percent']),
  value: z.number(),
});

const tierSchema = z.object({
  paxType: z.enum(['adult', 'child']),
  minPax: z.number().int().min(1).max(60),
  maxPax: z.number().int().min(1).max(60),
  amount: z.number().nonnegative(),
});

const addonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  defaultSelected: z.boolean().optional().default(false),
});

const categorySchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  outputLabel: z.string().min(1),
  hotelDivisor: z.number().int().positive(),
  hotelMultiplier: z.number().int().positive(),
  hasBed: z.boolean(),
});

const serviceSchema = z.object({
  serviceId: z.string().min(1),
  code: z.string().min(1),
  serviceType: z.enum(['tour', 'transfer']),
  name: z.string().min(1),
  consumesDay: z.boolean(),
  addsNight: z.boolean(),
  transferDirection: z.enum(['one_way', 'round_trip']).nullable(),
  rateVersionId: z.string().min(1),
  currency: z.enum(['JPY', 'USD', 'PHP']),
  pricingBasis: z.enum(['per_pax', 'private_total']),
  validUntil: z.string().nullable().optional(),
  childMinAge: z.number().int().nullable().optional(),
  childMaxAge: z.number().int().nullable().optional(),
  tiers: z.array(tierSchema),
  addons: z.array(addonSchema),
});

const snapshotSchema = z.object({
  asOf: z.string().min(1),
  fx: z.record(z.string(), z.number().positive()),
  categoryMarkups: z.record(z.string(), markupSchema),
  serviceMarkups: z.record(z.string(), markupSchema),
  categories: z.array(categorySchema).min(1),
  services: z.array(serviceSchema),
});

export type Markup = z.infer<typeof markupSchema>;
export type SnapshotTier = z.infer<typeof tierSchema>;
export type SnapshotAddon = z.infer<typeof addonSchema>;
export type SnapshotCategory = z.infer<typeof categorySchema>;
export type SnapshotService = z.infer<typeof serviceSchema>;

export interface RateSnapshot {
  readonly asOf: string;
  /** FX rates scaled by 1e6, keyed by currency. Always contains PHP = 1. */
  readonly fx: FxTable;
  readonly categoryMarkups: Readonly<Record<string, Markup>>;
  readonly serviceMarkups: Readonly<Record<string, Markup>>;
  readonly categories: readonly SnapshotCategory[];
  readonly services: readonly SnapshotService[];
  /** Services by id, for O(1) lookup during pricing. */
  readonly serviceById: ReadonlyMap<string, SnapshotService>;
  readonly categoryByCode: ReadonlyMap<string, SnapshotCategory>;
}

export function parseSnapshot(json: unknown): RateSnapshot {
  const result = snapshotSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first && first.path.length > 0 ? first.path.join('.') : '(root)';
    throw new SnapshotError(
      `Snapshot is not valid at ${where}: ${first?.message ?? 'unknown error'}`,
    );
  }
  const data = result.data;

  for (const tier of data.services.flatMap((s) => s.tiers)) {
    if (tier.minPax > tier.maxPax) {
      throw new SnapshotError(
        `Snapshot has a tier with minPax ${tier.minPax} > maxPax ${tier.maxPax}`,
      );
    }
  }

  const fx: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(data.fx)) {
    fx[currency] = toScaledRate(rate, currency);
  }
  if (fx.PHP === undefined) {
    throw new SnapshotError('Snapshot is missing the PHP base rate');
  }

  return {
    asOf: data.asOf,
    fx,
    categoryMarkups: data.categoryMarkups,
    serviceMarkups: data.serviceMarkups,
    categories: data.categories,
    services: data.services,
    serviceById: new Map(data.services.map((s) => [s.serviceId, s])),
    categoryByCode: new Map(data.categories.map((c) => [c.code, c])),
  };
}
