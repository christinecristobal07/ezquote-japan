import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { can, type Permission } from '@/domain/permissions';
import { useAuth } from '@/features/auth/useAuth';

export function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-brand-900 text-2xl font-semibold">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          If you think this is a mistake, ask a manager to review your role.
        </p>
        <Link to="/" className="text-brand-600 mt-6 inline-block text-sm hover:underline">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}

export function RequireRole({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  if (profile === null || !can(profile.role, permission)) return <Forbidden />;
  return <>{children}</>;
}
