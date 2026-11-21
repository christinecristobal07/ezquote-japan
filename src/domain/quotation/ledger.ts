import { fromPhp, scaleBy, toPhp, type Centavos, type CurrencyCode } from '../money.ts';
import type { RateSnapshot } from '../snapshot.ts';

export type AdjustmentKind =
  | 'hotel'
  | 'operator_charge'
  | 'rate_difference'
  | 'special_arrangement'
  | 'extra_transfer'
  | 'child_adjustment'
  | 'surcharge'
  | 'other';

export interface AdjustmentRecord {
  readonly id: string;
  readonly paxCategory: string;
  readonly kind: AdjustmentKind;
  /** Signed, in its own currency. */
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly reason: string;
  readonly createdAt: string;
  readonly createdByName: string | null;
  /** Set when this row reverses another. */
  readonly reversesId: string | null;
  /**
   * For a hotel entry priced per night: the nightly rate it was built from,
   * and the nights it was multiplied by. Null for a flat stay total, which a
   * supplier quoting one figure for the whole stay should not have to be
   * divided back out of.
   */
  readonly amountPerNight: number | null;
  readonly nights: number | null;
}

export interface LedgerEntry extends AdjustmentRecord {
  /** Converted at the QUOTATION's snapshot FX, not today's. */
  readonly amountPhp: Centavos;
  /** This entry has been cancelled by a later reversal. */
  readonly isReversed: boolean;
  /** This entry is itself a reversal. */
  readonly isReversal: boolean;
  readonly reversedByName: string | null;
  readonly reversedAt: string | null;
}

export interface CategoryLedger {
  readonly paxCategory: string;
  readonly entries: readonly LedgerEntry[];
  /** Live hotel entries only, in PHP centavos. */
  readonly hotelRoomTotalPhp: Centavos;
  /** Live non-hotel entries, in PHP centavos. Can be negative. */
  readonly otherNetPhp: Centavos;
  readonly liveCount: number;
  readonly reversedCount: number;
  readonly hasHotelCost: boolean;
}

export interface LedgerView {
  readonly byCategory: ReadonlyMap<string, CategoryLedger>;
  /** Entries whose category is not among the snapshot's categories. */
  readonly unknownCategories: readonly string[];
}

/**
 * Turns raw adjustment rows into what the ledger table and the hotel card show.
 *
 * A reversal and the entry it cancels both stay visible — that is the point of
 * an append-only ledger — but neither contributes to a total.
 */
