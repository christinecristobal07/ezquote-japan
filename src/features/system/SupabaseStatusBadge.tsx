import { useSupabaseStatus } from '@/features/system/useSupabaseStatus';

const STYLES = {
  checking: 'bg-slate-100 text-slate-700',
  ok: 'bg-emerald-50 text-emerald-700',
  error: 'bg-red-50 text-red-700',
} as const;

export function SupabaseStatusBadge() {
  const status = useSupabaseStatus();
  const label =
    status.state === 'checking'
      ? 'Checking Supabase connection…'
      : status.state === 'ok'
        ? 'Supabase connected'
        : status.message;

  return (
    <p role="status" className={`mt-4 rounded-md px-3 py-2 text-sm ${STYLES[status.state]}`}>
      {label}
    </p>
  );
}
