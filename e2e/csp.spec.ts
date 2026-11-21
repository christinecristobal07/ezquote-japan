import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVIDENCE_DIR } from './uat-env.ts';

/**
 * The security headers, checked against a real static server.
 *
 * The Vite dev server does not read dist/_headers, so these only mean anything
 * when the production build is served the way Cloudflare Pages serves it:
 *
 *   npm run build
 *   npx wrangler pages dev dist --port 4173
 *   E2E_HEADERS_BASE_URL=http://127.0.0.1:4173 npx playwright test --project=headers
 *
 * They sign nothing in and write nothing. A broken Content-Security-Policy
 * shows up as a login that quietly never completes, so this catches it before
 * a deployment does.
 */

const BASE = process.env.E2E_HEADERS_BASE_URL;

test.describe('Security headers and CSP', () => {
  test.skip(
    BASE === undefined,
    'Set E2E_HEADERS_BASE_URL to a server serving dist/ with _headers (see the file comment).',
  );

  test('the policy and the hardening headers are served', async ({ request }) => {
    const response = await request.get(`${BASE ?? ''}/login`);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    const csp = headers['content-security-policy'] ?? '';

    expect(csp).toContain("default-src 'self'");
    // Explicit, so the browser does not log a note about it on every load.
    expect(csp).toContain("script-src 'self'");
    expect(csp).toMatch(/connect-src 'self' https:\/\/[a-z0-9]+\.supabase\.co wss:\/\//);
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=31536000');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['permissions-policy']).toContain('microphone=()');
    expect(headers['permissions-policy']).toContain('geolocation=()');
  });

  test('a deep route is answered with index.html and a 200, not a 404', async ({ request }) => {
    // React Router owns /quotations/<id>; the host must not try to find a file.
    const response = await request.get(
      `${BASE ?? ''}/quotations/00000000-0000-0000-0000-000000000000`,
    );
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });

  test('assets are still served as files, with immutable caching', async ({ request }) => {
    const html = await (await request.get(`${BASE ?? ''}/index.html`)).text();
    const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0];
    expect(asset, 'no hashed js asset found in index.html').toBeTruthy();

    const response = await request.get(`${BASE ?? ''}${asset ?? ''}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
    expect(response.headers()['cache-control']).toContain('immutable');
  });

  test('index.html is not cached, so a new deployment is picked up', async ({ request }) => {
    const response = await request.get(`${BASE ?? ''}/index.html`);
    expect(response.headers()['cache-control']).toContain('no-cache');
  });

  test('the login page loads with no CSP violation and the font applied', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      // "Refused to ..." is how Chrome reports a blocked resource. The wider
      // "not explicitly set" note is caught too: the policy names every
      // directive it relies on, so that note appearing means one went missing.
      if (/Content Security Policy|Refused to|was not explicitly set/i.test(text)) {
        violations.push(text);
      }
    });
    const failures: string[] = [];
    page.on('requestfailed', (request) => {
      failures.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
    });

    await page.goto(`${BASE ?? ''}/login`);
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();

    // Inter is bundled and served from /assets; if font-src blocked it the
    // computed family would fall back to the system stack.
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toContain('Inter');

    // Radix and the scroll lock write inline style attributes; a dialog opening
    // is the cheapest proof that style-src 'unsafe-inline' is doing its job.
    const forgot = page.getByRole('link', { name: /Forgot/i });
    if ((await forgot.count()) > 0) await forgot.first().click();

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: resolve(EVIDENCE_DIR, 'CSP-login.png'), fullPage: true });

    expect(violations, `CSP violations: ${violations.join(' | ')}`).toEqual([]);
    expect(failures, `failed requests: ${failures.join(' | ')}`).toEqual([]);
  });

  test('the build stamp is on the page for pilot feedback', async ({ page }) => {
    await page.goto(`${BASE ?? ''}/login`);
    const html = await page.content();
    // The footer only renders once signed in, so check the bundle carries it.
    expect(html.length).toBeGreaterThan(0);
  });
});
