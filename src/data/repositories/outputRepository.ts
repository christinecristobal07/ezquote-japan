import { supabase } from '@/data/supabaseClient';
import { ConflictError, toContentError } from './contentRepository';

export interface OutputVersion {
  readonly id: string;
  readonly text: string;
  readonly fingerprint: string | null;
  readonly generatedAt: string;
  readonly generatedByName: string | null;
  readonly computedRates: unknown;
}

interface RawOutput {
  id: string;
  output_text: string;
  computed_rates: unknown;
  generated_at: string;
  generated_by_profile: { full_name: string } | null;
}

function fingerprintOf(computedRates: unknown): string | null {
  if (typeof computedRates !== 'object' || computedRates === null) return null;
  const value = (computedRates as { fingerprint?: unknown }).fingerprint;
  return typeof value === 'string' ? value : null;
}

/** Newest first: the top row is the version an agent would copy. */
export async function listVersions(quotationId: string): Promise<readonly OutputVersion[]> {
  const { data, error } = await supabase
    .from('quotation_outputs')
    .select(
      'id, output_text, computed_rates, generated_at, generated_by_profile:profiles!quotation_outputs_generated_by_fkey ( full_name )',
    )
    .eq('quotation_id', quotationId)
    .order('generated_at', { ascending: false })
    .overrideTypes<RawOutput[], { merge: false }>();
  if (error) throw toContentError(error);

  return data.map((row) => ({
    id: row.id,
    text: row.output_text,
    fingerprint: fingerprintOf(row.computed_rates),
    generatedAt: row.generated_at,
    generatedByName: row.generated_by_profile?.full_name ?? null,
    computedRates: row.computed_rates,
  }));
}

export interface SaveVersionInput {
  readonly text: string;
  readonly fingerprint: string;
  readonly rates: readonly { paxCategory: string; label: string; amount: number | null }[];
}

/**
 * quotation_outputs is append-only, so every generation is kept. That is the
 * record of what was actually sent to a client.
 */
export async function saveVersion(quotationId: string, input: SaveVersionInput): Promise<void> {
  const { error } = await supabase.from('quotation_outputs').insert({
    quotation_id: quotationId,
    output_text: input.text,
    computed_rates: {
      fingerprint: input.fingerprint,
      rates: input.rates,
    } as never,
  });
  if (error) throw toContentError(error);
}

/** draft → sent, on the first successful copy of the full quotation. */
export async function markSent(quotationId: string, loadedUpdatedAt: string): Promise<void> {
  const { data, error } = await supabase
    .from('quotations')
    .update({ status: 'sent' })
    .eq('id', quotationId)
    .eq('updated_at', loadedUpdatedAt)
    .eq('status', 'draft')
    .select('id');
  if (error) throw toContentError(error);
  // No row can mean "already sent", which is fine, or a concurrent edit.
  if (data.length === 0) {
    const { data: current } = await supabase
      .from('quotations')
      .select('status')
      .eq('id', quotationId)
      .maybeSingle();
    if (current?.status === 'draft') throw new ConflictError();
  }
}
