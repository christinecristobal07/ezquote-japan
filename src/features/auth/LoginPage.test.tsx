import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppAuthError } from '@/data/repositories/authRepository';
import type * as AuthRepo from '@/data/repositories/authRepository';

const signInWithPassword = vi.hoisted(() => vi.fn());

vi.mock('@/data/repositories/authRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthRepo>();
  return { ...actual, signInWithPassword };
});

const { LoginPage } = await import('./LoginPage');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
  });

  it('shows a friendly message when the credentials are wrong', async () => {
    signInWithPassword.mockRejectedValue(
      new AppAuthError(
        'INVALID_CREDENTIALS',
        'That email or password is not right. Please try again.',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'agent@gladex.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email or password is not right.',
    );
    // The raw Supabase wording never reaches the screen.
    expect(screen.queryByText(/invalid login credentials/i)).not.toBeInTheDocument();
  });

  it('shows the rate-limit message when Supabase throttles', async () => {
    signInWithPassword.mockRejectedValue(
      new AppAuthError('RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'agent@gladex.test');
    await user.type(screen.getByLabelText('Password'), 'whatever123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('submits on Enter and passes what was typed', async () => {
    signInWithPassword.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'boss@gladex.test');
    await user.type(screen.getByLabelText('Password'), 'Sup3rSecret!{Enter}');

    expect(signInWithPassword).toHaveBeenCalledWith('boss@gladex.test', 'Sup3rSecret!');
  });

  it('offers no public sign-up', () => {
    renderPage();
    expect(screen.getByText(/no public sign-up/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create an account/i })).not.toBeInTheDocument();
  });
});
