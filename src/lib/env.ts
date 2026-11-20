export interface AppEnv {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
}

export class EnvConfigError extends Error {
  override readonly name = 'EnvConfigError';
}

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new EnvConfigError(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return trimmed;
}

function parseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EnvConfigError(`VITE_SUPABASE_URL is not a valid URL: "${value}"`);
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new EnvConfigError('VITE_SUPABASE_URL must use https.');
  }
  return url.origin;
}

function decodeJwtRole(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null && 'role' in parsed) {
      const role = parsed.role;
      return typeof role === 'string' ? role : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Refuses any key that would bypass Row Level Security if shipped to the browser. */
function assertBrowserSafeKey(key: string): string {
  if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
    throw new EnvConfigError(
      'VITE_SUPABASE_PUBLISHABLE_KEY is a SECRET key. Use the publishable (or legacy anon) key, and rotate the secret key if it was committed.',
    );
  }
  return key;
}

export function loadEnv(source: ImportMetaEnv): AppEnv {
  return {
    supabaseUrl: parseUrl(required('VITE_SUPABASE_URL', source.VITE_SUPABASE_URL)),
    supabasePublishableKey: assertBrowserSafeKey(
      required('VITE_SUPABASE_PUBLISHABLE_KEY', source.VITE_SUPABASE_PUBLISHABLE_KEY),
    ),
  };
}

export const env: AppEnv = loadEnv(import.meta.env);
