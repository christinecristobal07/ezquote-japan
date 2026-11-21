import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { AuthValue } from '@/features/auth/authContext';
import type { CurrentProfile } from '@/data/repositories/profileRepository';
import type { Role } from '@/domain/permissions';

const authValue = vi.hoisted(() => ({ current: null as AuthValue | null }));

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => {
    if (authValue.current === null) throw new Error('no auth value set in test');
    return authValue.current;
  },
}));

const { AppLayout } = await import('./AppLayout');

function profileWith(role: Role): CurrentProfile {
  return {
    id: 'p1',
    fullName: 'Ada Reyes',
    email: 'ada@gladex.test',
    role,
    isActive: true,
    supervisorId: null,
  };
}

function renderLayout(role: Role = 'admin') {
  authValue.current = {
    status: 'signedIn',
    session: null,
    profile: profileWith(role),
    signOut: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<p>Dashboard body</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  it('renders the shell with a skip link and the ownership footer', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(
      screen.getByText(/exclusively owned by Gladex Travel and Tours Corp/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Dashboard body')).toBeInTheDocument();
  });

  it('stamps the build in the footer, so pilot feedback can name it', () => {
    renderLayout();
    // Injected by the Vite/Vitest `define`; the sha is "test" under Vitest.
    expect(screen.getByTitle('Build version and commit')).toHaveTextContent(
      /^v\d+\.\d+\.\d+.* · \S+$/,
    );
  });

  it('marks the active nav item with aria-current', () => {
    renderLayout();
    const dashboard = screen.getAllByRole('link', { name: /Dashboard/ })[0];
    expect(dashboard).toHaveAttribute('aria-current', 'page');
  });

  describe('mobile drawer', () => {
    it('opens, closes on Escape and returns focus to the hamburger', async () => {
      const user = userEvent.setup();
      renderLayout();

      const hamburger = screen.getByRole('button', { name: 'Open menu' });
      expect(hamburger).toHaveAttribute('aria-expanded', 'false');

      await user.click(hamburger);
      const drawer = await screen.findByRole('dialog', { name: 'Main menu' });
      expect(drawer).toBeInTheDocument();
      expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => {
        expect(drawer).toHaveFocus();
      });

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Main menu' })).not.toBeInTheDocument();
      });
      expect(hamburger).toHaveFocus();
    });

    it('closes when the close button is used', async () => {
      const user = userEvent.setup();
      renderLayout();

      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      await screen.findByRole('dialog', { name: 'Main menu' });

      await user.click(screen.getByRole('button', { name: 'Close menu' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Main menu' })).not.toBeInTheDocument();
      });
    });
  });

  it('shows admin navigation to a manager but not to an agent', () => {
    const managerView = renderLayout('admin');
    expect(screen.getAllByRole('link', { name: /Rates & FX/ }).length).toBeGreaterThan(0);
    managerView.unmount();

    renderLayout('sales_agent');
    expect(screen.queryByRole('link', { name: /Rates & FX/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });
});
