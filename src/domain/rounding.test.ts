import { describe, expect, it } from 'vitest';
import { fromPhp } from './money.ts';
import { roundUpTo99 } from './rounding.ts';

describe('roundUpTo99', () => {
  it('matches the worked examples from the BRD', () => {
    expect(roundUpTo99(fromPhp(13_957))).toBe(fromPhp(13_999));
    expect(roundUpTo99(fromPhp(13_050))).toBe(fromPhp(13_099));
    expect(roundUpTo99(fromPhp(13_999))).toBe(fromPhp(13_999));
    expect(roundUpTo99(fromPhp(13_999.01))).toBe(fromPhp(14_099));
    expect(roundUpTo99(fromPhp(100))).toBe(fromPhp(199));
    expect(roundUpTo99(fromPhp(99))).toBe(fromPhp(99));
  });

  it('pushes any fraction of a peso up first', () => {
    expect(roundUpTo99(fromPhp(98.01))).toBe(fromPhp(99));
    expect(roundUpTo99(fromPhp(99.01))).toBe(fromPhp(199));
  });

  it('always lands on a whole peso ending in 99 and never goes down', () => {
    for (let pesos = 0; pesos <= 2_000; pesos += 1) {
      const input = fromPhp(pesos);
      const result = roundUpTo99(input);
      expect(result % 100).toBe(0); // whole pesos
      expect((result / 100) % 100).toBe(99); // ends in 99
      expect(result).toBeGreaterThanOrEqual(input);
      expect(result - input).toBeLessThan(fromPhp(100));
    }
  });
});
