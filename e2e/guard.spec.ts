import { expect, test } from '@playwright/test';
import { UatEnvError, assertNotProduction, projectRef, uatConfigured } from './uat-env.ts';

/**
 * The one spec that always runs, with or without a UAT project.
 *
 * It proves the guard that keeps the rest of the suite away from live data,
 * and it means `npm run e2e` always has something to report rather than
 * exiting on "no tests found".
 */
test.describe('UAT environment guard', () => {
  test('reads the project ref out of a Supabase URL', () => {
    expect(projectRef('https://abcdefgh.supabase.co')).toBe('abcdefgh');
    expect(projectRef('https://abcdefgh.supabase.co/')).toBe('abcdefgh');
    expect(projectRef('not a url')).toBeNull();
  });

  test('refuses a UAT URL that points at the production project', () => {
    expect(() => {
      assertNotProduction('https://prodref.supabase.co', 'prodref');
    }).toThrow(UatEnvError);
  });

  test('refuses it however the URL is written', () => {
    expect(() => {
      assertNotProduction('https://PRODREF.supabase.co/', 'prodref');
    }).toThrow(/Refusing to run UAT against the production project/);
  });

  test('allows a separate project', () => {
    expect(() => {
      assertNotProduction('https://uatref.supabase.co', 'prodref');
    }).not.toThrow();
  });

  test('allows any project when there is no production env file to compare', () => {
    expect(() => {
      assertNotProduction('https://uatref.supabase.co', null);
    }).not.toThrow();
  });

  test('refuses a URL it cannot read at all', () => {
    expect(() => {
      assertNotProduction('', 'prodref');
    }).toThrow(/unusable VITE_SUPABASE_URL/);
  });

  test('reports whether a UAT project is configured', () => {
    // Informational: the browser specs skip themselves when this is false.
    expect(typeof uatConfigured()).toBe('boolean');
  });
});
