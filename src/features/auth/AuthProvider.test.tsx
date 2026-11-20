import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CurrentProfile } from '@/data/repositories/profileRepository';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  getCurrentProfile: vi.fn(),
}));

vi.mock('@/data/repositories/authRepository', () => ({
  getSession: mocks.getSession,
  onAuthStateChange: mocks.onAuthStateChange,
  signOut: mocks.signOut,
}));

vi.mock('@/data/repositories/profileRepository', () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));

const { AuthProvider } = await import('./AuthProvider');
const { useAuth } = await import('./useAuth');

const SESSION = { user: { id: 'user-1' } };

function Probe() {
  const { status, profile } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="name">{profile?.fullName ?? '-'}</span>
    </div>
  );
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  );
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChange.mockReturnValue({ unsubscribe: vi.fn() });
  });

  it('is signedOut when there is no session', async () => {
    mocks.getSession.mockResolvedValue(null);
    wrap(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    });
    expect(mocks.getCurrentProfile).not.toHaveBeenCalled();
  });

  it('switches to pendingApproval when the profile is null', async () => {
    // RLS hides inactive and unapproved profiles alike, so null is the signal.
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getCurrentProfile.mockResolvedValue(null);
    wrap(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('pendingApproval');
    });
  });

  it('is signedIn once the profile loads', async () => {
    const profile: CurrentProfile = {
      id: 'p1',
      fullName: 'Ada Reyes',
      email: 'ada@gladex.test',
      role: 'sales_agent',
      isActive: true,
      supervisorId: null,
    };
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getCurrentProfile.mockResolvedValue(profile);
    wrap(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('signedIn');
    });
    expect(screen.getByTestId('name')).toHaveTextContent('Ada Reyes');
  });

  it('subscribes to auth changes and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    mocks.onAuthStateChange.mockReturnValue({ unsubscribe });
    mocks.getSession.mockResolvedValue(null);
    const view = wrap(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    });
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
