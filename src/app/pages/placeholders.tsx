import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth/useAuth';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  product_development: 'Product Development',
  admin: 'Admin',
  sales_supervisor: 'Sales Supervisor',
  sales_agent: 'Sales Agent',
};

function Shell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-brand-900 text-2xl font-semibold">{title}</h1>
      <div className="mt-4 text-slate-600">{children}</div>
      <Link to="/" className="text-brand-600 mt-8 inline-block text-sm hover:underline">
        Back to the dashboard
      </Link>
    </main>
  );
}

/** Replaced by the real dashboard and layout in the next step. */
export function HomePage() {
  const { profile, signOut } = useAuth();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="text-brand-600 text-sm font-medium tracking-wide uppercase">
        Gladex Travel &amp; Tours
      </p>
      <h1 className="text-brand-900 mt-1 text-2xl font-semibold">EZQUOTE Japan</h1>
      <p className="mt-4 text-slate-700">
        Signed in as {profile?.fullName ?? 'Unknown'} ·{' '}
        {profile === null ? 'no role' : (ROLE_LABELS[profile.role] ?? profile.role)}
      </p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Sign out
      </button>
    </main>
  );
}

export function QuotationsPage() {
  return <Shell title="Quotations">Your quotations will appear here.</Shell>;
}

export function RatesAdminPage() {
  return <Shell title="Rates">Rate versions, tiers and add-ons.</Shell>;
}

export function ContentAdminPage() {
  return <Shell title="Content">Inclusions, exclusions, notes and remarks.</Shell>;
}

export function AgentsAdminPage() {
  return <Shell title="Agents">Agent profiles, roles and survey links.</Shell>;
}

export function AuditPage() {
  return <Shell title="Audit log">Every important change, with who made it.</Shell>;
}

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-brand-900 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">The page you were looking for does not exist.</p>
        <Link to="/" className="text-brand-600 mt-6 inline-block text-sm hover:underline">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
