import { expect, test } from '@playwright/test';
import { storageStatePath, uatEnv } from './uat-env.ts';
import { createQuotation, evidence, quotationIdFrom, requiresUat } from './helpers.ts';

/**
 * Role-based security (BRD 15, NFR).
 *
 * Hiding a button is not security, so these check what happens when a URL is
 * entered directly. RLS is the real gate and these specs are what proves it
 * from outside.
 */
test.describe('Role-based access', () => {
  requiresUat();

  test.describe('as Agent A', () => {
    test.use({ storageState: storageStatePath('agentA') });

    test('UAT-SEC-01 · cannot open the admin screens', async ({ page }) => {
      for (const path of ['/admin/rates', '/admin/rates/fx', '/admin/content', '/admin/agents']) {
        await page.goto(path);
        await expect(
          page.getByText(/do not have|not allowed|Page not found|permission/i).first(),
          `agent reached ${path}`,
        ).toBeVisible();
      }
      await evidence(page, 'UAT-SEC-01');
    });

    test('UAT-SEC-02 · cannot open the audit log', async ({ page }) => {
      await page.goto('/audit');
      await expect(page.getByText(/do not have|not allowed|permission/i).first()).toBeVisible();
    });

    test('UAT-15a · sees only their own Rate My Service links', async ({ page }) => {
      const env = uatEnv();
      await page.goto('/me');
      const body = await page.locator('body').innerText();

      if (env !== null) {
        // Agent B's email must not appear anywhere on Agent A's profile page.
        expect(body).not.toContain(env.users.agentB.email);
      }
      await evidence(page, 'UAT-15a');
    });
  });

  test.describe("another agent's quotation", () => {
    let foreignQuotationId = '';

    test('UAT-SEC-03 · Agent B creates a quotation', async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStatePath('agentB') });
      const page = await context.newPage();
      await createQuotation(page, {
        cities: ['Tokyo'],
        client: 'UAT-SEC Agent B only',
        adults: 2,
      });
      foreignQuotationId = quotationIdFrom(page.url());
      await context.close();
      expect(foreignQuotationId).not.toBe('');
    });

    test('UAT-SEC-04 · Agent A cannot see it in the list or open it', async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStatePath('agentA') });
      const page = await context.newPage();

      await page.goto('/quotations');
      await expect(page.getByText('UAT-SEC Agent B only')).toHaveCount(0);

      await page.goto(`/quotations/${foreignQuotationId}`);
      await expect(page.getByText(/not found|cannot see it/i).first()).toBeVisible();
      await evidence(page, 'UAT-SEC-04');
      await context.close();
    });

    test('UAT-SEC-05 · the supervisor sees Agent A quotes read-only', async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStatePath('supervisor') });
      const page = await context.newPage();

      await page.goto('/team/quotations');
      await expect(page.getByRole('heading', { name: /Team quotations/i })).toBeVisible();

      const firstReference = page.getByRole('link', { name: /JPN-\d{4}-\d{6}/ }).first();
      if ((await firstReference.count()) > 0) {
        await firstReference.click();
        await expect(page.getByText(/read-only/i)).toBeVisible();
        // Change Rate is not offered: supervisors view, they do not adjust.
        await expect(page.getByRole('button', { name: /Add adjustment/i })).toHaveCount(0);
      }
      await evidence(page, 'UAT-SEC-05');
      await context.close();
    });
  });

  test('UAT-SEC-06 · a deactivated user cannot get in', async ({ page }) => {
    const env = uatEnv();
    test.skip(
      process.env.E2E_DEACTIVATED_EMAIL === undefined,
      'Set E2E_DEACTIVATED_EMAIL and E2E_DEACTIVATED_PASSWORD in .env.uat to run this.',
    );
    if (env === null) return;

    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(process.env.E2E_DEACTIVATED_EMAIL ?? '');
    await page.getByLabel(/Password/i).fill(process.env.E2E_DEACTIVATED_PASSWORD ?? '');
    await page.getByRole('button', { name: /Sign in/i }).click();

    await expect(page.getByText(/pending|approval|deactivated|not active/i).first()).toBeVisible();
    await evidence(page, 'UAT-SEC-06');
  });
});

test.describe('Rate My Service links are per agent (FR-014)', () => {
  requiresUat();

  test('UAT-15 · two agents get different links in their own output', async ({ browser }) => {
    const links: string[] = [];

    for (const role of ['agentA', 'agentB'] as const) {
      const context = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await context.newPage();
      await createQuotation(page, {
        cities: ['Tokyo'],
        client: `UAT-15 ${role}`,
        adults: 2,
      });
      await page.goto(`${page.url().split('?')[0] ?? ''}/output`);
      const text = await page.getByTestId('output-preview').innerText();
      links.push(text);
      await evidence(page, `UAT-15-${role}`);
      await context.close();
    }

    const [first, second] = links;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // The two outputs must not carry the same survey links.
    const urls = (text: string): string[] => text.match(/https?:\/\/\S+/g) ?? [];
    expect(urls(first ?? '')).not.toEqual(urls(second ?? ''));
  });
});
