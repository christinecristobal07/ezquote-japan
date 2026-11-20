import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import { toRateError } from './rateRepository';

type Currency = Database['public']['Enums']['currency_code'];

export interface FxRateRow {
  readonly id: string;
  readonly currency: Currency;
  readonly phpPerUnit: number;
  readonly effectiveFrom: string;
  readonly createdAt: string;
  readonly createdByName: string | null;
}

interface RawFx {
  id: string;
  currency: Currency;
  php_per_unit: number;
  effective_from: string;
  created_at: string;
  created_by_profile: { full_name: string } | null;
}

/** fx_rates is append-only: this is the full history, newest first. */
export async function listFxRates(): Promise<readonly FxRateRow[]> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select(
      'id, currency, php_per_unit, effective_from, created_at, created_by_profile:profiles!fx_rates_created_by_fkey ( full_name )',
    )
    .order('effective_from', { ascending: false })
    .overrideTypes<RawFx[], { merge: false }>();
  if (error) throw toRateError(error);

  return data.map((row) => ({
    id: row.id,
    currency: row.currency,
    phpPerUnit: row.php_per_unit,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    createdByName: row.created_by_profile?.full_name ?? null,
  }));
}

/** A "change" is a new row; nothing is ever updated. */
export async function insertFxRate(
  currency: Currency,
  phpPerUnit: number,
  effectiveFrom: string,
): Promise<void> {
  const { error } = await supabase
    .from('fx_rates')
    .insert({ currency, php_per_unit: phpPerUnit, effective_from: effectiveFrom });
  if (error) throw toRateError(error);
}
