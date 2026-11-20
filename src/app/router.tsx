import { createBrowserRouter, type RouteObject } from 'react-router';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { RequireRole } from '@/app/guards/RequireRole';
import type { Permission } from '@/domain/permissions';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SetPasswordPage } from '@/features/auth/SetPasswordPage';
import {
  AgentsAdminPage,
  AuditPage,
  ContentAdminPage,
  HomePage,
  NotFoundPage,
  QuotationsPage,
  RatesAdminPage,
} from '@/app/pages/placeholders';

function Protected({ children, permission }: { children: ReactNode; permission?: Permission }) {
  return (
    <RequireAuth>
      {permission === undefined ? (
        children
      ) : (
        <RequireRole permission={permission}>{children}</RequireRole>
      )}
    </RequireAuth>
  );
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/auth/set-password', element: <SetPasswordPage /> },
  {
    path: '/',
    element: (
      <Protected>
        <HomePage />
      </Protected>
    ),
  },
  {
    path: '/quotations',
    element: (
      <Protected permission="quotation.viewOwn">
        <QuotationsPage />
      </Protected>
    ),
  },
  {
    path: '/admin/rates',
    element: (
      <Protected permission="rates.manage">
        <RatesAdminPage />
      </Protected>
    ),
  },
  {
    path: '/admin/content',
    element: (
      <Protected permission="content.manage">
        <ContentAdminPage />
      </Protected>
    ),
  },
  {
    path: '/admin/agents',
    element: (
      <Protected permission="agents.manage">
        <AgentsAdminPage />
      </Protected>
    ),
  },
  {
    path: '/audit',
    element: (
      <Protected permission="audit.view">
        <AuditPage />
      </Protected>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
