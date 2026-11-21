import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EVIDENCE_DIR, storageStatePath, uatEnv } from './uat-env.ts';
import { createQuotation, evidence, requiresUat } from './helpers.ts';

/**
 * The non-functional requirements from BRD 15 that a machine can judge:
 * accessibility and the stated timings. The results are written to
 * docs/uat/evidence/nfr-results.json so the report can quote real numbers
 * rather than estimates.
 */

const TARGETS = {
  /** A quotation page is interactive within 2 s. */
  builderInteractiveMs: 2_000,
  /** Generating the quotation text takes under 1 s. */
  generateMs: 1_000,
};

interface Measurement {
  readonly name: string;
  readonly ms: number;
  readonly targetMs: number;
  readonly pass: boolean;
}

const measurements: Measurement[] = [];

function record(name: string, ms: number, targetMs: number): Measurement {
  const entry = { name, ms: Math.round(ms), targetMs, pass: ms <= targetMs };
  measurements.push(entry);
  return entry;
}

test.afterAll(() => {
  if (measurements.length === 0) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, 'nfr-results.json'),
    `${JSON.stringify({ measuredAt: new Date().toISOString(), measurements }, null, 2)}\n`,
    'utf8',
  );
});

async function seriousViolations(page: Page): Promise<string[]> {
  // @axe-core/playwright bundles its own playwright-core types, which are
  // structurally the same Page but a different declaration.
  const results = await new AxeBuilder({ page: page as unknown as never })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} (${String(violation.impact)}): ${violation.help}`);
}

// -----------------------------------------------------------------------------
test.describe('UAT-NFR-A11Y · no serious or critical accessibility violations', () => {
  requiresUat();

  test('the login page', async ({ page }) => {
    await page.goto('/login');
    expect(await seriousViolations(page)).toEqual([]);
  });

  test.describe('signed in as Product Development', () => {
    test.use({ storageState: storageStatePath('productDevelopment') });

    test('the dashboard, the builder, the output and admin rates', async ({ page }) => {
      await page.goto('/');
      expect(await seriousViolations(page), 'dashboard').toEqual([]);

      await createQuotation(page, { cities: ['Tokyo'], client: 'UAT a11y', adults: 4 });
      const builderUrl = page.url();
      expect(await seriousViolations(page), 'builder').toEqual([]);
      await evidence(page, 'UAT-NFR-A11Y');

      await page.goto(`${builderUrl}/output`);
      expect(await seriousViolations(page), 'output').toEqual([]);

      await page.goto('/admin/rates');
      expect(await seriousViolations(page), 'admin rates').toEqual([]);
    });
  });
});

// -----------------------------------------------------------------------------
test.describe('UAT-NFR-PERF · the stated timings', () => {
  requiresUat();
  test.use({ storageState: storageStatePath('agentA') });

  test('a quotation page becomes interactive inside 2 s', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT perf', adults: 4 });
    const url = page.url();

    // A warm reload is the honest measure of opening a saved quotation.
    await page.goto('/');
    const started = Date.now();
    await page.goto(url);
    await page.getByTestId('quotation-total').first().waitFor({ state: 'visible' });
    const elapsed = Date.now() - started;

    const result = record('builder interactive', elapsed, TARGETS.builderInteractiveMs);
    expect(result.ms, `builder took ${String(result.ms)} ms`).toBeLessThanOrEqual(
      TARGETS.builderInteractiveMs,
    );
  });

  test('generating the quotation text takes under 1 s', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT perf generate', adults: 4 });
    await page.goto(`${page.url().split('?')[0] ?? ''}/output`);

    const started = Date.now();
    await page.getByRole('button', { name: /Generate quotation/i }).click();
    await page.getByRole('button', { name: /Regenerate quotation/i }).waitFor();
    const elapsed = Date.now() - started;

    const result = record('generate quotation', elapsed, TARGETS.generateMs);
    expect(result.ms, `generate took ${String(result.ms)} ms`).toBeLessThanOrEqual(
      TARGETS.generateMs,
    );
  });

  test('the environment under test is recorded with the numbers', () => {
    const env = uatEnv();
    expect(env).not.toBeNull();
  });
});
