import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { AuthValue } from '@/features/auth/AuthProvider';
import type { CurrentProfile } from '@/data/repositories/profileRepository';
import type { Role } from '@/domain/permissions';

const authValue = vi.hoisted(() => ({ current: null as AuthValue | null }));

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => {
    if (authValue.current === null) throw new Error('no auth value set in test');
    return authValue.current;
  },
}));

const { RequireAuth } = await import('./RequireAuth');
const { RequireRole } = await import('./RequireRole');

function profileWith(role: Role): CurrentProfile {
  return {
    id: 'p1',
    fullName: 'Test Person',
    email: 'test@gladex.test',
    role,
    isActive: true,
    supervisorId: null,
  };
}

function setAuth(value: Partial<AuthValue>): void {
  authValue.current = {
    status: 'signedIn',
    session: null,
    profile: null,
    signOut: vi.fn(),
    ...value,
  };
}

function renderGuarded(ui: React.ReactNode, initial = '/admin/rates') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/admin/rates" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('shows a spinner while loading', () => {
    setAuth({ status: 'loading' });
    renderGuarded(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('redirects to login when signed out', () => {
    setAuth({ status: 'signedOut' });
    renderGuarded(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('shows the pending approval screen when there is no profile', () => {
    setAuth({ status: 'pendingApproval' });
    renderGuarded(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Account pending approval')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders the page when signed in', () => {
    setAuth({ status: 'signedIn', profile: profileWith('admin') });
    renderGuarded(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('renders children when the role has the permission', () => {
    setAuth({ status: 'signedIn', profile: profileWith('admin') });
    renderGuarded(
      <RequireRole permission="rates.manage">
        <p>Rate editor</p>
      </RequireRole>,
    );
    expect(screen.getByText('Rate editor')).toBeInTheDocument();
  });

  it('shows 403 when the role lacks the permission', () => {
    setAuth({ status: 'signedIn', profile: profileWith('sales_agent') });
    renderGuarded(
      <RequireRole permission="rates.manage">
        <p>Rate editor</p>
      </RequireRole>,
    );
    expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
    expect(screen.queryByText('Rate editor')).not.toBeInTheDocument();
  });

  it('shows 403 when there is no profile at all', () => {
    setAuth({ status: 'signedIn', profile: null });
    renderGuarded(
      <RequireRole permission="quotation.viewOwn">
        <p>Quotations</p>
      </RequireRole>,
    );
    expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
  });
});
