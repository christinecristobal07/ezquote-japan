import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toScaledRate, type DraftTier, type Markup } from '@/domain';
import { TierEditor } from './TierEditor';
import { PublishDialog } from './PublishDialog';
import { rateStatus } from './rateStatus';
import type { AuthValue } from '@/features/auth/authContext';
import type { Role } from '@/domain/permissions';

const FX = { JPY: toScaledRate(0.5, 'JPY'), PHP: toScaledRate(1, 'PHP') };
const MARKUPS: Record<string, Markup> = { tour: { type: 'fixed', value: 1000 } };

const BASE: DraftTier[] = [
  { paxType: 'adult', minPax: 1, maxPax: 1, amount: 50_000 },
  { paxType: 'adult', minPax: 2, maxPax: 6, amount: 10_850 },
];

function Harness({ initial = BASE }: { initial?: DraftTier[] }) {
  const [tiers, setTiers] = useState<DraftTier[]>(initial);
  return (
    <>
      <TierEditor
        tiers={tiers}
        currency="JPY"
        serviceType="tour"
        fx={FX}
        serviceMarkups={MARKUPS}
        onChange={(next) => {
          setTiers([...next]);
        }}
      />
      <p data-testid="count">{tiers.length}</p>
    </>
  );
}

describe('TierEditor', () => {
  it('shows the per-person preview: 10,850 JPY becomes PHP 6,425', () => {
    render(<Harness />);
    expect(screen.getByText('PHP 5,425')).toBeInTheDocument();
    expect(screen.getByText('PHP 6,425')).toBeInTheDocument();
  });

  it('adds a row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Add adult tier' }));
    expect(screen.getByTestId('count')).toHaveTextContent('3');
  });

  it('removes a row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Remove row 2' }));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('shows an overlap error on the offending row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const min = screen.getByLabelText('Minimum pax for row 2');
    await user.clear(min);
    await user.type(min, '1');
    expect(screen.getByText('This band overlaps another one.')).toBeInTheDocument();
    expect(screen.getByText(/Fix 1 problem/)).toBeInTheDocument();
  });

  it('warns about a gap without blocking', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const max = screen.getByLabelText('Maximum pax for row 2');
    await user.clear(max);
    await user.type(max, '5');
    expect(screen.getByText(/No rate for groups of 6–60/)).toBeInTheDocument();
    expect(screen.queryByText(/Fix \d+ problem/)).not.toBeInTheDocument();
  });

  it('flags a negative amount', () => {
    // A number input swallows a lone '-' while typing, so seed the value.
    render(<Harness initial={[{ paxType: 'adult', minPax: 1, maxPax: 60, amount: -5 }]} />);
    expect(screen.getByText('The amount cannot be negative.')).toBeInTheDocument();
  });
});

/** Mirrors how ServiceRatePage gates the Publish button on validation. */
function PublishGate({ tiers }: { tiers: DraftTier[] }) {
  const [current, setCurrent] = useState(tiers);
  return (
    <>
      <TierEditor
        tiers={current}
        currency="JPY"
        serviceType="tour"
        fx={FX}
        serviceMarkups={MARKUPS}
        onChange={(next) => {
          setCurrent([...next]);
        }}
      />
      <button type="button" disabled={!validateOk(current)}>
        Publish
      </button>
    </>
  );
}

function validateOk(tiers: DraftTier[]): boolean {
  return tiers.every(
    (tier) =>
      Number.isInteger(tier.minPax) &&
      Number.isInteger(tier.maxPax) &&
      tier.minPax <= tier.maxPax &&
      tier.amount >= 0,
  );
}

describe('Publish gating', () => {
  it('disables Publish while a row is invalid', async () => {
    const user = userEvent.setup();
    render(<PublishGate tiers={[...BASE]} />);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();

    const min = screen.getByLabelText('Minimum pax for row 1');
    await user.clear(min);
    await user.type(min, '40');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });
});

