import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';

type ContentType = Database['public']['Enums']['content_type'];
type ServiceType = Database['public']['Enums']['service_type'];
type TransferDirection = Database['public']['Enums']['transfer_direction'];

export class ContentError extends Error {
  override readonly name = 'ContentError';
}

/** Raised when a row changed under us; the UI tells the user to reload. */
export class ConflictError extends ContentError {
  constructor() {
    super('This item was changed by someone else. Reload to see the latest.');
  }
}

/**
 * Turns Postgres constraint codes into something a manager can act on.
 * `context` lets the caller name the thing, e.g. "A hotel with this name".
 */
export function toContentError(error: PostgrestError, context?: string): ContentError {
  switch (error.code) {
    case '23505':
      return new ContentError(context ?? 'That name is already taken.');
    case '23503':
      return new ContentError(
        'This item is used by existing quotations. Deactivate it instead of deleting it.',
      );
    case '23514':
      return new ContentError('Some values are outside the allowed range. Check the form.');
    case '42501':
      return new ContentError('You do not have permission to change content.');
    case 'P0001':
      return new ContentError(error.message.replace(/^.*?:\s*/, ''));
    default:
      if (/row-level security/i.test(error.message)) {
        return new ContentError('You do not have permission to change content.');
      }
      return new ContentError('Could not save. Please try again.');
  }
}

// -----------------------------------------------------------------------------
// Content items
// -----------------------------------------------------------------------------
export interface ContentItem {
  readonly id: string;
  readonly contentType: ContentType;
  readonly body: string;
  readonly conditionServiceId: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly updatedAt: string;
}

interface RawContent {
  id: string;
  content_type: ContentType;
  body: string;
  condition_service_id: string | null;
  sort_order: number;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
  updated_at: string;
}

const CONTENT_COLUMNS =
  'id, content_type, body, condition_service_id, sort_order, is_active, starts_on, ends_on, updated_at';

function toContentItem(row: RawContent): ContentItem {
  return {
    id: row.id,
    contentType: row.content_type,
    body: row.body,
    conditionServiceId: row.condition_service_id,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    updatedAt: row.updated_at,
  };
}

export async function listContentItems(): Promise<readonly ContentItem[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select(CONTENT_COLUMNS)
    .order('content_type')
    .order('sort_order')
    .overrideTypes<RawContent[], { merge: false }>();
  if (error) throw toContentError(error);
  return data.map(toContentItem);
}

export interface ContentItemInput {
  readonly contentType: ContentType;
  readonly body: string;
  readonly conditionServiceId: string | null;
  readonly isActive: boolean;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly sortOrder?: number;
}

export async function createContentItem(input: ContentItemInput): Promise<ContentItem> {
  const { data, error } = await supabase
    .from('content_items')
    .insert({
      content_type: input.contentType,
      body: input.body,
      condition_service_id: input.conditionServiceId,
      is_active: input.isActive,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      sort_order: input.sortOrder ?? 0,
    })
    .select(CONTENT_COLUMNS)
    .single<RawContent>();
  if (error) throw toContentError(error);
  return toContentItem(data);
}

/**
 * Updates only if the row still carries the `updated_at` we loaded.
 * Zero rows back means someone else saved first.
 */
export async function updateContentItem(
  id: string,
  loadedUpdatedAt: string,
  input: Omit<ContentItemInput, 'contentType'>,
): Promise<ContentItem> {
  const { data, error } = await supabase
    .from('content_items')
    .update({
      body: input.body,
      condition_service_id: input.conditionServiceId,
      is_active: input.isActive,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
    })
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(CONTENT_COLUMNS)
    .overrideTypes<RawContent[], { merge: false }>();
  if (error) throw toContentError(error);
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toContentItem(row);
}

export async function deleteContentItem(id: string): Promise<void> {
  const { error } = await supabase.from('content_items').delete().eq('id', id);
  if (error) throw toContentError(error);
}

export async function reorderContent(
  contentType: ContentType,
  ids: readonly string[],
): Promise<void> {
  const { error } = await supabase.rpc('reorder_content', {
    p_type: contentType,
    p_ids: [...ids],
  });
  if (error) throw toContentError(error);
}

// -----------------------------------------------------------------------------
// Services (metadata only — prices live in Step 11's screens)
// -----------------------------------------------------------------------------
export interface ServiceMeta {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly serviceType: ServiceType;
  readonly cityId: string | null;
  readonly operatorId: string | null;
  readonly description: string | null;
  readonly itineraryTitle: string | null;
  readonly itineraryText: string | null;
  readonly inclusionText: string | null;
  readonly consumesDay: boolean;
  readonly addsNight: boolean;
  readonly transferDirection: TransferDirection | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly updatedAt: string;
}

interface RawService {
  id: string;
  code: string;
  name: string;
  service_type: ServiceType;
  city_id: string | null;
  operator_id: string | null;
  description: string | null;
  itinerary_title: string | null;
  itinerary_text: string | null;
  inclusion_text: string | null;
  consumes_day: boolean;
  adds_night: boolean;
  transfer_direction: TransferDirection | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
}

const SERVICE_COLUMNS =
  'id, code, name, service_type, city_id, operator_id, description, itinerary_title, itinerary_text, inclusion_text, consumes_day, adds_night, transfer_direction, sort_order, is_active, updated_at';

function toServiceMeta(row: RawService): ServiceMeta {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    serviceType: row.service_type,
    cityId: row.city_id,
    operatorId: row.operator_id,
    description: row.description,
    itineraryTitle: row.itinerary_title,
    itineraryText: row.itinerary_text,
    inclusionText: row.inclusion_text,
    consumesDay: row.consumes_day,
    addsNight: row.adds_night,
    transferDirection: row.transfer_direction,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

export async function listServiceMeta(): Promise<readonly ServiceMeta[]> {
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_COLUMNS)
    .order('service_type')
    .order('sort_order')
    .overrideTypes<RawService[], { merge: false }>();
  if (error) throw toContentError(error);
  return data.map(toServiceMeta);
}

export type ServiceInput = Omit<ServiceMeta, 'id' | 'updatedAt'>;

export async function createService(input: ServiceInput): Promise<ServiceMeta> {
  const { data, error } = await supabase
    .from('services')
    .insert({
      code: input.code,
      name: input.name,
      service_type: input.serviceType,
      city_id: input.cityId,
      operator_id: input.operatorId,
      description: input.description,
      itinerary_title: input.itineraryTitle,
      itinerary_text: input.itineraryText,
      inclusion_text: input.inclusionText,
      consumes_day: input.consumesDay,
      adds_night: input.addsNight,
      transfer_direction: input.transferDirection,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select(SERVICE_COLUMNS)
    .single<RawService>();
  if (error) throw toContentError(error, 'A service with this code already exists.');
  return toServiceMeta(data);
}

/** The code is immutable after creation, so it is deliberately not updated. */
export async function updateService(
  id: string,
  loadedUpdatedAt: string,
  input: Omit<ServiceInput, 'code' | 'serviceType'>,
): Promise<ServiceMeta> {
  const { data, error } = await supabase
    .from('services')
    .update({
      name: input.name,
      city_id: input.cityId,
      operator_id: input.operatorId,
      description: input.description,
      itinerary_title: input.itineraryTitle,
      itinerary_text: input.itineraryText,
      inclusion_text: input.inclusionText,
      consumes_day: input.consumesDay,
      adds_night: input.addsNight,
      transfer_direction: input.transferDirection,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(SERVICE_COLUMNS)
    .overrideTypes<RawService[], { merge: false }>();
  if (error) throw toContentError(error);
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toServiceMeta(row);
}
