import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  EVIDENCE_DIR,
  SKIP_REASON,
  storageStatePath,
  uatConfigured,
  type UatRole,
} from './uat-env.ts';

/**
 * Shared scaffolding for the UAT specs: the skip guard, the signed-in context
 * for a role, and the evidence screenshots the report links to.
 */

/** Every UAT describe block starts with this. */
export function requiresUat(): void {
  test.skip(!uatConfigured(), SKIP_REASON);
}

/** Runs the whole file as one role. */
export function asRole(role: UatRole): void {
  test.use({ storageState: storageStatePath(role) });
}

/** docs/uat/evidence/UAT-xx.png, which the report links to. */
export async function evidence(page: Page, scenario: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: resolve(EVIDENCE_DIR, `${scenario}.png`),
    fullPage: true,
  });
}

export interface NewQuotation {
  readonly cities: readonly string[];
  readonly client: string;
  readonly adults: number;
  readonly children?: number;
}

/** Walks the create form and lands on the builder. Returns the reference. */
export async function createQuotation(page: Page, input: NewQuotation): Promise<string> {
  await page.goto('/quotations/new');

  for (const city of input.cities) {
    await page.getByLabel(city, { exact: true }).check();
  }
  await page.getByLabel(/Client name/i).fill(input.client);
  await page.getByLabel('Adults', { exact: true }).fill(String(input.adults));
  if (input.children !== undefined) {
    await page.getByLabel('Children', { exact: true }).fill(String(input.children));
  }
  await page.getByRole('button', { name: /Create quotation/i }).click();

  await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const reference = await page
    .getByText(/JPN-\d{4}-\d{6}/)
    .first()
    .innerText();
  return reference.trim();
}

export function quotationIdFrom(url: string): string {
  const match = /\/quotations\/([0-9a-f-]{36})/.exec(url);
  if (match?.[1] === undefined) throw new Error(`no quotation id in ${url}`);
  return match[1];
}

/** Waits for the autosave indicator to settle, so a reload sees the change. */
export async function settled(page: Page): Promise<void> {
  await expect(page.getByText(/Saving|Retry/)).toHaveCount(0, { timeout: 15_000 });
}
