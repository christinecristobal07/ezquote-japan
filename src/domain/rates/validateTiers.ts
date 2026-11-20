export type PaxType = 'adult' | 'child';

export interface DraftTier {
  readonly paxType: PaxType;
  readonly minPax: number;
  readonly maxPax: number;
  /** Operator amount in the version's currency, as typed by the manager. */
  readonly amount: number;
}

export type TierErrorCode =
  'MIN_AFTER_MAX' | 'OUT_OF_RANGE' | 'NOT_WHOLE_NUMBER' | 'NEGATIVE_AMOUNT' | 'OVERLAP';

export type TierWarningCode = 'DOES_NOT_START_AT_ONE' | 'DOES_NOT_REACH_SIXTY' | 'GAP';

export interface TierError {
  readonly code: TierErrorCode;
  /** Index into the tiers array. */
  readonly row: number;
  /** The other row involved, for an overlap. */
  readonly otherRow?: number;
}

export interface TierWarning {
  readonly code: TierWarningCode;
  readonly paxType: PaxType;
  /** The uncovered band, for a gap. */
  readonly from?: number;
  readonly to?: number;
}

export interface TierValidation {
  readonly errors: readonly TierError[];
  readonly warnings: readonly TierWarning[];
  readonly valid: boolean;
}

export const MIN_GROUP = 1;
export const MAX_GROUP = 60;

/**
 * Checks a draft's tiers before they reach the database.
 *
 * Errors block saving and mirror the constraints the database would raise
 * anyway. Warnings are about coverage: a group size nobody priced is legal but
 * means a quotation for that size has no rate.
 *
 * Adult and child tiers are checked separately — they are allowed to overlap
 * each other, since a child in a group of four uses a different band.
 */
export function validateTiers(tiers: readonly DraftTier[]): TierValidation {
  const errors: TierError[] = [];
  const warnings: TierWarning[] = [];

  tiers.forEach((tier, row) => {
    if (!Number.isInteger(tier.minPax) || !Number.isInteger(tier.maxPax)) {
      errors.push({ code: 'NOT_WHOLE_NUMBER', row });
    } else {
      if (tier.minPax < MIN_GROUP || tier.maxPax > MAX_GROUP) {
        errors.push({ code: 'OUT_OF_RANGE', row });
      }
      if (tier.minPax > tier.maxPax) {
        errors.push({ code: 'MIN_AFTER_MAX', row });
      }
    }
    if (!Number.isFinite(tier.amount) || tier.amount < 0) {
      errors.push({ code: 'NEGATIVE_AMOUNT', row });
    }
  });

  for (const paxType of ['adult', 'child'] as const) {
    const rows = tiers
      .map((tier, row) => ({ tier, row }))
      .filter((entry) => entry.tier.paxType === paxType)
      .filter(
        (entry) =>
          Number.isInteger(entry.tier.minPax) &&
          Number.isInteger(entry.tier.maxPax) &&
          entry.tier.minPax <= entry.tier.maxPax,
      )
      .sort((a, b) => a.tier.minPax - b.tier.minPax);

    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (previous && current && current.tier.minPax <= previous.tier.maxPax) {
        errors.push({ code: 'OVERLAP', row: current.row, otherRow: previous.row });
      }
    }

    // Coverage warnings only make sense once there is something to cover, and
    // a child band may deliberately stop short of the full range.
    if (rows.length === 0) continue;

    const first = rows[0];
    const last = rows[rows.length - 1];
    if (paxType === 'adult') {
      if (first && first.tier.minPax > MIN_GROUP) {
        warnings.push({
          code: 'DOES_NOT_START_AT_ONE',
          paxType,
          from: MIN_GROUP,
          to: first.tier.minPax - 1,
        });
      }
      if (last && last.tier.maxPax < MAX_GROUP) {
        warnings.push({
          code: 'DOES_NOT_REACH_SIXTY',
          paxType,
          from: last.tier.maxPax + 1,
          to: MAX_GROUP,
        });
      }
    }

    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (previous && current && current.tier.minPax > previous.tier.maxPax + 1) {
        warnings.push({
          code: 'GAP',
          paxType,
          from: previous.tier.maxPax + 1,
          to: current.tier.minPax - 1,
        });
      }
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}

const ERROR_TEXT: Record<TierErrorCode, string> = {
  MIN_AFTER_MAX: 'The smallest group size must not be larger than the largest.',
  OUT_OF_RANGE: `Group sizes run from ${String(MIN_GROUP)} to ${String(MAX_GROUP)}.`,
  NOT_WHOLE_NUMBER: 'Group sizes must be whole numbers.',
  NEGATIVE_AMOUNT: 'The amount cannot be negative.',
  OVERLAP: 'This band overlaps another one.',
};

export function tierErrorText(error: TierError): string {
  return ERROR_TEXT[error.code];
}

export function tierWarningText(warning: TierWarning): string {
  const band = `${String(warning.from ?? '')}–${String(warning.to ?? '')}`;
  switch (warning.code) {
    case 'DOES_NOT_START_AT_ONE':
      return `No rate for groups of ${band}.`;
    case 'DOES_NOT_REACH_SIXTY':
      return `No rate for groups of ${band}.`;
    case 'GAP':
      return `Nothing covers groups of ${band}.`;
  }
}
