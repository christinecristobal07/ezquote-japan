import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseSnapshot, type RateSnapshot } from '@/domain';
import { AIRPORT_ID, MT_FUJI_ID, snapshotJson } from '@/domain/__fixtures__/snapshot';
import { CitiesField } from './CitiesField';
import { ServicesSection, type ServiceCardData } from './BuilderSections';

const snapshot: RateSnapshot = parseSnapshot(snapshotJson());

const CITIES = [
  { id: 'tokyo', name: 'Tokyo' },
  { id: 'osaka', name: 'Osaka' },
];

function card(serviceId: string, overrides: Partial<ServiceCardData> = {}): ServiceCardData {
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

describe('CitiesField', () => {
  it('lists the active cities as checkboxes', () => {
    render(<CitiesField cities={CITIES} selected={[]} disabled={false} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Tokyo')).toBeInTheDocument();
    expect(screen.getByLabelText('Osaka')).toBeInTheDocument();
  });

  it('asks for at least one city', () => {
    render(<CitiesField cities={CITIES} selected={[]} disabled={false} onChange={vi.fn()} />);
    expect(screen.getByText('Choose at least one city.')).toBeInTheDocument();
  });

  it('stops asking once a city is chosen', () => {
    render(
      <CitiesField cities={CITIES} selected={['tokyo']} disabled={false} onChange={vi.fn()} />,
    );
    expect(screen.queryByText('Choose at least one city.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tokyo')).toBeChecked();
  });

  it('adds a city to the selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CitiesField cities={CITIES} selected={['tokyo']} disabled={false} onChange={onChange} />,
    );
    await user.click(screen.getByLabelText('Osaka'));
    expect(onChange).toHaveBeenCalledWith(['tokyo', 'osaka']);
  });

  it('removes a city from the selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CitiesField
        cities={CITIES}
        selected={['tokyo', 'osaka']}
        disabled={false}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Tokyo'));
    expect(onChange).toHaveBeenCalledWith(['osaka']);
  });

  it('is read-only for someone who cannot edit the quotation', () => {
    render(<CitiesField cities={CITIES} selected={['tokyo']} disabled onChange={vi.fn()} />);
    expect(screen.getByLabelText('Tokyo')).toBeDisabled();
  });

  it('says so when no cities have been set up at all', () => {
    render(<CitiesField cities={[]} selected={[]} disabled={false} onChange={vi.fn()} />);
    expect(screen.getByText(/No cities set up yet/)).toBeInTheDocument();
  });
});

describe('ServicesSection city scope', () => {
  it('flags a selected service that sits outside the chosen cities', () => {
    render(
      <ServicesSection
        tours={[card(MT_FUJI_ID, { selected: true, outOfScope: true })]}
        transfers={[]}
        disabled={false}
        onToggle={vi.fn()}
        onToggleAddon={vi.fn()}
      />,
    );
    expect(screen.getByText('Outside the chosen cities')).toBeInTheDocument();
  });

  it('leaves the flagged service selectable, so it can be removed', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <ServicesSection
        tours={[card(MT_FUJI_ID, { selected: true, outOfScope: true })]}
        transfers={[]}
        disabled={false}
        onToggle={onToggle}
        onToggleAddon={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Mt Fuji Tour'));
    expect(onToggle).toHaveBeenCalledWith(MT_FUJI_ID, false);
  });

  it('shows no flag on a service that is in scope', () => {
    render(
      <ServicesSection
        tours={[card(MT_FUJI_ID, { selected: true })]}
        transfers={[card(AIRPORT_ID)]}
        disabled={false}
        onToggle={vi.fn()}
        onToggleAddon={vi.fn()}
      />,
    );
    expect(screen.queryByText('Outside the chosen cities')).not.toBeInTheDocument();
  });
});
