import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fromPhp,
  ledgerView,
  parseSnapshot,
  toEngineInput,
  type AdjustmentRecord,
  type RateSnapshot,
} from '@/domain';
import { AIRPORT_ID, MT_FUJI_ID, snapshotJson } from '@/domain/__fixtures__/snapshot';
import { AdjustmentForm, DetailedSummary, HotelCostCard, LedgerTable } from './PricingSections';

const snapshot: RateSnapshot = parseSnapshot(snapshotJson()); // JPY 0.5
const CATEGORIES = ['quad', 'twin', 'solo'];

function record(overrides: Partial<AdjustmentRecord> = {}): AdjustmentRecord {
  return {
    id: 'h-quad',
    paxCategory: 'quad',
    kind: 'hotel',
    amount: 20_000,
    currency: 'PHP',
    reason: 'Quad room, 2 nights',
    createdAt: '2026-11-21T01:00:00Z',
    createdByName: 'Agent One',
    amountPerNight: null,
    nights: null,
    reversesId: null,
    ...overrides,
  };
}

/** The Step 5 golden quote: 4 pax, Mt Fuji + airport transfer. */
function engineInput(adjustments: readonly AdjustmentRecord[], markupPercent?: number) {
  return toEngineInput(
    snapshot,
    {
      paxAdults: 4,
      paxChildren: 0,
      airfarePhp: 0,
      packageMarkupType: markupPercent === undefined ? null : 'percent',
      packageMarkupValue: markupPercent ?? null,
      outputCategories: ['quad'],
    },
    [
      { serviceId: MT_FUJI_ID, sortOrder: 1 },
      { serviceId: AIRPORT_ID, sortOrder: 2 },
    ],
    [],
    adjustments.map((row) => ({
      paxCategory: row.paxCategory,
      kind: row.kind,
      amount: row.amount,
      currency: row.currency,
    })),
  );
}

