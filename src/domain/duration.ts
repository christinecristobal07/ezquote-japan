export const MIN_DAYS = 3;
export const MAX_DAYS = 7;

export type DurationMode = 'agent_selected' | 'derived';

export type DurationWarning = 'TOURS_DO_NOT_FIT' | 'EXCEEDS_MAX_DURATION' | 'BELOW_MIN_DURATION';

export interface DurationService {
  readonly consumesDay: boolean;
  readonly addsNight: boolean;
}

export interface DurationInput {
  readonly mode: DurationMode;
  /** Only read when mode is 'agent_selected'. */
  readonly agentDays?: number | undefined;
  readonly services: readonly DurationService[];
}

export interface DurationResult {
  readonly days: number;
  readonly nights: number;
  /** "3D2N" */
  readonly label: string;
  readonly requiredDays: number;
  readonly warnings: readonly DurationWarning[];
}

/**
 * Arrival day + one day per day-consuming service + any extra nights +
 * departure day, never below the 3D2N floor. The airport transfer is flagged
 * consumesDay = false in the snapshot, so it does not take a day.
 */
export function resolveDuration(input: DurationInput): DurationResult {
  const consuming = input.services.filter((s) => s.consumesDay).length;
  const nightsAdded = input.services.filter((s) => s.addsNight).length;
  const requiredDays = Math.max(MIN_DAYS, 2 + consuming + nightsAdded);

  const warnings: DurationWarning[] = [];
  let days: number;

  if (input.mode === 'derived') {
    days = requiredDays;
  } else {
    days = input.agentDays ?? MIN_DAYS;
    if (days < MIN_DAYS) {
      warnings.push('BELOW_MIN_DURATION');
      days = MIN_DAYS;
    }
    if (requiredDays > days) warnings.push('TOURS_DO_NOT_FIT');
  }

  if (days > MAX_DAYS) warnings.push('EXCEEDS_MAX_DURATION');

  const nights = Math.max(0, days - 1);
  return { days, nights, label: `${days}D${nights}N`, requiredDays, warnings };
}
