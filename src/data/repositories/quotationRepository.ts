import { z } from 'zod';
import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import {
  DEFAULT_QUOTATION_FILTERS,
  PAGE_SIZE,
  parseSnapshot,
  type QuotationFilters,
  type RateSnapshot,
} from '@/domain';
import { ConflictError, ContentError, toContentError } from './contentRepository';

type BookingStatus = Database['public']['Enums']['booking_status'];
type DurationMode = Database['public']['Enums']['duration_mode'];
type PaxCategory = Database['public']['Enums']['pax_category'];

export interface QuotationHeader {
  readonly id: string;
  readonly referenceNo: string;
  readonly agentId: string;
  readonly packageTitle: string | null;
  readonly seasonLabel: string | null;
  readonly clientName: string | null;
  readonly travelDate: string | null;
  readonly hotelCategory: number | null;
  readonly durationMode: DurationMode;
  readonly durationDays: number;
  readonly paxAdults: number;
  readonly paxChildren: number;
  readonly outputCategories: readonly PaxCategory[];
  readonly bookingStatus: BookingStatus;
  readonly airfarePhp: number;
  readonly packageMarkupType: 'fixed' | 'percent' | null;
  readonly packageMarkupValue: number | null;
  readonly status: Database['public']['Enums']['quotation_status'];
  readonly ratesAsOf: string;
  readonly updatedAt: string;
}

export interface QuotationServiceRow {
  readonly id: string;
  readonly serviceId: string;
  readonly dayNumber: number | null;
  readonly sortOrder: number;
  readonly addonIds: readonly string[];
}

export interface QuotationHotelRow {
  readonly id: string;
  readonly hotelId: string | null;
  readonly customName: string | null;
  readonly sortOrder: number;
}

export interface QuotationDetail {
  readonly header: QuotationHeader;
  readonly snapshot: RateSnapshot;
  readonly services: readonly QuotationServiceRow[];
  readonly hotels: readonly QuotationHotelRow[];
}

const HEADER_COLUMNS =
  'id, reference_no, agent_id, package_title, season_label, client_name, travel_date, hotel_category, duration_mode, duration_days, pax_adults, pax_children, output_categories, booking_status, airfare_php, package_markup_type, package_markup_value, status, rates_as_of, snapshot, updated_at';

interface RawHeader {
  id: string;
  reference_no: string;
  agent_id: string;
  package_title: string | null;
  season_label: string | null;
  client_name: string | null;
  travel_date: string | null;
  hotel_category: number | null;
  duration_mode: DurationMode;
  duration_days: number;
  pax_adults: number;
  pax_children: number;
  output_categories: PaxCategory[];
  booking_status: BookingStatus;
  airfare_php: number;
  package_markup_type: 'fixed' | 'percent' | null;
  package_markup_value: number | null;
  status: Database['public']['Enums']['quotation_status'];
  rates_as_of: string;
  snapshot: unknown;
  updated_at: string;
}

function toHeader(row: RawHeader): QuotationHeader {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    agentId: row.agent_id,
    packageTitle: row.package_title,
    seasonLabel: row.season_label,
    clientName: row.client_name,
    travelDate: row.travel_date,
    hotelCategory: row.hotel_category,
    durationMode: row.duration_mode,
    durationDays: row.duration_days,
    paxAdults: row.pax_adults,
    paxChildren: row.pax_children,
    outputCategories: row.output_categories,
    bookingStatus: row.booking_status,
    airfarePhp: row.airfare_php,
    packageMarkupType: row.package_markup_type,
    packageMarkupValue: row.package_markup_value,
    status: row.status,
    ratesAsOf: row.rates_as_of,
    updatedAt: row.updated_at,
  };
}

export interface CreateQuotationInput {
  readonly clientName: string | null;
  readonly travelDate: string | null;
  readonly paxAdults: number;
  readonly paxChildren: number;
  readonly hotelCategory: number;
}

/**
 * Inserting the row is what builds the snapshot: a trigger freezes the FX,
 * markups and every published rate into quotations.snapshot. Nothing in the
 * client decides those values.
 */
