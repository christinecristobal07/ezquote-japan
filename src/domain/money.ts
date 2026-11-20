/**
 * All money is integer centavos. There is no floating-point arithmetic on
 * money anywhere in the engine: amounts coming out of the snapshot are decimal
 * numbers, and they are converted to integers at the boundary.
 */

/** Centavos. 1 PHP = 100 centavos. */
export type Centavos = number;

/** An FX rate scaled by 1e6, matching the database's numeric(12,6). */
export type ScaledRate = number;

export const FX_SCALE = 1_000_000;

export type CurrencyCode = 'JPY' | 'USD' | 'PHP';

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

/** Rounds half-up, correctly for negatives (-0.5 -> -1, mirroring +0.5 -> +1). */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Parses a decimal amount (PHP, JPY, …) into integer minor units. */
export function toMinorUnits(amount: number | string, what = 'amount'): number {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) throw new MoneyError(`${what} is not a finite number: ${amount}`);
  const minor = roundHalfUp(value * 100);
  if (!Number.isSafeInteger(minor)) throw new MoneyError(`${what} is out of range: ${amount}`);
  return minor;
}

/** PHP pesos (a decimal) to centavos. */
export function fromPhp(php: number | string): Centavos {
  return toMinorUnits(php, 'PHP amount');
}

/** Parses an FX rate into a 1e6-scaled integer. */
export function toScaledRate(rate: number | string, currency: string): ScaledRate {
  const value = typeof rate === 'string' ? Number.parseFloat(rate) : rate;
  if (!Number.isFinite(value) || value <= 0) {
    throw new MoneyError(`FX rate for ${currency} must be a positive number, got ${rate}`);
  }
  const scaled = roundHalfUp(value * FX_SCALE);
  if (!Number.isSafeInteger(scaled)) throw new MoneyError(`FX rate for ${currency} is too large`);
  return scaled;
}

export type FxTable = Readonly<Record<string, ScaledRate>>;

/**
 * Converts an amount in `currency` to PHP centavos, rounding half-up to the
 * centavo exactly once. The amount is given in the currency's own major units
 * (yen, dollars, pesos) as it appears in the snapshot.
 */
export function toPhp(amount: number | string, currency: string, fx: FxTable): Centavos {
  const rate = fx[currency];
  if (rate === undefined) throw new MoneyError(`No FX rate for ${currency}`);
  const minor = toMinorUnits(amount, `${currency} amount`);
  // minor is in the foreign currency's minor units; rate is PHP per 1 major unit.
  return roundHalfUp((minor * rate) / FX_SCALE);
}

export function add(...values: readonly Centavos[]): Centavos {
  return values.reduce((sum, value) => sum + value, 0);
}

/** Percentage of a base, rounded half-up to the centavo. `percent` is e.g. 10 for 10%. */
export function percentOf(base: Centavos, percent: number): Centavos {
  if (!Number.isFinite(percent)) throw new MoneyError(`Percent is not finite: ${percent}`);
  return roundHalfUp((base * percent) / 100);
}

/** Divides then multiplies in one step so only one rounding happens. */
export function scaleBy(value: Centavos, divisor: number, multiplier: number): Centavos {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new MoneyError(`Divisor must be a positive integer, got ${divisor}`);
  }
  if (!Number.isInteger(multiplier) || multiplier <= 0) {
    throw new MoneyError(`Multiplier must be a positive integer, got ${multiplier}`);
  }
  return roundHalfUp((value * multiplier) / divisor);
}

/** "PHP 13,999" for whole pesos, "PHP 13,999.50" when there are centavos. */
export function formatPhp(centavos: Centavos): string {
  const negative = centavos < 0;
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = pesos.toLocaleString('en-US');
  const body = cents === 0 ? grouped : `${grouped}.${String(cents).padStart(2, '0')}`;
  return `${negative ? '-' : ''}PHP ${body}`;
}