// -----------------------------------------------------------------------------
describe('golden pricing flow', () => {
  it('a PHP 20,000 quad room gives the Step 5 figure of 19,099', () => {
    render(
      <DetailedSummary
        input={engineInput([record()])}
        outputCategories={['quad']}
        snapshot={snapshot}
      />,
    );
    expect(screen.getByText('PHP 19,099')).toBeInTheDocument();
  });

  it('adding a 10% package markup gives 20,499', () => {
    render(
      <DetailedSummary
        input={engineInput([record()], 10)}
        outputCategories={['quad']}
        snapshot={snapshot}
      />,
    );
    expect(screen.getByText('PHP 20,499')).toBeInTheDocument();
  });

  it('brings back the missing-hotel warning once the entry is reversed', () => {
    const original = record();
    const reversal = record({
      id: 'r1',
      amount: -20_000,
      reversesId: 'h-quad',
      reason: 'Wrong room',
      createdAt: '2026-11-21T02:00:00Z',
    });

    render(
      <DetailedSummary
        input={engineInput([original, reversal])}
        outputCategories={['quad']}
        snapshot={snapshot}
      />,
    );
    // Hotel falls to zero, so the quote drops to the no-hotel figure.
    expect(screen.getByText('PHP 14,099')).toBeInTheDocument();
  });

  it('converts a JPY entry at the snapshot FX, not a newer one', () => {
    const jpy = record({ id: 'j', kind: 'surcharge', amount: 2_000, currency: 'JPY' });
    const view = ledgerView([jpy], snapshot);
    expect(view.byCategory.get('quad')?.otherNetPhp).toBe(fromPhp(1_000));

    // A newer FX exists in the admin screens, but this quotation keeps 0.5.
    const newer = parseSnapshot(snapshotJson(0.42));
    expect(ledgerView([jpy], newer).byCategory.get('quad')?.otherNetPhp).toBe(fromPhp(840));
  });

  it('shows the reconciliation tick when the lines add up', async () => {
    const user = userEvent.setup();
    render(
      <DetailedSummary
        input={engineInput([record()])}
        outputCategories={['quad']}
        snapshot={snapshot}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show breakdown/ }));
    expect(screen.getByText(/Lines total PHP 19,099 = final ✓/)).toBeInTheDocument();
  });

  it('disables Generate while something blocks pricing', () => {
    render(
      <DetailedSummary
        input={{ ...engineInput([record()]), paxTotal: 99 }}
        outputCategories={['quad']}
        snapshot={snapshot}
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate quotation' })).toBeDisabled();
  });

  it('enables Generate once everything is in place', () => {
    render(
      <DetailedSummary
        input={engineInput([record()])}
        outputCategories={['quad']}
        snapshot={snapshot}
      />,
    );
    expect(screen.getByRole('button', { name: 'Generate quotation' })).toBeEnabled();
  });

  // The button rendered enabled but with no handler attached for a while:
  // it looked like it worked and did nothing at all. Asserting the click,
  // not just the enabled state, is what would have caught that.
  it('calls onGenerate when it is pressed', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailedSummary
        input={engineInput([record()])}
        outputCategories={['quad']}
        snapshot={snapshot}
        onGenerate={onGenerate}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Generate quotation' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not call onGenerate while something blocks it', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailedSummary
        input={engineInput([record()])}
        outputCategories={['quad']}
        snapshot={snapshot}
        extraBlocking={['the tours do not fit']}
        onGenerate={onGenerate}
      />,
    );
    const button = screen.getByRole('button', { name: 'Generate quotation' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
describe('HotelCostCard', () => {
  const ledger = ledgerView(
    [
      record({ id: 'q', paxCategory: 'quad', amount: 20_000 }),
      record({ id: 't', paxCategory: 'twin', amount: 12_000 }),
      record({ id: 's', paxCategory: 'solo', amount: 6_000 }),
    ],
    snapshot,
  );

  it('divides, and doubles for Solo', () => {
    render(
      <HotelCostCard
        snapshot={snapshot}
        ledger={ledger}
        categories={CATEGORIES}
        readOnly={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByText('PHP 20,000 room ÷ 4 = PHP 5,000 per person')).toBeInTheDocument();
    expect(screen.getByText('PHP 12,000 room ÷ 2 = PHP 6,000 per person')).toBeInTheDocument();
    expect(screen.getByText('PHP 6,000 per-person twin rate × 2 = PHP 12,000')).toBeInTheDocument();
  });

  it('warns per category until a hotel entry exists', () => {
    render(
      <HotelCostCard
        snapshot={snapshot}
        ledger={ledgerView([], snapshot)}
        categories={CATEGORIES}
        readOnly={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getAllByText('No hotel cost yet')).toHaveLength(3);
  });

  it('hides the add button for a read-only viewer', () => {
    render(
      <HotelCostCard
        snapshot={snapshot}
        ledger={ledger}
        categories={CATEGORIES}
        readOnly
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add hotel cost' })).not.toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
describe('LedgerTable', () => {
  const original = record();
  const reversal = record({
    id: 'r1',
    amount: -20_000,
    reversesId: 'h-quad',
    reason: 'Wrong room',
    createdByName: 'Admin',
    createdAt: '2026-11-21T02:00:00Z',
  });

  it('strikes through a reversed entry and names who reversed it', () => {
    render(
      <LedgerTable
        ledger={ledgerView([original, reversal], snapshot)}
        snapshot={snapshot}
        categories={['quad']}
        readOnly={false}
        onReverse={vi.fn()}
      />,
    );
    const row = screen.getByText('Quad room, 2 nights').closest('tr');
    expect(row?.className).toContain('line-through');
    expect(screen.getByText(/reversed by Admin/)).toBeInTheDocument();
  });

  it('offers Reverse on a live entry only', () => {
    render(
      <LedgerTable
        ledger={ledgerView([original, reversal], snapshot)}
        snapshot={snapshot}
        categories={['quad']}
        readOnly={false}
        onReverse={vi.fn()}
      />,
    );
    // The original is reversed and the reversal is a reversal: neither qualifies.
    expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument();
  });

  it('offers Reverse on an untouched entry', async () => {
    const onReverse = vi.fn();
    const user = userEvent.setup();
    render(
      <LedgerTable
        ledger={ledgerView([original], snapshot)}
        snapshot={snapshot}
        categories={['quad']}
        readOnly={false}
        onReverse={onReverse}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(onReverse).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-quad' }));
  });

  it('shows a supervisor no Reverse buttons at all', () => {
    render(
      <LedgerTable
        ledger={ledgerView([original], snapshot)}
        snapshot={snapshot}
        categories={['quad']}
        readOnly
        onReverse={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument();
    expect(screen.getByText('Quad room, 2 nights')).toBeInTheDocument();
  });

  it('shows the net per category', () => {
    render(
      <LedgerTable
        ledger={ledgerView(
          [original, record({ id: 's2', kind: 'surcharge', amount: 1_500 })],
          snapshot,
        )}
        snapshot={snapshot}
        categories={['quad']}
        readOnly={false}
        onReverse={vi.fn()}
      />,
    );
    const footer = screen.getByText(/Net for Quad sharing/).closest('tr');
    expect(within(footer as HTMLElement).getByText('PHP 21,500')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
describe('AdjustmentForm', () => {
  it('creates one entry per category when "all" is ticked', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AdjustmentForm
        mode="other"
        categories={CATEGORIES}
        snapshot={snapshot}
        nights={2}
        busy={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('All selected categories'));
    await user.type(screen.getByLabelText('Quad sharing'), '500');
    await user.type(screen.getByLabelText('Twin sharing'), '600');
    await user.type(screen.getByLabelText('Solo'), '700');
    await user.type(screen.getByLabelText(/^Reason/), 'Peak season');
    await user.click(screen.getByRole('button', { name: /Save 3 entries/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const entries = onSubmit.mock.calls[0]?.[0] as { paxCategory: string; amount: number }[];
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => [entry.paxCategory, entry.amount])).toEqual([
      ['quad', 500],
      ['twin', 600],
      ['solo', 700],
    ]);
  });

  it('multiplies a per-night rate by the nights', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AdjustmentForm
        mode="hotel"
        categories={['quad']}
        snapshot={snapshot}
        nights={2}
        busy={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Input mode'), 'night');
    await user.type(screen.getByLabelText(/^Amount per night/), '10000');
    await user.type(screen.getByLabelText(/^Reason/), 'Two nights quad');
    await user.click(screen.getByRole('button', { name: /Save entry/ }));

    const entries = onSubmit.mock.calls[0]?.[0] as { amount: number }[];
    expect(entries[0]?.amount).toBe(20_000);
  });

  it('will not save without a reason', async () => {
    const user = userEvent.setup();
    render(
      <AdjustmentForm
        mode="other"
        categories={['quad']}
        snapshot={snapshot}
        nights={2}
        busy={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/^Amount*/), '500');
    expect(screen.getByRole('button', { name: /Save entry/ })).toBeDisabled();
  });

  it('will not save a zero amount', async () => {
    const user = userEvent.setup();
    render(
      <AdjustmentForm
        mode="other"
        categories={['quad']}
        snapshot={snapshot}
        nights={2}
        busy={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/^Amount*/), '0');
    await user.type(screen.getByLabelText(/^Reason/), 'Nothing really');
    expect(screen.getByRole('button', { name: /Save entry/ })).toBeDisabled();
  });

  it('accepts a negative amount', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AdjustmentForm
        mode="other"
        categories={['quad']}
        snapshot={snapshot}
        nights={2}
        busy={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText(/^Amount*/));
    await user.type(screen.getByLabelText(/^Amount*/), '-250');
    await user.type(screen.getByLabelText(/^Reason/), 'Agreed discount');
    await user.click(screen.getByRole('button', { name: /Save entry/ }));
    expect((onSubmit.mock.calls[0]?.[0] as { amount: number }[])[0]?.amount).toBe(-250);
  });
});
