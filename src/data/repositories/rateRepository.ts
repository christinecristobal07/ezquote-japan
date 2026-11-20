import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import type { DraftTier } from '@/domain';

type VersionRow = Database['public']['Tables']['service_rate_versions']['Row'];
type Currency = Database['public']['Enums']['currency_code'];
type RateStatus = Database['public']['Enums']['rate_status'];
type ServiceType = Database['public']['Enums']['service_type'];

export class RateError extends Error {
  override readonly name = 'RateError';
}

/**
 * Trigger messages (errcode P0001) are written for people, so they are shown
 * as-is. Anything else gets a generic line rather than raw PostgREST text.
 */
export function toRateError(error: { message: string; code?: string }): RateError {
  if (error.code === 'P0001' || /append-only|locked|draft|tier|negate/i.test(error.message)) {
    return new RateError(error.message.replace(/^.*?:\s*/, ''));
  }
  if (error.code === '23P01') {
    return new RateError('Two group-size bands overlap. Adjust them and try again.');
  }
  if (error.code === '42501' || /row-level security/i.test(error.message)) {
    return new RateError('You do not have permission to change rates.');
  }
  return new RateError('Could not save the rate. Please try again.');
}

export interface RateTier {
  readonly id: string;
  readonly paxType: 'adult' | 'child';
  readonly minPax: number;
  readonly maxPax: number;
  readonly amount: number;
}

export interface RateAddon {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly defaultSelected: boolean;
  readonly sortOrder: number;
}

export interface RateVersionDetail {
  readonly id: string;
  readonly serviceId: string;
  readonly status: RateStatus;
  readonly currency: Currency;
  readonly pricingBasis: VersionRow['pricing_basis'];
  readonly effectiveFrom: string;
  readonly validUntil: string | null;
  readonly childMinAge: number | null;
  readonly childMaxAge: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly createdByName: string | null;
  readonly publishedAt: string | null;
  readonly publishedByName: string | null;
  readonly tiers: readonly RateTier[];
  readonly addons: readonly RateAddon[];
}

export interface ServiceRateSummary {
  readonly serviceId: string;
  readonly code: string;
  readonly name: string;
  readonly serviceType: ServiceType;
  readonly isActive: boolean;
  readonly published: {
    readonly id: string;
    readonly currency: Currency;
    readonly effectiveFrom: string;
    readonly validUntil: string | null;
    readonly tierCount: number;
  } | null;
  readonly draftId: string | null;
}

const VERSION_COLUMNS = `
  id, service_id, status, currency, pricing_basis, effective_from, valid_until,
  child_min_age, child_max_age, notes, created_at, published_at,
  created_by_profile:profiles!service_rate_versions_created_by_fkey ( full_name ),
  published_by_profile:profiles!service_rate_versions_published_by_fkey ( full_name ),
  service_rate_tiers ( id, pax_type, min_pax, max_pax, amount ),
  service_rate_addons ( id, name, amount, default_selected, sort_order )
`;

interface RawVersion {
  id: string;
  service_id: string;
  status: RateStatus;
  currency: Currency;
  pricing_basis: VersionRow['pricing_basis'];
  effective_from: string;
  valid_until: string | null;
  child_min_age: number | null;
  child_max_age: number | null;
  notes: string | null;
  created_at: string;
  published_at: string | null;
  created_by_profile: { full_name: string } | null;
  published_by_profile: { full_name: string } | null;
  service_rate_tiers: {
    id: string;
    pax_type: string;
    min_pax: number;
    max_pax: number;
    amount: number;
  }[];
  service_rate_addons: {
    id: string;
    name: string;
    amount: number;
    default_selected: boolean;
    sort_order: number;
  }[];
}

