import { describe, expect, it } from 'vitest';
import {
  add,
  formatPhp,
  fromPhp,
  MoneyError,
  percentOf,
  scaleBy,
  toMinorUnits,
  toPhp,
  toScaledRate,
} from './money.ts';

const FX = {
  JPY: toScaledRate(0.5, 'JPY'),
  PHP: toScaledRate(1, 'PHP'),
  USD: toScaledRate(67, 'USD'),
};

describe('fromPhp', () => {
  it('converts pesos to centavos', () => {
    expect(fromPhp(20_000)).toBe(2_000_000);
    expect(fromPhp(0)).toBe(0);
    expect(fromPhp('13999.99')).toBe(1_399_999);
  });

  it('rounds half-up', () => {
    // 0.125 is exact in binary, so this tests the rule and not float noise.
    expect(fromPhp(0.125)).toBe(13);
    expect(fromPhp(-0.125)).toBe(-13);
  });

  it('rejects rubbish', () => {
    expect(() => fromPhp(Number.NaN)).toThrow(MoneyError);
    expect(() => fromPhp(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => toMinorUnits(1e18)).toThrow(/out of range/);
  });
});

describe('toScaledRate', () => {
  it('scales by 1e6 to match numeric(12,6)', () => {
    expect(toScaledRate(0.5, 'JPY')).toBe(500_000);
    expect(toScaledRate('0.42', 'JPY')).toBe(420_000);
    expect(toScaledRate(67, 'USD')).toBe(67_000_000);
  });

  it('rejects non-positive or unusable rates', () => {
    expect(() => toScaledRate(0, 'JPY')).toThrow(MoneyError);
    expect(() => toScaledRate(-1, 'JPY')).toThrow(MoneyError);
    expect(() => toScaledRate('abc', 'JPY')).toThrow(MoneyError);
    expect(() => toScaledRate(1e12, 'JPY')).toThrow(/too large/);
  });
});

describe('toPhp', () => {
  it('converts JPY at the snapshot rate', () => {
    expect(toPhp(10_850, 'JPY', FX)).toBe(542_500); // PHP 5,425.00
    expect(toPhp(6_250, 'JPY', FX)).toBe(312_500); // PHP 3,125.00
    expect(toPhp(3_000, 'JPY', FX)).toBe(150_000); // entrance ticket
  });

  it('converts USD at 67', () => {
    expect(toPhp(100, 'USD', FX)).toBe(670_000); // PHP 6,700.00
  });

  it('passes PHP through', () => {
    expect(toPhp(1_234.56, 'PHP', FX)).toBe(123_456);
  });

  it('rounds half-up to the centavo, once', () => {
    const fx = { JPY: toScaledRate(0.333333, 'JPY') };
    expect(toPhp(1, 'JPY', fx)).toBe(33); // 0.333333 -> 33.3333 centavos -> 33
  });

  it('throws when the currency is missing', () => {
    expect(() => toPhp(1, 'EUR', FX)).toThrow(/No FX rate for EUR/);
  });
});

describe('add / percentOf / scaleBy', () => {
  it('adds centavos exactly', () => {
    expect(add(500_000, 542_500, 100_000, 312_500, 200_000, 250_000)).toBe(1_905_000);
    expect(add()).toBe(0);
  });

  it('takes a percentage of a base', () => {
    expect(percentOf(1_355_000, 10)).toBe(135_500);
    expect(percentOf(1_000, 0)).toBe(0);
    expect(() => percentOf(100, Number.NaN)).toThrow(MoneyError);
  });

  it('divides and multiplies with a single rounding', () => {
    expect(scaleBy(2_000_000, 4, 1)).toBe(500_000); // quad: 20,000 / 4
    expect(scaleBy(600_000, 1, 2)).toBe(1_200_000); // solo: 6,000 x 2
    expect(scaleBy(1_000_000, 3, 1)).toBe(333_333); // triple, half-up
  });

  it('rejects a bad divisor or multiplier', () => {
    expect(() => scaleBy(100, 0, 1)).toThrow(MoneyError);
    expect(() => scaleBy(100, 1.5, 1)).toThrow(MoneyError);
    expect(() => scaleBy(100, 1, 0)).toThrow(MoneyError);
    expect(() => scaleBy(100, 1, 1.5)).toThrow(MoneyError);
  });
});

describe('formatPhp', () => {
  it('groups thousands and hides empty centavos', () => {
    expect(formatPhp(1_399_900)).toBe('PHP 13,999');
    expect(formatPhp(1_909_900)).toBe('PHP 19,099');
    expect(formatPhp(0)).toBe('PHP 0');
  });

  it('shows centavos when present', () => {
    expect(formatPhp(1_399_950)).toBe('PHP 13,999.50');
    expect(formatPhp(5)).toBe('PHP 0.05');
  });

  it('handles negatives', () => {
    expect(formatPhp(-250_000)).toBe('-PHP 2,500');
  });
});
