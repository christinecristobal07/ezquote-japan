import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/data/database.types';
import { env } from '@/lib/env';

/**
 * The single Supabase client for the app. Uses the publishable key only;
 * all data access is governed by Row Level Security (Step 3).
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type AppSupabaseClient = typeof supabase;
