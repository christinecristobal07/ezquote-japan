/**
 * Checks that the production bundle carries nothing it should not.
 *
 * Vite inlines every VITE_-prefixed variable into the bundle, so the guard is
 * not "is there a secret in .env" but "did a secret reach dist/".
 *
 * It looks for key MATERIAL, not for the words. src/lib/env.ts legitimately
 * contains the literals 'sb_secret_' and 'service_role' — that is the browser
 * key guard, and it ships. What must never ship is a secret key itself, so the
 * patterns below each require a plausible payload.
 *
 *   npx tsx scripts/check-build-secrets.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');

interface Rule {
  readonly what: string;
  readonly pattern: RegExp;
  /** Narrows a match further; a false result means it is not a secret. */
  readonly confirm?: (match: string) => boolean;
}

/** A JWT payload that claims the service_role is a bypass-RLS key. */
function isServiceRoleJwt(token: string): boolean {
  const payload = token.split('.')[1];
  if (payload === undefined) return false;
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const parsed: unknown = JSON.parse(json);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'role' in parsed &&
      parsed.role === 'service_role'
    );
  } catch {
    return false;
  }
}

const RULES: readonly Rule[] = [
  {
    what: 'a Supabase secret key (sb_secret_...)',
    // The bare prefix is the guard in src/lib/env.ts; a payload after it is a key.
    pattern: /sb_secret_[A-Za-z0-9_-]{8,}/g,
  },
  {
    what: 'a service_role JWT',
    pattern: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    confirm: isServiceRoleJwt,
  },
  {
    what: 'a service_role connection string',
    pattern: /postgres(?:ql)?:\/\/[^\s"']*service_role[^\s"']*/g,
  },
];

/** The only env variables allowed to reach the browser. */
const ALLOWED_ENV_KEYS = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);

const TEXT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    values[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return values;
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error('No dist/ to check. Run `npm run build` first.');
    process.exitCode = 1;
    return;
  }

  const files = walk(DIST).filter((path) =>
    TEXT_EXTENSIONS.some((extension) => path.endsWith(extension)),
  );
  if (files.length === 0) {
    console.error('dist/ holds no text files to check, which is not right.');
    process.exitCode = 1;
    return;
  }

  const env = parseEnvFile(resolve(ROOT, '.env'));
  // Any env value that is NOT one of the two allowed ones must be absent.
  const mustNotAppear = Object.entries(env).filter(
    ([key, value]) => !ALLOWED_ENV_KEYS.has(key) && value.length >= 8,
  );

  const problems: string[] = [];

  for (const path of files) {
    const content = readFileSync(path, 'utf8');
    const relative = path.slice(ROOT.length + 1);

    for (const rule of RULES) {
      for (const match of content.match(rule.pattern) ?? []) {
        if (rule.confirm !== undefined && !rule.confirm(match)) continue;
        problems.push(`${relative} contains ${rule.what}`);
        break;
      }
    }

    for (const [key, value] of mustNotAppear) {
      if (content.includes(value)) problems.push(`${relative} contains the value of ${key}`);
    }
  }

  const checked = `${String(files.length)} files in dist/`;

  if (problems.length > 0) {
    console.error(`\nBuild secret check FAILED (${checked}):`);
    for (const problem of new Set(problems)) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Build secret check passed: ${checked}.`);
  console.log('  no secret key, no service_role JWT, no service_role connection string');
  console.log(`  only ${[...ALLOWED_ENV_KEYS].join(' and ')} reach the bundle`);
  const other = Object.keys(env).filter((key) => !ALLOWED_ENV_KEYS.has(key));
  console.log(
    other.length === 0
      ? '  .env holds nothing beyond those two'
      : `  checked that these stayed out: ${other.join(', ')}`,
  );
}

main();
