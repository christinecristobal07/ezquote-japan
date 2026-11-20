import { describe, expect, it } from 'vitest';
import { resolveDuration, type DurationService } from './duration.ts';

const tour: DurationService = { consumesDay: true, addsNight: false };
const airportTransfer: DurationService = { consumesDay: false, addsNight: false };
const overnight: DurationService = { consumesDay: true, addsNight: true };

describe('resolveDuration (derived)', () => {
  it('never goes below the 3D2N floor', () => {
    const result = resolveDuration({ mode: 'derived', services: [] });
    expect(result).toMatchObject({ days: 3, nights: 2, label: '3D2N', requiredDays: 3 });
    expect(result.warnings).toEqual([]);
  });

  it('adds a day per day-consuming service', () => {
    expect(resolveDuration({ mode: 'derived', services: [tour, tour] }).label).toBe('4D3N');
    expect(resolveDuration({ mode: 'derived', services: [tour, tour, tour] }).label).toBe('5D4N');
  });

  it('ignores the airport transfer', () => {
    const withTransfer = resolveDuration({
      mode: 'derived',
      services: [tour, tour, airportTransfer],
    });
    expect(withTransfer.label).toBe('4D3N');
  });

  it('counts an extra night', () => {
    expect(resolveDuration({ mode: 'derived', services: [overnight] }).requiredDays).toBe(4);
  });

  it('warns past the 7-day maximum', () => {
    const long = resolveDuration({ mode: 'derived', services: Array(6).fill(tour) });
    expect(long.days).toBe(8);
    expect(long.warnings).toContain('EXCEEDS_MAX_DURATION');
  });
});

describe('resolveDuration (agent selected)', () => {
  it('uses the agent value when the tours fit', () => {
    const result = resolveDuration({
      mode: 'agent_selected',
      agentDays: 5,
      services: [tour, tour],
    });
    expect(result.label).toBe('5D4N');
    expect(result.warnings).toEqual([]);
  });

  it('warns when the tours do not fit', () => {
    const result = resolveDuration({
      mode: 'agent_selected',
      agentDays: 3,
      services: [tour, tour, tour],
    });
    expect(result.days).toBe(3);
    expect(result.requiredDays).toBe(5);
    expect(result.warnings).toContain('TOURS_DO_NOT_FIT');
  });

  it('clamps below the minimum and says so', () => {
    const result = resolveDuration({ mode: 'agent_selected', agentDays: 1, services: [] });
    expect(result.days).toBe(3);
    expect(result.warnings).toContain('BELOW_MIN_DURATION');
  });

  it('defaults to the minimum when no value is given', () => {
    expect(resolveDuration({ mode: 'agent_selected', services: [] }).days).toBe(3);
  });

  it('warns above the maximum', () => {
    const result = resolveDuration({ mode: 'agent_selected', agentDays: 9, services: [] });
    expect(result.warnings).toContain('EXCEEDS_MAX_DURATION');
  });
});
