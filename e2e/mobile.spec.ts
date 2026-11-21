import { expect, test } from '@playwright/test';
import { storageStatePath } from './uat-env.ts';
import { createQuotation, evidence, requiresUat } from './helpers.ts';

/**
 * The responsive requirement, at 375x812 — an iPhone-sized window, which is
 * what an agent quoting from a jeepney actually has.
 *
 * The viewport comes from the "mobile" Playwright project; this file is
 * matched by it through its name.
 */
test.describe('UAT-NFR-MOBILE · the builder and the copy flow at phone width', () => {
  requiresUat();
  test.use({ storageState: storageStatePath('agentA') });

  test('the builder is usable with no sideways scrolling', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT mobile', adults: 4 });

    await expect(page.getByText('Cities covered')).toBeVisible();
    await expect(page.getByTestId('quotation-total').first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // A pixel or two of rounding is fine; a hidden column is not.
    expect(overflow, `the page scrolls ${String(overflow)}px sideways`).toBeLessThanOrEqual(2);

    await evidence(page, 'UAT-NFR-MOBILE');
  });

  test('the quotation text can be copied from a phone', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT mobile copy', adults: 4 });
    await page.goto(`${page.url().split('?')[0] ?? ''}/output`);

    const preview = await page.getByTestId('output-preview').innerText();
    await page.getByRole('button', { name: /Copy full/i }).click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(preview);

    await evidence(page, 'UAT-NFR-MOBILE-COPY');
  });
});
