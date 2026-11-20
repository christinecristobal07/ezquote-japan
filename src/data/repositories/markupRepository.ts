import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import { toRateError } from './rateRepository';

type MarkupType = Database['public']['Enums']['markup_type'];
type PaxCategory = Database['public']['Enums']['pax_category'];
type ServiceType = Database['public']['Enums']['service_type'];

export interface MarkupRow {
  readonly id: string;
  readonly markupType: MarkupType;
  readonly value: number;
  readonly effectiveFrom: string;
  readonly createdAt: string;
  readonly createdByName: string | null;
}

export interface CategoryMarkupRow extends MarkupRow {
  readonly paxCategory: PaxCategory;
}

export interface ServiceMarkupRow extends MarkupRow {
  readonly serviceType: ServiceType;
}

interface RawMarkup {
  id: string;
  markup_type: MarkupType;
  value: number;
  effective_from: string;
  created_at: string;
  created_by_profile: { full_name: string } | null;
}

const JOIN = 'created_by_profile:profiles!%s_created_by_fkey ( full_name )';

function toRow(row: RawMarkup): MarkupRow {
  return {
    id: row.id,
    markupType: row.markup_type,
    value: row.value,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    createdByName: row.created_by_profile?.full_name ?? null,
  };
}

export async function listCategoryMarkups(): Promise<readonly CategoryMarkupRow[]> {
  const { data, error } = await supabase
    .from('category_markups')
    .select(
      `id, pax_category, markup_type, value, effective_from, created_at, ${JOIN.replace('%s', 'category_markups')}`,
    )
    .order('effective_from', { ascending: false })
    .overrideTypes<(RawMarkup & { pax_category: PaxCategory })[], { merge: false }>();
  if (error) throw toRateError(error);
  return data.map((row) => ({ ...toRow(row), paxCategory: row.pax_category }));
}

export async function listServiceMarkups(): Promise<readonly ServiceMarkupRow[]> {
  const { data, error } = await supabase
    .from('service_markups')
    .select(
      `id, service_type, markup_type, value, effective_from, created_at, ${JOIN.replace('%s', 'service_markups')}`,
    )
    .order('effective_from', { ascending: false })
    .overrideTypes<(RawMarkup & { service_type: ServiceType })[], { merge: false }>();
  if (error) throw toRateError(error);
  return data.map((row) => ({ ...toRow(row), serviceType: row.service_type }));
}

export async function insertCategoryMarkup(
  paxCategory: PaxCategory,
  markupType: MarkupType,
  value: number,
  effectiveFrom: string,
): Promise<void> {
  const { error } = await supabase.from('category_markups').insert({
    pax_category: paxCategory,
    markup_type: markupType,
    value,
    effective_from: effectiveFrom,
  });
  if (error) throw toRateError(error);
}

export async function insertServiceMarkup(
  serviceType: ServiceType,
  markupType: MarkupType,
  value: number,
  effectiveFrom: string,
): Promise<void> {
  const { error } = await supabase.from('service_markups').insert({
    service_type: serviceType,
    markup_type: markupType,
    value,
    effective_from: effectiveFrom,
  });
  if (error) throw toRateError(error);
}
