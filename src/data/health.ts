import { env } from '@/lib/env';

export type ConnectionStatus =
  { readonly state: 'ok' } | { readonly state: 'error'; readonly message: string };

/** Pings the Supabase Auth health endpoint to confirm the URL and key are valid. */
export async function checkSupabaseConnection(signal?: AbortSignal): Promise<ConnectionStatus> {
  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: env.supabasePublishableKey },
      ...(signal ? { signal } : {}),
    });
    if (response.ok) return { state: 'ok' };
    if (response.status === 401) {
      return { state: 'error', message: 'Supabase rejected the key (401). Check .env.' };
    }
    return { state: 'error', message: `Supabase responded with HTTP ${response.status}.` };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { state: 'error', message: 'Could not reach Supabase. Check VITE_SUPABASE_URL.' };
  }
}
