import { useEffect, useState } from 'react';
import { checkSupabaseConnection, type ConnectionStatus } from '@/data/health';

export type SupabaseStatus = ConnectionStatus | { readonly state: 'checking' };

export function useSupabaseStatus(): SupabaseStatus {
  const [status, setStatus] = useState<SupabaseStatus>({ state: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    checkSupabaseConnection(controller.signal)
      .then(setStatus)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStatus({ state: 'error', message: 'Unexpected error while checking Supabase.' });
        }
      });
    return () => {
      controller.abort();
    };
  }, []);

  return status;
}
