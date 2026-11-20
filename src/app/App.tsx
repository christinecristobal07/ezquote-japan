import { SupabaseStatusBadge } from '@/features/system/SupabaseStatusBadge';

export function App() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-brand-600 text-sm font-medium tracking-wide uppercase">
          Gladex Travel &amp; Tours
        </p>
        <h1 className="text-brand-900 mt-1 text-2xl font-semibold">EZQUOTE Japan</h1>
        <SupabaseStatusBadge />
      </div>
    </main>
  );
}