export async function createQuotation(input: CreateQuotationInput): Promise<QuotationHeader> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (userId === undefined) throw new ContentError('Your session has ended. Please sign in again.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError !== null || profile === null) {
    throw new ContentError('Could not find your profile.');
  }

  const { data, error } = await supabase
    .from('quotations')
    .insert({
      // The BEFORE INSERT trigger overwrites this with JPN-YYYY-NNNNNN;
      // the column is NOT NULL, so a value has to be supplied here.
      reference_no: '',
      agent_id: profile.id,
      client_name: input.clientName,
      travel_date: input.travelDate,
      pax_adults: input.paxAdults,
      pax_children: input.paxChildren,
      hotel_category: input.hotelCategory,
    })
    .select(HEADER_COLUMNS)
    .single<RawHeader>();

  if (error) throw toContentError(error);
  return toHeader(data);
}

export async function getQuotation(id: string): Promise<QuotationDetail | null> {
  const { data, error } = await supabase
    .from('quotations')
    .select(HEADER_COLUMNS)
    .eq('id', id)
    .maybeSingle<RawHeader>();
  if (error) throw toContentError(error);
  if (data === null) return null;

  const [servicesResult, addonsResult, hotelsResult] = await Promise.all([
    supabase
      .from('quotation_services')
      .select('id, service_id, day_number, sort_order')
      .eq('quotation_id', id)
      .order('sort_order'),
    supabase.from('quotation_service_addons').select('quotation_service_id, addon_id'),
    supabase
      .from('quotation_hotels')
      .select('id, hotel_id, custom_name, sort_order')
      .eq('quotation_id', id)
      .order('sort_order'),
  ]);

  if (servicesResult.error) throw toContentError(servicesResult.error);
  if (addonsResult.error) throw toContentError(addonsResult.error);
  if (hotelsResult.error) throw toContentError(hotelsResult.error);

  const addonsByRow = new Map<string, string[]>();
  for (const addon of addonsResult.data) {
    addonsByRow.set(addon.quotation_service_id, [
      ...(addonsByRow.get(addon.quotation_service_id) ?? []),
      addon.addon_id,
    ]);
  }

  return {
    header: toHeader(data),
    snapshot: parseSnapshot(data.snapshot),
    services: servicesResult.data.map((row) => ({
      id: row.id,
      serviceId: row.service_id,
      dayNumber: row.day_number,
      sortOrder: row.sort_order,
      addonIds: addonsByRow.get(row.id) ?? [],
    })),
    hotels: hotelsResult.data.map((row) => ({
      id: row.id,
      hotelId: row.hotel_id,
      customName: row.custom_name,
      sortOrder: row.sort_order,
    })),
  };
}

export type QuotationPatch = Partial<{
  packageTitle: string | null;
  seasonLabel: string | null;
  clientName: string | null;
  travelDate: string | null;
  hotelCategory: number | null;
  durationMode: DurationMode;
  durationDays: number;
  paxAdults: number;
  paxChildren: number;
  outputCategories: readonly PaxCategory[];
  bookingStatus: BookingStatus;
}>;

export async function updateQuotation(
  id: string,
  loadedUpdatedAt: string,
  patch: QuotationPatch,
): Promise<QuotationHeader> {
  const payload: Database['public']['Tables']['quotations']['Update'] = {};
  if ('packageTitle' in patch) payload.package_title = patch.packageTitle;
  if ('seasonLabel' in patch) payload.season_label = patch.seasonLabel;
  if ('clientName' in patch) payload.client_name = patch.clientName;
  if ('travelDate' in patch) payload.travel_date = patch.travelDate;
  if ('hotelCategory' in patch) payload.hotel_category = patch.hotelCategory;
  if ('durationMode' in patch) payload.duration_mode = patch.durationMode;
  if ('durationDays' in patch) payload.duration_days = patch.durationDays;
  if ('paxAdults' in patch) payload.pax_adults = patch.paxAdults;
  if ('paxChildren' in patch) payload.pax_children = patch.paxChildren;
  const categories = patch.outputCategories;
  if (categories !== undefined) payload.output_categories = [...categories];
  if ('bookingStatus' in patch) payload.booking_status = patch.bookingStatus;

  const { data, error } = await supabase
    .from('quotations')
    .update(payload)
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(HEADER_COLUMNS)
    .overrideTypes<RawHeader[], { merge: false }>();

  if (error) throw toContentError(error);
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toHeader(row);
}