export function ledgerView(
  adjustments: readonly AdjustmentRecord[],
  snapshot: RateSnapshot,
): LedgerView {
  const reversalByTarget = new Map<string, AdjustmentRecord>();
  for (const row of adjustments) {
    if (row.reversesId !== null) reversalByTarget.set(row.reversesId, row);
  }

  const known = new Set(snapshot.categories.map((category) => category.code));
  const unknown = new Set<string>();
  const grouped = new Map<string, LedgerEntry[]>();

  for (const row of adjustments) {
    if (!known.has(row.paxCategory)) unknown.add(row.paxCategory);

    const reversal = reversalByTarget.get(row.id);
    const entry: LedgerEntry = {
      ...row,
      amountPhp: toPhp(row.amount, row.currency, snapshot.fx),
      isReversed: reversal !== undefined,
      isReversal: row.reversesId !== null,
      reversedByName: reversal?.createdByName ?? null,
      reversedAt: reversal?.createdAt ?? null,
    };
    grouped.set(row.paxCategory, [...(grouped.get(row.paxCategory) ?? []), entry]);
  }

  const byCategory = new Map<string, CategoryLedger>();
  for (const [paxCategory, entries] of grouped) {
    const live = entries.filter((entry) => !entry.isReversed && !entry.isReversal);
    const hotel = live.filter((entry) => entry.kind === 'hotel');
    const other = live.filter((entry) => entry.kind !== 'hotel');

    byCategory.set(paxCategory, {
      paxCategory,
      entries: [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      hotelRoomTotalPhp: hotel.reduce((sum, entry) => sum + entry.amountPhp, 0),
      otherNetPhp: other.reduce((sum, entry) => sum + entry.amountPhp, 0),
      liveCount: live.length,
      reversedCount: entries.filter((entry) => entry.isReversed).length,
      hasHotelCost: hotel.length > 0,
    });
  }

  return { byCategory, unknownCategories: [...unknown] };
}

/** An empty ledger for a category with no entries yet. */
export function emptyCategoryLedger(paxCategory: string): CategoryLedger {
  return {
    paxCategory,
    entries: [],
    hotelRoomTotalPhp: 0,
    otherNetPhp: 0,
    liveCount: 0,
    reversedCount: 0,
    hasHotelCost: false,
  };
}

function peso(centavos: Centavos): string {
  return `PHP ${(centavos / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Explains in words how a room total becomes a per-person figure, because the
 * Solo rule reads backwards to anyone seeing it for the first time.
 */
export function hotelPerPersonExplanation(
  paxCategory: string,
  roomTotalPhp: Centavos,
  divisor: number,
  multiplier: number,
): string {
  const perPerson = scaleBy(roomTotalPhp, divisor, multiplier);

  if (paxCategory === 'solo') {
    return `${peso(roomTotalPhp)} per-person twin rate × ${String(multiplier)} = ${peso(perPerson)}`;
  }
  if (divisor === 1 && multiplier === 1) {
    return `${peso(roomTotalPhp)} as entered = ${peso(perPerson)} per person`;
  }
  if (multiplier === 1) {
    return `${peso(roomTotalPhp)} room ÷ ${String(divisor)} = ${peso(perPerson)} per person`;
  }
  return `${peso(roomTotalPhp)} ÷ ${String(divisor)} × ${String(multiplier)} = ${peso(perPerson)} per person`;
}

/** "Rate per night × nights" entry mode. */
export function nightlyToStayTotal(perNight: number, nights: number): number {
  if (!Number.isFinite(perNight) || !Number.isFinite(nights)) return 0;
  if (nights <= 0) return 0;
  return Math.round(perNight * nights * 100) / 100;
}

/**
 * What a hotel entry is worth for the trip as it stands now.
 *
 * The Excel asks for a rate per night and multiplies by the nights in the
 * DURATION cell, so lengthening the trip re-prices the hotel by itself. An
 * entry that recorded its nightly rate does the same here. One entered as a
 * flat stay total keeps the figure it was given: re-multiplying a number the
 * agent typed as a finished total would invent money nobody quoted.
 */
export function effectiveAmount(entry: AdjustmentRecord, currentNights: number): number {
  if (entry.amountPerNight === null || entry.nights === null) return entry.amount;
  if (!Number.isFinite(currentNights) || currentNights <= 0) return entry.amount;
  return nightlyToStayTotal(entry.amountPerNight, currentNights);
}

/**
 * A hotel entry whose nights no longer match the trip, and which cannot follow
 * it because it was entered as a stay total.
 *
 * These are flagged rather than re-multiplied. The agent typed one number for
 * a stay of a particular length; guessing a nightly rate out of it and scaling
 * that would change a figure they may already have quoted.
 */
export function staleStayTotals(
  entries: readonly AdjustmentRecord[],
  currentNights: number,
): readonly AdjustmentRecord[] {
  return entries.filter(
    (entry) =>
      entry.kind === 'hotel' &&
      entry.reversesId === null &&
      entry.amountPerNight === null &&
      entry.amount !== 0 &&
      currentNights > 0,
  );
}

/** "PHP 3,500 x 2 nights = PHP 7,000", for the hotel cost card. */
export function nightlyExplanation(perNight: Centavos, nights: number, total: Centavos): string {
  return `${peso(perNight)} × ${String(nights)} night${nights === 1 ? '' : 's'} = ${peso(total)}`;
}

export const MAX_ADJUSTMENT_AMOUNT = 10_000_000;
export const MIN_REASON_LENGTH = 3;

export type AdjustmentInputError =
  | 'AMOUNT_ZERO'
  | 'AMOUNT_TOO_LARGE'
  | 'AMOUNT_TOO_PRECISE'
  | 'AMOUNT_NOT_A_NUMBER'
  | 'REASON_TOO_SHORT'
  | 'NO_CATEGORY';

export interface AdjustmentInput {
  readonly paxCategories: readonly string[];
  readonly kind: AdjustmentKind;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly reason: string;
}

export interface AdjustmentValidation {
  readonly errors: readonly AdjustmentInputError[];
  readonly valid: boolean;
}

export function validateAdjustmentInput(input: AdjustmentInput): AdjustmentValidation {
  const errors: AdjustmentInputError[] = [];

  if (input.paxCategories.length === 0) errors.push('NO_CATEGORY');

  if (!Number.isFinite(input.amount)) {
    errors.push('AMOUNT_NOT_A_NUMBER');
  } else {
    if (input.amount === 0) errors.push('AMOUNT_ZERO');
    if (Math.abs(input.amount) > MAX_ADJUSTMENT_AMOUNT) errors.push('AMOUNT_TOO_LARGE');
    if (Math.round(input.amount * 100) !== input.amount * 100) errors.push('AMOUNT_TOO_PRECISE');
  }

  if (input.reason.trim().length < MIN_REASON_LENGTH) errors.push('REASON_TOO_SHORT');

  return { errors, valid: errors.length === 0 };
}

const MESSAGES: Record<AdjustmentInputError, string> = {
  AMOUNT_ZERO: 'An amount of zero changes nothing.',
  AMOUNT_TOO_LARGE: 'That amount looks wrong. Keep it under 10,000,000.',
  AMOUNT_TOO_PRECISE: 'Use at most two decimal places.',
  AMOUNT_NOT_A_NUMBER: 'Enter a number.',
  REASON_TOO_SHORT: 'Give a reason, so the ledger explains itself later.',
  NO_CATEGORY: 'Choose at least one category.',
};

export function adjustmentErrorText(error: AdjustmentInputError): string {
  return MESSAGES[error];
}

/** Converts a PHP figure to centavos for the engine. */
export function toAdjustmentCentavos(php: number): Centavos {
  return fromPhp(php);
}
