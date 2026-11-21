import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_QUOTATION_FILTERS, type QuotationFilters } from '@/domain';
import { HistoryFilters } from './HistoryFilters';
import { RequoteDialog } from './RequoteDialog';

const AGENTS = [
  { id: 'a1', name: 'Aira Cruz' },
  { id: 'a2', name: 'Ben Santos' },
];

function filters(overrides: Partial<QuotationFilters> = {}): QuotationFilters {
  return { ...DEFAULT_QUOTATION_FILTERS, ...overrides };
}

describe('HistoryFilters', () => {
  it('hides the agent picker from an agent looking at their own list', () => {
    render(<HistoryFilters filters={filters()} agents={undefined} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/Agent/)).not.toBeInTheDocument();
  });

  it('offers every visible agent to a supervisor', () => {
    render(<HistoryFilters filters={filters()} agents={AGENTS} onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Aira Cruz' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Everyone' })).toBeInTheDocument();
  });

  it('reports a status choice and returns to the first page', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <HistoryFilters filters={filters({ page: 4 })} agents={undefined} onChange={onChange} />,
    );
    await user.selectOptions(screen.getByLabelText(/Status/), 'archived');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['archived'], page: 1 }),
    );
  });

  it('clears the status back to any', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <HistoryFilters
        filters={filters({ statuses: ['sent'] })}
        agents={undefined}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/Status/), '');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: [] }));
  });

  it('only offers Clear filters once something is filtered', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <HistoryFilters filters={filters()} agents={undefined} onChange={onChange} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    rerender(
      <HistoryFilters
        filters={filters({ search: 'Cruz', from: '2026-12-01' })}
        agents={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: '', from: '', statuses: [], page: 1 }),
    );
  });

  it('keeps the sort when filters are cleared', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <HistoryFilters
        filters={filters({ search: 'x', sort: 'travel_date', direction: 'asc' })}
        agents={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'travel_date', direction: 'asc' }),
    );
  });
});

describe('RequoteDialog', () => {
  const result = {
    id: 'q2',
    referenceNo: 'JPN-2026-000124',
    skippedServices: [],
    skippedAddons: [],
  };

  it('shows nothing when there is no result yet', () => {
    render(<RequoteDialog result={null} onClose={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the new reference', () => {
    render(<RequoteDialog result={result} onClose={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText(/JPN-2026-000124/)).toBeInTheDocument();
  });

  it('confirms a clean copy', () => {
    render(<RequoteDialog result={result} onClose={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText(/Everything carried over/)).toBeInTheDocument();
  });

  it('lists what could not be carried over', () => {
    render(
      <RequoteDialog
        result={{
          ...result,
          skippedServices: ['Mt Fuji Tour'],
          skippedAddons: ['Entrance ticket'],
        }}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('Mt Fuji Tour')).toBeInTheDocument();
    expect(screen.getByText('Entrance ticket')).toBeInTheDocument();
    expect(screen.queryByText(/Everything carried over/)).not.toBeInTheDocument();
  });

  it('opens the copy by its new id', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<RequoteDialog result={result} onClose={vi.fn()} onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: 'Open the copy' }));
    expect(onOpen).toHaveBeenCalledWith('q2');
  });

  it('can be dismissed without leaving the original', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RequoteDialog result={result} onClose={onClose} onOpen={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Stay here' }));
    expect(onClose).toHaveBeenCalled();
  });
});