describe('PublishDialog', () => {
  const current: DraftTier[] = [
    { paxType: 'adult', minPax: 2, maxPax: 6, amount: 10_850 },
    { paxType: 'adult', minPax: 7, maxPax: 9, amount: 9_450 },
  ];

  it('shows the old and new amounts for a changed band', () => {
    const next: DraftTier[] = [
      { paxType: 'adult', minPax: 2, maxPax: 6, amount: 11_000 },
      { paxType: 'adult', minPax: 7, maxPax: 9, amount: 9_450 },
    ];
    render(
      <PublishDialog
        open
        onOpenChange={vi.fn()}
        currentTiers={current}
        draftTiers={next}
        currency="JPY"
        busy={false}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText(/Publishing locks these rates permanently/)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    const row = within(dialog).getByText('2–6 pax').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('JPY 10,850')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('JPY 11,000')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('changed')).toBeInTheDocument();

    // Unchanged bands stay out of the diff.
    expect(within(dialog).queryByText('7–9 pax')).not.toBeInTheDocument();
  });

  it('marks added and removed bands', () => {
    const next: DraftTier[] = [{ paxType: 'adult', minPax: 2, maxPax: 6, amount: 10_850 }];
    render(
      <PublishDialog
        open
        onOpenChange={vi.fn()}
        currentTiers={current}
        draftTiers={next}
        currency="JPY"
        busy={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('removed')).toBeInTheDocument();
  });

  it('says so when nothing changes', () => {
    render(
      <PublishDialog
        open
        onOpenChange={vi.fn()}
        currentTiers={current}
        draftTiers={current}
        currency="JPY"
        busy={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/No tier amounts change/)).toBeInTheDocument();
  });

  it('calls onConfirm when Publish is pressed', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <PublishDialog
        open
        onOpenChange={vi.fn()}
        currentTiers={current}
        draftTiers={current}
        currency="JPY"
        busy={false}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('rateStatus', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  it.each([
    [
      {
        hasPublished: true,
        hasDraft: false,
        effectiveFrom: '2026-01-01T00:00:00Z',
        validUntil: '2027-11-30',
      },
      'Published',
    ],
    [
      {
        hasPublished: true,
        hasDraft: true,
        effectiveFrom: '2026-01-01T00:00:00Z',
        validUntil: '2027-11-30',
      },
      'Draft pending',
    ],
    [
      {
        hasPublished: true,
        hasDraft: false,
        effectiveFrom: '2027-01-01T00:00:00Z',
        validUntil: null,
      },
      'Scheduled',
    ],
    [{ hasPublished: false, hasDraft: false, effectiveFrom: null, validUntil: null }, 'No rate'],
    [
      {
        hasPublished: true,
        hasDraft: false,
        effectiveFrom: '2026-01-01T00:00:00Z',
        validUntil: '2026-01-31',
      },
      'Expired',
    ],
  ])('%#: resolves to %s', (input, expected) => {
    expect(rateStatus(input, now)).toBe(expected);
  });
});

// -----------------------------------------------------------------------------
const authValue = vi.hoisted(() => ({ current: null as AuthValue | null }));

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => {
    if (authValue.current === null) throw new Error('no auth value set');
    return authValue.current;
  },
}));

const { RequireRole } = await import('@/app/guards/RequireRole');

describe('rates.manage guard', () => {
  function renderAs(role: Role) {
    authValue.current = {
      status: 'signedIn',
      session: null,
      profile: {
        id: 'p1',
        fullName: 'Test',
        email: null,
        role,
        isActive: true,
        supervisorId: null,
      },
      signOut: vi.fn(),
    };
    return render(
      <MemoryRouter initialEntries={['/admin/rates']}>
        <Routes>
          <Route
            path="/admin/rates"
            element={
              <RequireRole permission="rates.manage">
                <p>Rate management</p>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows 403 to a sales agent', () => {
    renderAs('sales_agent');
    expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
    expect(screen.queryByText('Rate management')).not.toBeInTheDocument();
  });

  it('shows 403 to a supervisor', () => {
    renderAs('sales_supervisor');
    expect(screen.getByText(/don't have access to this page/i)).toBeInTheDocument();
  });

  it('lets a manager through', () => {
    renderAs('product_development');
    expect(screen.getByText('Rate management')).toBeInTheDocument();
  });
});
