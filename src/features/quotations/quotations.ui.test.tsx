import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseSnapshot, resolveDuration, type RateSnapshot } from '@/domain';
import { AIRPORT_ID, MT_FUJI_ID, snapshotJson } from '@/domain/__fixtures__/snapshot';
import {
  DurationSection,
  ServicesSection,
  SummarySection,
  TravellersSection,
  type ServiceCardData,
} from './BuilderSections';
import { useAutosave, saveStateLabel } from './useAutosave';

const snapshot: RateSnapshot = parseSnapshot(snapshotJson());

function cardFor(serviceId: string, overrides: Partial<ServiceCardData> = {}): ServiceCardData {
  const service = snapshot.serviceById.get(serviceId);
  if (service === undefined) throw new Error(`no fixture service ${serviceId}`);
  return {
    service,
    selected: false,
    addonIds: [],
    perPersonPhp: 642_500,
    quotable: true,
    outOfScope: false,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
describe('TravellersSection', () => {
  it('shows the active tier for the current group size', () => {
    render(
      <TravellersSection
        adults={4}
        children={0}
        snapshot={snapshot}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/2–6 pax tier/)).toBeInTheDocument();
  });

  it('counts children towards the tier', () => {
    render(
      <TravellersSection
        adults={5}
        children={3}
        snapshot={snapshot}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    // 5 + 3 = 8 travellers, so the 7–9 band.
    expect(screen.getByText(/7–9 pax tier/)).toBeInTheDocument();
  });

  it('reports a change of adults with the children unchanged', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TravellersSection
        adults={4}
        children={1}
        snapshot={snapshot}
        disabled={false}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText('Adults'), '2');
    expect(onChange).toHaveBeenLastCalledWith(42, 1);
  });

  it('disables the inputs in read-only mode', () => {
    render(
      <TravellersSection adults={4} children={0} snapshot={snapshot} disabled onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Adults')).toBeDisabled();
  });
});

// -----------------------------------------------------------------------------
describe('DurationSection', () => {
  const tour = { consumesDay: true, addsNight: false };
  const transfer = { consumesDay: false, addsNight: false };

  it('derives 3D2N with no day-consuming services', () => {
    render(
      <DurationSection
        mode="derived"
        days={3}
        services={[transfer]}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('3D2N')).toBeInTheDocument();
  });

  it('grows to 4D3N when a second tour is added', () => {
    render(
      <DurationSection
        mode="derived"
        days={3}
        services={[tour, tour, transfer]}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('4D3N')).toBeInTheDocument();
  });

  it('warns in manual mode when the tours do not fit', () => {
    render(
      <DurationSection
        mode="agent_selected"
        days={3}
        services={[tour, tour, tour]}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('The tours do not fit')).toBeInTheDocument();
    expect(screen.getByText(/need 5 days/)).toBeInTheDocument();
  });

  it('warns past 7D6N', () => {
    render(
      <DurationSection
        mode="agent_selected"
        days={7}
        services={Array.from({ length: 7 }, () => tour)}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('The tours do not fit')).toBeInTheDocument();
  });

  it('hides the day selector in derived mode', () => {
    render(
      <DurationSection
        mode="derived"
        days={3}
        services={[tour]}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();
  });

  it('matches resolveDuration exactly', () => {
    const services = [tour, tour, transfer];
    expect(resolveDuration({ mode: 'derived', services }).label).toBe('4D3N');
  });
});

// -----------------------------------------------------------------------------
describe('ServicesSection', () => {
  it('shows the per-person price and the day badges', () => {
    render(
      <ServicesSection
        tours={[cardFor(MT_FUJI_ID)]}
        transfers={[cardFor(AIRPORT_ID, { perPersonPhp: 512_500 })]}
        disabled={false}
        onToggle={vi.fn()}
        onToggleAddon={vi.fn()}
      />,
    );
    expect(screen.getByText('PHP 6,425')).toBeInTheDocument();
    expect(screen.getByText('PHP 5,125')).toBeInTheDocument();
    expect(screen.getAllByText('Consumes day').length).toBeGreaterThan(0);
    expect(screen.getByText('Round trip')).toBeInTheDocument();
  });

  it('disables a service with no rate and says so', () => {
    render(
      <ServicesSection
        tours={[cardFor(MT_FUJI_ID, { quotable: false, perPersonPhp: null })]}
        transfers={[]}
        disabled={false}
        onToggle={vi.fn()}
        onToggleAddon={vi.fn()}
      />,
    );
    expect(screen.getByText('No rate yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Mt Fuji Tour')).toBeDisabled();
  });

  it('reports a selection', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <ServicesSection
        tours={[cardFor(MT_FUJI_ID)]}
        transfers={[]}
        disabled={false}
        onToggle={onToggle}
        onToggleAddon={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Mt Fuji Tour'));
    expect(onToggle).toHaveBeenCalledWith(MT_FUJI_ID, true);
  });

  it('offers add-ons only once the service is selected, unticked', async () => {
    const onToggleAddon = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ServicesSection
        tours={[cardFor(MT_FUJI_ID)]}
        transfers={[]}
        disabled={false}
        onToggle={vi.fn()}
        onToggleAddon={onToggleAddon}
      />,
    );
    expect(screen.queryByLabelText(/Entrance ticket/)).not.toBeInTheDocument();

    rerender(
      <ServicesSection
        tours={[cardFor(MT_FUJI_ID, { selected: true })]}
        transfers={[]}
        disabled={false}
        onToggle={vi.fn()}
        onToggleAddon={onToggleAddon}
      />,
    );
    const addon = screen.getByLabelText(/Entrance ticket/);
    expect(addon).not.toBeChecked();
    await user.click(addon);
    expect(onToggleAddon).toHaveBeenCalledWith(MT_FUJI_ID, expect.any(String), true);
  });
});

// -----------------------------------------------------------------------------
describe('SummarySection', () => {
  const input = {
    snapshot,
    paxTotal: 4,
    services: [{ serviceId: MT_FUJI_ID }, { serviceId: AIRPORT_ID }],
    outputCategories: ['quad', 'twin'],
  };

  it('warns that the hotel cost comes later', () => {
    render(<SummarySection input={input} outputCategories={['quad', 'twin']} />);
    expect(screen.getByText('Hotel cost not entered')).toBeInTheDocument();
    expect(screen.getByText(/entered in the next section \(Step 12\)/)).toBeInTheDocument();
  });

  it('prices each requested category with no hotel cost', () => {
    render(<SummarySection input={input} outputCategories={['quad']} />);
    // 0 hotel + 5,425 + 1,000 + 3,125 + 2,000 + 2,500 = 14,050 -> 14,099
    expect(screen.getByText('PHP 14,099')).toBeInTheDocument();
  });

  it('shows only the categories asked for', () => {
    render(<SummarySection input={input} outputCategories={['quad']} />);
    expect(screen.getByText('QUAD SHARE')).toBeInTheDocument();
    expect(screen.queryByText('TWIN SHARE')).not.toBeInTheDocument();
  });

  it('flags a blocking issue in red', () => {
    render(<SummarySection input={{ ...input, paxTotal: 99 }} outputCategories={['quad']} />);
    expect(screen.getByText('Cannot price yet')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
function AutosaveProbe({ save }: { save: (value: string) => Promise<unknown> }) {
  const autosave = useAutosave(save, 10);
  const [text, setText] = useState('');
  return (
    <>
      <input
        aria-label="Title"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          autosave.push(event.target.value);
        }}
      />
      <span data-testid="state">{saveStateLabel(autosave.state)}</span>
      <button type="button" onClick={autosave.retry}>
        Retry
      </button>
    </>
  );
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses rapid edits into one save and reports Saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AutosaveProbe save={save} />);

    await user.type(screen.getByLabelText('Title'), 'abc');
    vi.advanceTimersByTime(50);

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('Saved');
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
  });

  it('says Not saved on failure and resends the same value on retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AutosaveProbe save={save} />);

    await user.type(screen.getByLabelText('Title'), 'xy');
    vi.advanceTimersByTime(50);
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('Not saved, retry');
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('Saved');
    });
    // The queued value survived the failure, so nothing typed was lost.
    expect(save).toHaveBeenLastCalledWith('xy');
  });
});
