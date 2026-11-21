import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/**
 * The UAT environment, and the guard that keeps these tests away from live
 * data.
 *
 * End-to-end tests sign in, create quotations and deactivate users. Run once
 * against production they would put rubbish in front of real clients, so the
 * suite refuses to start unless it is pointed somewhere else.
 */

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const UAT_ENV_PATH = resolve(ROOT, '.env.uat');
const PROD_ENV_PATH = resolve(ROOT, '.env');

export type UatRole = 'superAdmin' | 'productDevelopment' | 'supervisor' | 'agentA' | 'agentB';

export const UAT_ROLES: readonly UatRole[] = [
  'superAdmin',
  'productDevelopment',
  'supervisor',
  'agentA',
  'agentB',
];

const ROLE_ENV: Readonly<Record<UatRole, { email: string; password: string }>> = {
  superAdmin: { email: 'E2E_SUPER_ADMIN_EMAIL', password: 'E2E_SUPER_ADMIN_PASSWORD' },
  productDevelopment: { email: 'E2E_PRODUCT_DEV_EMAIL', password: 'E2E_PRODUCT_DEV_PASSWORD' },
  supervisor: { email: 'E2E_SUPERVISOR_EMAIL', password: 'E2E_SUPERVISOR_PASSWORD' },
  agentA: { email: 'E2E_AGENT_A_EMAIL', password: 'E2E_AGENT_A_PASSWORD' },
  agentB: { email: 'E2E_AGENT_B_EMAIL', password: 'E2E_AGENT_B_PASSWORD' },
};

export interface UatCredentials {
  readonly email: string;
  readonly password: string;
}

export interface UatEnv {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly users: Readonly<Record<UatRole, UatCredentials>>;
}

/**
 * The Supabase project ref — the subdomain of a project URL. Comparing refs
 * rather than whole strings catches a trailing slash or a custom domain
 * pointing at the same project.
 */
export function projectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const [first] = host.split('.');
    return first ?? null;
  } catch {
    return null;
  }
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const parsed: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    parsed[key] = value.replace(/^["']|["']$/g, '');
  }
  return parsed;
}

/** The production project ref, so the guard knows what to refuse. */
export function productionRef(): string | null {
  const url = readEnvFile(PROD_ENV_PATH).VITE_SUPABASE_URL;
  return url === undefined ? null : projectRef(url);
}

export class UatEnvError extends Error {
  override readonly name = 'UatEnvError';
}

/**
 * Refuses a UAT URL that points at the production project. Exported on its own
 * so it can be tested without a .env.uat present.
 */
export function assertNotProduction(uatUrl: string, prodRef: string | null): void {
  const uatRef = projectRef(uatUrl);
  if (uatRef === null) {
    throw new UatEnvError(`.env.uat has an unusable VITE_SUPABASE_URL: "${uatUrl}"`);
  }
  if (prodRef !== null && uatRef === prodRef) {
    throw new UatEnvError(
      `Refusing to run UAT against the production project (${prodRef}). ` +
        'Point .env.uat at a separate Supabase project.',
    );
  }
}

let cached: UatEnv | null | undefined;

/** The UAT environment, or null when .env.uat is absent or incomplete. */
export function uatEnv(): UatEnv | null {
  if (cached !== undefined) return cached;

  if (!existsSync(UAT_ENV_PATH)) {
    cached = null;
    return cached;
  }

  loadDotenv({ path: UAT_ENV_PATH, override: true, quiet: true });
  const values = readEnvFile(UAT_ENV_PATH);

  const supabaseUrl = values.VITE_SUPABASE_URL ?? '';
  const publishableKey = values.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (supabaseUrl === '' || publishableKey === '') {
    throw new UatEnvError(
      '.env.uat is missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  // The guard runs before anything can open a browser.
  assertNotProduction(supabaseUrl, productionRef());

  if (publishableKey.startsWith('sb_secret_')) {
    throw new UatEnvError('.env.uat holds a SECRET key. Use the publishable key.');
  }

  const users = {} as Record<UatRole, UatCredentials>;
  const missing: string[] = [];
  for (const role of UAT_ROLES) {
    const names = ROLE_ENV[role];
    const email = values[names.email] ?? '';
    const password = values[names.password] ?? '';
    if (email === '' || password === '') missing.push(`${names.email}/${names.password}`);
    users[role] = { email, password };
  }
  if (missing.length > 0) {
    throw new UatEnvError(`.env.uat is missing test users: ${missing.join(', ')}`);
  }

  cached = { supabaseUrl, publishableKey, users };
  return cached;
}

export function uatConfigured(): boolean {
  return existsSync(UAT_ENV_PATH);
}

export const SKIP_REASON =
  'No .env.uat: create a separate UAT Supabase project and its test users, then rerun.';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174';

export const EVIDENCE_DIR = resolve(ROOT, 'docs/uat/evidence');

export function storageStatePath(role: UatRole): string {
  return resolve(ROOT, 'e2e/.auth', `${role}.json`);
}
