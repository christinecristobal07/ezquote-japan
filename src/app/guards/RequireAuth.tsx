import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullPageSpinner } from '@/components/ui';
import { PendingApprovalPage } from '@/features/auth/PendingApprovalPage';
import { useAuth } from '@/features/auth/useAuth';

/** UX only. Every one of these cases is also enforced by RLS in the database. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Checking your session…" />;

  if (status === 'signedOut') {
    const target = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(target)}`} replace />;
  }

  if (status === 'pendingApproval') return <PendingApprovalPage />;

  return <>{children}</>;
}
