import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../supabase/migrations');

const MIGRATIONS = [
  '20261120100000_core_schema.sql',
  '20261120100100_functions_triggers.sql',
  '20261120100200_rls_policies.sql',
  '20261120110000_grant_api_roles.sql',
  '20261120120000_rate_draft_functions.sql',
  '20261121100000_content_windows_and_reorder.sql',
];

/**
 * What Supabase provides around our own migrations: the auth schema, auth.uid()
 * reading the JWT claim, and the API roles. Nothing here touches the remote
 * database — this is an in-memory Postgres that lives for one run.
 */
const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists extensions;
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;
grant usage on schema auth to anon, authenticated;
`;

export type Db = PGlite;

/** Set by createTestDb so assertRejects can guard statements with a savepoint. */
let current: Db | null = null;

export async function createTestDb(): Promise<Db> {
  const db = await PGlite.create({ extensions: { btree_gist } });
  current = db;
  await db.exec(STUB);
  // No stand-in grants here on purpose. The migrations must grant the API roles
  // everything they need, or this suite would pass against privileges that the
  // real database does not have.
  for (const file of MIGRATIONS) {
    await db.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

export interface AsUserOptions {
  /** Keep the work instead of rolling it back. */
  readonly commit?: boolean;
}

/**
 * Runs a block as a signed-in user (or as anon when userId is null), with RLS
 * in force. Rolls back by default so tests stay independent.
 */
export async function asUser<T>(
  db: Db,
  userId: string | null,
  fn: () => Promise<T>,
  options: AsUserOptions = {},
): Promise<T> {
  await db.exec('begin');
  try {
    if (userId === null) {
      await db.exec('set local role anon');
    } else {
      await db.exec('set local role authenticated');
      await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    }
    const result = await fn();
    await db.exec(options.commit === true ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Tiny assertion runner
// -----------------------------------------------------------------------------
let passed = 0;
let failed = 0;

export async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ ${name}`);
    console.log(`      ${message.split('\n')[0] ?? ''}`);
  }
}

export function section(title: string): void {
  console.log(`\n${title}`);
}

export function summary(): number {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

/**
 * Asserts that a block fails, optionally matching the message.
 *
 * The failing statement is wrapped in a savepoint: without one, Postgres keeps
 * the surrounding transaction in an aborted state and every later statement
 * dies with "current transaction is aborted" instead of its own error.
 */
export async function assertRejects(fn: () => Promise<unknown>, pattern?: RegExp): Promise<void> {
  const db = current;
  let guarded = false;
  if (db) {
    try {
      await db.exec('savepoint assert_rejects');
      guarded = true;
    } catch {
      guarded = false; // not inside a transaction; statements autocommit
    }
  }

  let message: string | null = null;
  try {
    await fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  if (guarded && db) {
    await db.exec(
      message === null
        ? 'release savepoint assert_rejects'
        : 'rollback to savepoint assert_rejects',
    );
  }

  if (message === null) throw new Error('expected the statement to be rejected, but it succeeded');
  if (pattern && !pattern.test(message)) {
    throw new Error(
      `rejected with "${message.split('\n')[0] ?? ''}", expected to match ${String(pattern)}`,
    );
  }
}

export async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`query returned no rows: ${sql}`);
  return row;
}

export async function count(db: Db, sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: number }>(db, sql, params);
  return row.n;
}
