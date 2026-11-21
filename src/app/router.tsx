import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { RequireRole } from '@/app/guards/RequireRole';
import type { Permission } from '@/domain/permissions';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SetPasswordPage } from '@/features/auth/SetPasswordPage';
import { AppLayout } from '@/app/layout/AppLayout';
import { RouteErrorElement } from '@/app/ErrorBoundary';
import { DashboardPage } from '@/app/pages/DashboardPage';
import { RatesListPage } from '@/features/rates/RatesListPage';
import { ServiceRatePage } from '@/features/rates/ServiceRatePage';
import { FxPage } from '@/features/rates/FxPage';
import { MarkupsPage } from '@/features/rates/MarkupsPage';
import { ContentLayout } from '@/features/content/ContentLayout';
import { ServicesPage } from '@/features/content/ServicesPage';
import { HotelsPage } from '@/features/content/HotelsPage';
import { PackageTextPage } from '@/features/content/PackageTextPage';
import { ReferencePage } from '@/features/content/ReferencePage';
import { SettingsPage } from '@/features/content/SettingsPage';
import { AgentsPage } from '@/features/agents/AgentsPage';
import { MyProfilePage } from '@/features/agents/MyProfilePage';
import {
  AuditPage,
  NewQuotationPage,
  NotFoundPage,
  QuotationsPage,
  TeamQuotationsPage,
} from '@/app/pages/placeholders';

function Guarded({ children, permission }: { children: ReactNode; permission: Permission }) {
  return <RequireRole permission={permission}>{children}</RequireRole>;
}

const protectedChildren: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  {
    path: 'quotations/new',
    element: (
      <Guarded permission="quotation.create">
        <NewQuotationPage />
      </Guarded>
    ),
  },
  {
    path: 'quotations',
    element: (
      <Guarded permission="quotation.viewOwn">
        <QuotationsPage />
      </Guarded>
    ),
  },
  {
    path: 'team/quotations',
    element: (
      <Guarded permission="quotation.viewTeam">
        <TeamQuotationsPage />
      </Guarded>
    ),
  },
  {
    path: 'admin/rates',
    element: (
      <Guarded permission="rates.manage">
        <RatesListPage />
      </Guarded>
    ),
  },
  {
    path: 'admin/rates/fx',
    element: (
      <Guarded permission="fx.manage">
        <FxPage />
      </Guarded>
    ),
  },
  {
    path: 'admin/rates/markups',
    element: (
      <Guarded permission="rates.manage">
        <MarkupsPage />
      </Guarded>
    ),
  },
  {
    path: 'admin/rates/:serviceId',
    element: (
      <Guarded permission="rates.manage">
        <ServiceRatePage />
      </Guarded>
    ),
  },
  {
    path: 'admin/content',
    element: (
      <Guarded permission="content.manage">
        <ContentLayout />
      </Guarded>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/content/services" replace /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'hotels', element: <HotelsPage /> },
      { path: 'text', element: <PackageTextPage /> },
      { path: 'reference', element: <ReferencePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: 'admin/agents',
    element: (
      <Guarded permission="agents.manage">
        <AgentsPage />
      </Guarded>
    ),
  },
  { path: 'me', element: <MyProfilePage /> },
  {
    path: 'audit',
    element: (
      <Guarded permission="audit.view">
        <AuditPage />
      </Guarded>
    ),
  },
];

if (import.meta.env.DEV) {
  protectedChildren.push({
    path: 'dev/ui',
    lazy: async () => {
      const { ComponentGallery } = await import('@/app/pages/ComponentGallery');
      return { Component: ComponentGallery };
    },
  });
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorElement /> },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
    errorElement: <RouteErrorElement />,
  },
  { path: '/auth/set-password', element: <SetPasswordPage />, errorElement: <RouteErrorElement /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorElement />,
    children: protectedChildren,
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
