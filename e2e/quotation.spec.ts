import { expect, test } from '@playwright/test';
import { asRole, createQuotation, evidence, requiresUat, settled } from './helpers.ts';

/**
 * BRD 14.1 scenarios that need the real UI: starting a quote, the itinerary
 * and inclusions reacting to services, both duration modes, Change Rate,
 * off-list hotels, airfare, the availability note and Copy Full.
 */

asRole('agentA');

test.describe('Quotation builder UAT', () => {
  requiresUat();

  test('UAT-01 · an agent starts a Japan quotation and chooses the cities', async ({ page }) => {
    const reference = await createQuotation(page, {
      cities: ['Tokyo'],
      client: 'UAT-01 Client',
      adults: 4,
    });

    expect(reference).toMatch(/^JPN-\d{4}-\d{6}$/);
    await expect(page.getByText('Cities covered')).toBeVisible();
    await expect(page.getByLabel('Tokyo', { exact: true })).toBeChecked();
    // The frozen rates are stated on the page, which is FR-015 in the small.
    await expect(page.getByText(/Rates as of/)).toBeVisible();
    await evidence(page, 'UAT-01');
  });

  test('UAT-03 · four travellers price at the 2-6 tier', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-03 Client', adults: 4 });
    await expect(page.getByText(/2–6 pax tier/)).toBeVisible();

    await page.getByLabel('Adults', { exact: true }).fill('7');
    await settled(page);
    await expect(page.getByText(/7–9 pax tier/)).toBeVisible();
    await evidence(page, 'UAT-03');
  });

  test('UAT-07 · an existing quotation keeps its rates when regenerated', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-07 Client', adults: 4 });
    const frozen = await page.getByText(/Rates as of/).innerText();

    await page.getByRole('button', { name: /Compare with current rates/i }).click();
    // Either outcome is a pass: what matters is that the panel reports on the
    // frozen rates rather than adopting new ones.
    await expect(
      page.getByText(/Nothing has changed|Rates have changed since this quotation/),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Rates as of/)).toHaveText(frozen);
    await evidence(page, 'UAT-07');
  });

  test('UAT-08 · adding a tour updates the itinerary and the inclusions', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-08 Client', adults: 4 });

    const tour = page.getByRole('checkbox', { name: /Tour/i }).first();
    await tour.check();
    await settled(page);

    await expect(page.getByText(/Day 2/)).toBeVisible();

    await page.goto(`${page.url().split('?')[0] ?? ''}/output`);
    await expect(page.getByText(/INCLUSIONS/i)).toBeVisible();
    await evidence(page, 'UAT-08');
  });

  test('UAT-09 · removing a tour drops its rate and its itinerary entry', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-09 Client', adults: 4 });

    const tour = page.getByRole('checkbox', { name: /Tour/i }).first();
    const name = (await tour.getAttribute('aria-label')) ?? (await tour.innerText());

    await tour.check();
    await settled(page);
    const withTour = await page.getByTestId('quotation-total').first().innerText();

    await tour.uncheck();
    await settled(page);
    const withoutTour = await page.getByTestId('quotation-total').first().innerText();

    expect(withoutTour).not.toBe(withTour);
    await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
    await evidence(page, 'UAT-09');
  });

  test('UAT-10 · both duration modes work', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-10 Client', adults: 4 });

    // Derived is the default: adding a day-consuming service lengthens the trip.
    await expect(page.getByText(/3D2N|4D3N/)).toBeVisible();

    await page.getByLabel(/Duration/i).selectOption('agent_selected');
    await settled(page);
    await page.getByLabel(/Days/i).selectOption('5');
    await settled(page);
    await expect(page.getByText(/5D4N/)).toBeVisible();
    await evidence(page, 'UAT-10');
  });

  test('UAT-11 · a Change Rate entry moves the totals and is logged', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-11 Client', adults: 4 });

    const before = await page.getByTestId('quotation-total').first().innerText();

    await page.getByRole('button', { name: /Add adjustment/i }).click();
    await page.getByLabel(/^Amount\*/).fill('1500');
    await page.getByLabel(/^Reason\*/).fill('UAT surcharge');
    await page
      .getByRole('button', { name: /Add|Save/i })
      .last()
      .click();

    await expect(page.getByText('UAT surcharge')).toBeVisible();
    const after = await page.getByTestId('quotation-total').first().innerText();
    expect(after).not.toBe(before);
    await evidence(page, 'UAT-11');
  });

  test('UAT-12 · a hotel that is not on the reference list is costed', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-12 Client', adults: 4 });

    await page.getByLabel(/Add other hotel/i).fill('Hotel Not On The List');
    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page.getByText('Hotel Not On The List')).toBeVisible();

    const before = await page.getByTestId('quotation-total').first().innerText();
    await page.getByRole('button', { name: /Add hotel cost|Enter hotel cost/i }).click();
    await page.getByLabel(/^Amount\*/).fill('20000');
    await page.getByLabel(/^Reason\*/).fill('UAT off-list hotel');
    await page
      .getByRole('button', { name: /Add|Save/i })
      .last()
      .click();

    const after = await page.getByTestId('quotation-total').first().innerText();
    expect(after).not.toBe(before);
    await evidence(page, 'UAT-12');
  });

  test('UAT-13 · manual airfare is added', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-13 Client', adults: 4 });

    const before = await page.getByTestId('quotation-total').first().innerText();
    await page.getByLabel(/Airfare/i).fill('25000');
    await settled(page);
    const after = await page.getByTestId('quotation-total').first().innerText();

    expect(after).not.toBe(before);
    await evidence(page, 'UAT-13');
  });

  test('UAT-14 · an unconfirmed booking carries the availability note', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-14 Client', adults: 4 });

    await expect(page.getByText(/subjected to AVAILABILITY and REVISION/i)).toBeVisible();

    await page.goto(`${page.url().split('?')[0] ?? ''}/output`);
    await expect(page.getByText(/AVAILABILITY and REVISION/i)).toBeVisible();
    await evidence(page, 'UAT-14');

    // Confirming it removes the note, which is the other half of the rule.
    await page.goBack();
    await page.getByLabel(/Booking status/i).selectOption('confirmed');
    await settled(page);
    await expect(page.getByText(/subjected to AVAILABILITY and REVISION/i)).toHaveCount(0);
  });

  test('UAT-16 · Copy Full puts the exact preview text on the clipboard', async ({ page }) => {
    await createQuotation(page, { cities: ['Tokyo'], client: 'UAT-16 Client', adults: 4 });
    await page.goto(`${page.url().split('?')[0] ?? ''}/output`);

    const preview = await page.getByTestId('output-preview').innerText();
    await page.getByRole('button', { name: /Copy full/i }).click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    expect(clipboard).toBe(preview);
    // Spacing, line breaks and emojis survive the copy.
    expect(clipboard).toContain('\n\n');
    expect(/\p{Extended_Pictographic}/u.test(clipboard)).toBe(true);
    await evidence(page, 'UAT-16');
  });
});
