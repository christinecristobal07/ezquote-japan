import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { SKIP_REASON, UAT_ROLES, storageStatePath, uatConfigured, uatEnv } from './uat-env.ts';

/**
 * Signs each test user in once and saves the session, so every spec starts
 * already authenticated as the role it is about.
 *
 * The users are created by hand in the UAT project beforehand: creating them
 * here would need a service-role key, and no key that bypasses RLS belongs in
 * a test run.
 */

setup.describe.configure({ mode: 'serial' });

for (const role of UAT_ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    setup.skip(!uatConfigured(), SKIP_REASON);

    const env = uatEnv();
    if (env === null) return;
    const credentials = env.users[role];

    await page.goto('/login');
    await page.getByLabel(/Email/i).fill(credentials.email);
    await page.getByLabel(/Password/i).fill(credentials.password);
    await page.getByRole('button', { name: /Sign in/i }).click();

    // Any signed-in landing page will do; what matters is that login left.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    const path = storageStatePath(role);
    mkdirSync(dirname(path), { recursive: true });
    await page.context().storageState({ path });
  });
}
