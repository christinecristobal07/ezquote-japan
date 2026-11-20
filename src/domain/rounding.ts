import type { Centavos } from './money.ts';

/**
 * Rounds a price UP to the next whole peso ending in 99.
 *
 * Any fraction of a peso first pushes up to the next whole peso, then the
 * result climbs to the smallest whole peso ending in 99 that is not lower.
 * A value already at a whole peso ending in 99 is left alone.
 *
 *   13,957.00 -> 13,999    13,050.00 -> 13,099
 *   13,999.00 -> 13,999    13,999.01 -> 14,099
 *          100 ->    199           99 ->     99
 */
export function roundUpTo99(centavos: Centavos): Centavos {
  const pesos = Math.ceil(centavos / 100);
  const remainder = ((pesos % 100) + 100) % 100;
  const bump = (99 - remainder + 100) % 100;
  return (pesos + bump) * 100;
}
