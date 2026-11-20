import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/data/database.types';

type RequiredEnvVar = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY';

function requireEnv(name: RequiredEnvVar): string {
  const value: unknown = import.meta.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill in your project values.`);
  }
  return value;
}

/**
 * Browser Supabase client, typed against the generated schema.
 * Regenerate the types with `npm run db:types` after every migration.
 */
export const supabase = createClient<Database>(
  requireEnv('VITE_SUPABASE_URL'),
  requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
);
