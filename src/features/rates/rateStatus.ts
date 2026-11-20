import { currentAndScheduled, toScaledRate, type FxTable } from '@/domain';
import type { FxRateRow } from '@/data/repositories/fxRepository';

export const DAYS_BEFORE_EXPIRY_WARNING = 60;

export type RateStatusLabel = 'Published' | 'Draft pending' | 'Scheduled' | 'No rate' | 'Expired';

export interface StatusInput {
  readonly hasPublished: boolean;
  readonly hasDraft: boolean;
  readonly effectiveFrom: string | null;
  readonly validUntil: string | null;
}

export function rateStatus(input: StatusInput, now: Date): RateStatusLabel {
  if (input.hasDraft) return 'Draft pending';
  if (!input.hasPublished) return 'No rate';
  if (input.effectiveFrom !== null && new Date(input.effectiveFrom).getTime() > now.getTime()) {
    return 'Scheduled';
  }
  if (input.validUntil !== null && new Date(`${input.validUntil}T23:59:59Z`) < now)
    return 'Expired';
  return 'Published';
}

/** Days until a validity date; negative once it has passed. */
export function daysUntil(date: string | null, now: Date): number | null {
  if (date === null) return null;
  const end = new Date(`${date}T23:59:59Z`).getTime();
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

/** Builds the scaled FX table the domain helpers expect from the current rows. */
export function fxTableFrom(rows: readonly FxRateRow[], now: Date): FxTable {
  const table: Record<string, number> = { PHP: toScaledRate(1, 'PHP') };
  const byCurrency = new Map<string, FxRateRow[]>();
  for (const row of rows) {
    byCurrency.set(row.currency, [...(byCurrency.get(row.currency) ?? []), row]);
  }
  for (const [currency, currencyRows] of byCurrency) {
    const { current } = currentAndScheduled(currencyRows, now);
    if (current) table[currency] = toScaledRate(current.phpPerUnit, currency);
  }
  return table;
}

export function formatDateTime(value: string | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

/** A datetime-local input value for "now", in Manila time. */
export function nowLocalInput(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Manila',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
