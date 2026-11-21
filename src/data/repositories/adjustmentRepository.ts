import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import type { AdjustmentKind, AdjustmentRecord } from '@/domain';
import { ContentError, toContentError } from './contentRepository';

type Currency = Database['public']['Enums']['currency_code'];
type PaxCategory = Database['public']['Enums']['pax_category'];

const COLUMNS =
  'id, pax_category, kind, amount, currency, reason, created_at, created_by_name, reverses_id, amount_per_night, nights';

interface RawAdjustment {
  id: string;
  pax_category: PaxCategory;
  kind: AdjustmentKind;
  amount: number;
  amount_per_night: number | null;
  nights: number | null;
  currency: Currency;
  reason: string;
  created_at: string;
  created_by_name: string | null;
  reverses_id: string | null;
}

function toRecord(row: RawAdjustment): AdjustmentRecord {
  return {
    id: row.id,
    paxCategory: row.pax_category,
    kind: row.kind,
    amount: row.amount,
    amountPerNight: row.amount_per_night,
    nights: row.nights,
    currency: row.currency,
    reason: row.reason,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    reversesId: row.reverses_id,
  };
}

export async function listAdjustments(quotationId: string): Promise<readonly AdjustmentRecord[]> {
  const { data, error } = await supabase
    .from('quotation_adjustments')
    .select(COLUMNS)
    .eq('quotation_id', quotationId)
    .order('created_at')
    .overrideTypes<RawAdjustment[], { merge: false }>();
  if (error) throw toContentError(error);
  return data.map(toRecord);
}

export interface NewAdjustment {
  readonly paxCategory: PaxCategory;
  readonly kind: AdjustmentKind;
  /** The stay total, which is what the ledger and the engine read. */
  readonly amount: number;
  readonly currency: Currency;
  readonly reason: string;
  /**
   * Set together, and only for a hotel entry: the nightly rate the agent
   * typed and the nights it was multiplied by. Recording them lets the total
   * follow the trip when its length changes, as the Excel does.
   */
  readonly amountPerNight?: number | null;
  readonly nights?: number | null;
}

/**
 * Inserts every row in one call, so "all selected categories" either lands
 * completely or not at all. created_by and created_by_name are set by
 * triggers; anything sent for them would be discarded.
 */
export async function addAdjustments(
  quotationId: string,
  entries: readonly NewAdjustment[],
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await supabase.from('quotation_adjustments').insert(
    entries.map((entry) => ({
      quotation_id: quotationId,
      pax_category: entry.paxCategory,
      kind: entry.kind,
      amount: entry.amount,
      amount_per_night: entry.amountPerNight ?? null,
      nights: entry.nights ?? null,
      currency: entry.currency,
      reason: entry.reason,
    })),
  );
  if (error) throw toContentError(error);
}

/**
 * Cancels an entry with its exact negative. The database checks the match, so
 * a drifted amount is refused rather than silently stored.
 */
export async function reverseAdjustment(
  quotationId: string,
  entry: AdjustmentRecord,
  reason: string,
): Promise<void> {
  if (entry.reversesId !== null) {
    throw new ContentError('A reversal cannot itself be reversed. Add a new entry instead.');
  }

  const { error } = await supabase.from('quotation_adjustments').insert({
    quotation_id: quotationId,
    pax_category: entry.paxCategory as PaxCategory,
    kind: entry.kind,
    amount: -entry.amount,
    // The guard refuses a reversal that does not negate these too.
    amount_per_night: entry.amountPerNight === null ? null : -entry.amountPerNight,
    nights: entry.nights,
    currency: entry.currency,
    reason,
    reverses_id: entry.id,
  });
  if (error) throw toContentError(error);
}