function toDetail(row: RawVersion): RateVersionDetail {
  return {
    id: row.id,
    serviceId: row.service_id,
    status: row.status,
    currency: row.currency,
    pricingBasis: row.pricing_basis,
    effectiveFrom: row.effective_from,
    validUntil: row.valid_until,
    childMinAge: row.child_min_age,
    childMaxAge: row.child_max_age,
    notes: row.notes,
    createdAt: row.created_at,
    createdByName: row.created_by_profile?.full_name ?? null,
    publishedAt: row.published_at,
    publishedByName: row.published_by_profile?.full_name ?? null,
    tiers: row.service_rate_tiers
      .map((tier) => ({
        id: tier.id,
        paxType: tier.pax_type === 'child' ? ('child' as const) : ('adult' as const),
        minPax: tier.min_pax,
        maxPax: tier.max_pax,
        amount: tier.amount,
      }))
      .sort((a, b) => a.paxType.localeCompare(b.paxType) || a.minPax - b.minPax),
    addons: row.service_rate_addons
      .map((addon) => ({
        id: addon.id,
        name: addon.name,
        amount: addon.amount,
        defaultSelected: addon.default_selected,
        sortOrder: addon.sort_order,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  };
}

/** One row per service, with its current published version and any draft. */
export async function listServiceRates(): Promise<readonly ServiceRateSummary[]> {
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, code, name, service_type, is_active, sort_order')
    .order('service_type')
    .order('sort_order');
  if (servicesError) throw toRateError(servicesError);

  const { data: versions, error: versionsError } = await supabase
    .from('service_rate_versions')
    .select('id, service_id, status, currency, effective_from, valid_until, service_rate_tiers(id)')
    .in('status', ['published', 'draft'])
    .order('effective_from', { ascending: false });
  if (versionsError) throw toRateError(versionsError);

  const now = Date.now();

  return services.map((service) => {
    const mine = versions.filter((version) => version.service_id === service.id);
    const draft = mine.find((version) => version.status === 'draft');
    const published = mine
      .filter((version) => version.status === 'published')
      .find((version) => new Date(version.effective_from).getTime() <= now);

    return {
      serviceId: service.id,
      code: service.code,
      name: service.name,
      serviceType: service.service_type,
      isActive: service.is_active,
      published: published
        ? {
            id: published.id,
            currency: published.currency,
            effectiveFrom: published.effective_from,
            validUntil: published.valid_until,
            tierCount: published.service_rate_tiers.length,
          }
        : null,
      draftId: draft?.id ?? null,
    };
  });
}

export async function getVersion(versionId: string): Promise<RateVersionDetail | null> {
  const { data, error } = await supabase
    .from('service_rate_versions')
    .select(VERSION_COLUMNS)
    .eq('id', versionId)
    .maybeSingle<RawVersion>();
  if (error) throw toRateError(error);
  return data === null ? null : toDetail(data);
}

/** Every version for a service, newest first, for the history panel. */
export async function listVersionHistory(serviceId: string): Promise<readonly RateVersionDetail[]> {
  const { data, error } = await supabase
    .from('service_rate_versions')
    .select(VERSION_COLUMNS)
    .eq('service_id', serviceId)
    .order('effective_from', { ascending: false })
    .overrideTypes<RawVersion[], { merge: false }>();
  if (error) throw toRateError(error);
  return data.map(toDetail);
}

export async function createDraft(serviceId: string, fromVersionId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_rate_draft', {
    p_service_id: serviceId,
    ...(fromVersionId === undefined ? {} : { p_from_version_id: fromVersionId }),
  });
  if (error) throw toRateError(error);
  return data;
}

export interface DraftFields {
  readonly effectiveFrom?: string;
  readonly validUntil?: string | null;
  readonly currency?: Currency;
  readonly childMinAge?: number | null;
  readonly childMaxAge?: number | null;
  readonly notes?: string | null;
}

export interface DraftAddon {
  readonly name: string;
  readonly amount: number;
  readonly defaultSelected: boolean;
}

export async function saveDraft(
  versionId: string,
  fields: DraftFields,
  tiers: readonly DraftTier[],
  addons: readonly DraftAddon[],
): Promise<void> {
  const { error } = await supabase.rpc('save_rate_draft', {
    p_version_id: versionId,
    p_fields: {
      ...(fields.effectiveFrom === undefined ? {} : { effective_from: fields.effectiveFrom }),
      ...(fields.validUntil === undefined ? {} : { valid_until: fields.validUntil }),
      ...(fields.currency === undefined ? {} : { currency: fields.currency }),
      ...(fields.childMinAge === undefined ? {} : { child_min_age: fields.childMinAge }),
      ...(fields.childMaxAge === undefined ? {} : { child_max_age: fields.childMaxAge }),
      ...(fields.notes === undefined ? {} : { notes: fields.notes }),
    },
    p_tiers: tiers.map((tier) => ({
      pax_type: tier.paxType,
      min_pax: tier.minPax,
      max_pax: tier.maxPax,
      amount: tier.amount,
    })),
    p_addons: addons.map((addon, index) => ({
      name: addon.name,
      amount: addon.amount,
      default_selected: addon.defaultSelected,
      sort_order: index + 1,
    })),
  });
  if (error) throw toRateError(error);
}

export async function publishVersion(versionId: string): Promise<void> {
  const { error } = await supabase
    .from('service_rate_versions')
    .update({ status: 'published' })
    .eq('id', versionId);
  if (error) throw toRateError(error);
}

export async function setInactive(versionId: string): Promise<void> {
  const { error } = await supabase
    .from('service_rate_versions')
    .update({ status: 'inactive' })
    .eq('id', versionId);
  if (error) throw toRateError(error);
}

export async function deleteDraft(versionId: string): Promise<void> {
  const { error } = await supabase.from('service_rate_versions').delete().eq('id', versionId);
  if (error) throw toRateError(error);
}