export interface ServiceSelection {
  readonly serviceId: string;
  readonly dayNumber: number | null;
  readonly sortOrder: number;
  readonly addonIds: readonly string[];
}

export async function setServices(
  quotationId: string,
  items: readonly ServiceSelection[],
): Promise<void> {
  const { error } = await supabase.rpc('set_quotation_services', {
    p_quotation_id: quotationId,
    p_items: items.map((item) => ({
      serviceId: item.serviceId,
      dayNumber: item.dayNumber,
      sortOrder: item.sortOrder,
      addonIds: [...item.addonIds],
    })),
  });
  if (error) throw toContentError(error);
}

export interface HotelSelection {
  readonly hotelId: string | null;
  readonly customName: string | null;
}

export async function setHotels(
  quotationId: string,
  hotels: readonly HotelSelection[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('quotation_hotels')
    .delete()
    .eq('quotation_id', quotationId);
  if (deleteError) throw toContentError(deleteError);

  if (hotels.length === 0) return;

  const { error } = await supabase.from('quotation_hotels').insert(
    hotels.map((hotel, index) => ({
      quotation_id: quotationId,
      hotel_id: hotel.hotelId,
      custom_name: hotel.customName,
      sort_order: index + 1,
    })),
  );
  if (error) throw toContentError(error);
}

export interface PricingPatch {
  readonly airfarePhp: number;
  readonly packageMarkupType: 'fixed' | 'percent' | null;
  readonly packageMarkupValue: number | null;
}

/** Airfare and the package markup live on the quotation row, not the ledger. */
export async function updatePricing(
  id: string,
  loadedUpdatedAt: string,
  patch: PricingPatch,
): Promise<QuotationHeader> {
  const { data, error } = await supabase
    .from('quotations')
    .update({
      airfare_php: patch.airfarePhp,
      package_markup_type: patch.packageMarkupType,
      package_markup_value: patch.packageMarkupValue,
    })
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(HEADER_COLUMNS)
    .overrideTypes<RawHeader[], { merge: false }>();

  if (error) throw toContentError(error);
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toHeader(row);
}

// -----------------------------------------------------------------------------
// History list
// -----------------------------------------------------------------------------

export interface QuotationListRow {
  readonly id: string;
  readonly referenceNo: string;
  readonly agentId: string;
  readonly agentName: string | null;
  readonly clientName: string | null;
  readonly packageTitle: string | null;
  readonly travelDate: string | null;
  readonly durationDays: number;
  readonly paxTotal: number;
  readonly hotelCategory: number | null;
  readonly status: Database['public']['Enums']['quotation_status'];
  readonly bookingStatus: BookingStatus;
  readonly ratesAsOf: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QuotationPage {
  readonly rows: readonly QuotationListRow[];
  /** Total matching rows, so the UI can show "26-50 of 184". */
  readonly total: number;
}

const LIST_COLUMNS =
  'id, reference_no, agent_id, client_name, package_title, travel_date, duration_days, pax_total, hotel_category, status, booking_status, rates_as_of, created_at, updated_at, agent:profiles!quotations_agent_id_fkey ( full_name )';

interface RawListRow {
  id: string;
  reference_no: string;
  agent_id: string;
  client_name: string | null;
  package_title: string | null;
  travel_date: string | null;
  duration_days: number;
  pax_total: number;
  hotel_category: number | null;
  status: Database['public']['Enums']['quotation_status'];
  booking_status: BookingStatus;
  rates_as_of: string;
  created_at: string;
  updated_at: string;
  agent: { full_name: string } | null;
}

/** Escapes the % and _ wildcards so a search for "100%" is not a wildcard. */
function likeTerm(search: string): string {
  return `%${search.replace(/[%_\\]/g, (character) => `\\${character}`)}%`;
}

/**
 * One page of quotation history.
 *
 * RLS decides which rows exist at all — an agent sees their own, a supervisor
 * their team's, a manager everything — so this never filters by viewer. The
 * count and the slice both come from the server: a supervisor with hundreds of
 * team quotes must not pull them all into the browser to show 25.
 */
export async function listQuotations(filters: QuotationFilters): Promise<QuotationPage> {
  let query = supabase
    .from('quotations')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order(filters.sort, { ascending: filters.direction === 'asc', nullsFirst: false })
    // A stable tie-break, so paging cannot show the same row twice.
    .order('id');

  if (filters.search !== '') {
    const term = likeTerm(filters.search);
    query = query.or(
      `reference_no.ilike.${term},client_name.ilike.${term},package_title.ilike.${term}`,
    );
  }
  if (filters.statuses.length > 0) query = query.in('status', [...filters.statuses]);
  if (filters.agentId !== '') query = query.eq('agent_id', filters.agentId);
  if (filters.from !== '') query = query.gte('travel_date', filters.from);
  if (filters.to !== '') query = query.lte('travel_date', filters.to);

  const first = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .range(first, first + PAGE_SIZE - 1)
    .overrideTypes<RawListRow[], { merge: false }>();

  if (error) throw toContentError(error);

  return {
    rows: data.map((row) => ({
      id: row.id,
      referenceNo: row.reference_no,
      agentId: row.agent_id,
      agentName: row.agent?.full_name ?? null,
      clientName: row.client_name,
      packageTitle: row.package_title,
      travelDate: row.travel_date,
      durationDays: row.duration_days,
      paxTotal: row.pax_total,
      hotelCategory: row.hotel_category,
      status: row.status,
      bookingStatus: row.booking_status,
      ratesAsOf: row.rates_as_of,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    total: count ?? 0,
  };
}

/** The newest few, for the dashboard card. */
export async function listRecentQuotations(limit = 5): Promise<readonly QuotationListRow[]> {
  const page = await listQuotations({
    ...DEFAULT_QUOTATION_FILTERS,
    statuses: ['draft', 'sent'],
  });
  return page.rows.slice(0, limit);
}

/** How many quotations were created in the last `days` days, for managers. */
export async function countQuotationsSince(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (error) throw toContentError(error);
  return count ?? 0;
}

/**
 * Archive or restore. Archiving is reversible and keeps the row: a quotation is
 * a record of what was quoted to a client, so nothing here deletes one.
 */
export async function setQuotationStatus(
  id: string,
  loadedUpdatedAt: string,
  status: Database['public']['Enums']['quotation_status'],
): Promise<QuotationHeader> {
  const { data, error } = await supabase
    .from('quotations')
    .update({ status })
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(HEADER_COLUMNS)
    .overrideTypes<RawHeader[], { merge: false }>();

  if (error) throw toContentError(error);
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toHeader(row);
}

// -----------------------------------------------------------------------------
// Requote
// -----------------------------------------------------------------------------

export interface DuplicateResult {
  readonly id: string;
  readonly referenceNo: string;
  /** Services dropped because they are no longer published or have expired. */
  readonly skippedServices: readonly string[];
  readonly skippedAddons: readonly string[];
}

const duplicateShape = z.object({
  id: z.string().min(1),
  referenceNo: z.string().min(1),
  skippedServices: z.array(z.string()),
  skippedAddons: z.array(z.string()),
});

/**
 * Copies a quotation, priced at today's rates.
 *
 * The copy gets a fresh snapshot, which is the point of a requote. Anything no
 * longer on sale cannot be carried over, so the function reports what it left
 * behind and the UI tells the agent rather than silently shipping a thinner
 * quote.
 */
export async function duplicateQuotation(id: string): Promise<DuplicateResult> {
  const { data, error } = await supabase.rpc('duplicate_quotation', { p_quotation_id: id });
  if (error) throw toContentError(error);

  const parsed = duplicateShape.safeParse(data);
  if (!parsed.success) throw new ContentError('The copy was made, but could not be read back.');
  return parsed.data;
}

/**
 * A snapshot of the rates in force right now, built by the same SQL that
 * freezes one into a new quotation. Used only for the comparison panel.
 */
export async function previewCurrentSnapshot(): Promise<RateSnapshot> {
  const { data, error } = await supabase.rpc('preview_current_snapshot');
  if (error) throw toContentError(error);
  return parseSnapshot(data);
}
