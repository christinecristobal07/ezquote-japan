import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import type { FxRateRow } from '@/data/repositories/fxRepository';

const mocks = vi.hoisted(() => ({
  listFxRates: vi.fn(),
  insertFxRate: vi.fn(),
}));

vi.mock('@/data/repositories/fxRepository', () => ({
  listFxRates: mocks.listFxRates,
  insertFxRate: mocks.insertFxRate,
}));

const { FxPage } = await import('./FxPage');

const CURRENT: FxRateRow[] = [
  {
    id: 'jpy-1',
    currency: 'JPY',
    phpPerUnit: 0.5,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    createdByName: 'Christine Cristobal',
  },
  {
    id: 'usd-1',
    currency: 'USD',
    phpPerUnit: 67,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    createdByName: 'Christine Cristobal',
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <FxPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openDialog(): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Set new rate' }));
  await screen.findByRole('dialog');
}

describe('FxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFxRates.mockResolvedValue(CURRENT);
  });

  it('shows the current rate per currency with who set it', async () => {
    renderPage();
    // The value shows in the summary card and again in the history table.
    expect((await screen.findAllByText('0.5')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('67').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Christine Cristobal/).length).toBeGreaterThan(0);
  });

  it('previews Mt Fuji 2-6 pax before and after the new rate', async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog();

    const dialog = screen.getByRole('dialog');
    // 10,850 JPY at 0.5 = PHP 5,425
    expect(within(dialog).getByText('PHP 5,425')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('PHP per unit'), '0.48');
    // 10,850 at 0.48 = PHP 5,208
    expect(within(dialog).getByText('PHP 5,208')).toBeInTheDocument();
  });

  it('stays quiet for a small change', async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog();

    await user.type(screen.getByLabelText('PHP per unit'), '0.48'); // -4%
    expect(screen.queryByText(/That is a big move/)).not.toBeInTheDocument();
  });

  it('warns when the change is more than 10%', async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog();

    await user.type(screen.getByLabelText('PHP per unit'), '0.42'); // -16%
    expect(screen.getByText(/That is a big move/)).toBeInTheDocument();
    expect(screen.getByText(/-16.0%/)).toBeInTheDocument();
  });

  it('refuses a zero or negative rate', async () => {
    const user = userEvent.setup();
    renderPage();
    await openDialog();

    await user.type(screen.getByLabelText('PHP per unit'), '0');
    expect(screen.getByText('Enter a number greater than zero.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save rate' })).toBeDisabled();
  });

  it('saves a new row rather than editing the old one', async () => {
    mocks.insertFxRate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await openDialog();

    await user.type(screen.getByLabelText('PHP per unit'), '0.48');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    expect(mocks.insertFxRate).toHaveBeenCalledTimes(1);
    const [currency, value] = mocks.insertFxRate.mock.calls[0] as [string, number, string];
    expect(currency).toBe('JPY');
    expect(value).toBe(0.48);
  });
});
