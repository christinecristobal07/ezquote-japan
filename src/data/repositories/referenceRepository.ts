import { supabase } from '@/data/supabaseClient';
import { ConflictError, ContentError, toContentError } from './contentRepository';

// -----------------------------------------------------------------------------
// Hotels
// -----------------------------------------------------------------------------
export interface Hotel {
  readonly id: string;
  readonly cityId: string;
  readonly name: string;
  readonly starRating: number;
  readonly walkToStation: string | null;
  readonly roomTypes: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly updatedAt: string;
}

interface RawHotel {
  id: string;
  city_id: string;
  name: string;
  star_rating: number;
  walk_to_station: string | null;
  room_types: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
}

const HOTEL_COLUMNS =
  'id, city_id, name, star_rating, walk_to_station, room_types, notes, sort_order, is_active, updated_at';

function toHotel(row: RawHotel): Hotel {
  return {
    id: row.id,
    cityId: row.city_id,
    name: row.name,
    starRating: row.star_rating,
    walkToStation: row.walk_to_station,
    roomTypes: row.room_types,
    notes: row.notes,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

export async function listHotels(): Promise<readonly Hotel[]> {
  const { data, error } = await supabase
    .from('hotels')
    .select(HOTEL_COLUMNS)
    .order('star_rating')
    .order('sort_order')
    .overrideTypes<RawHotel[], { merge: false }>();
  if (error) throw toContentError(error);
  return data.map(toHotel);
}

export type HotelInput = Omit<Hotel, 'id' | 'updatedAt'>;

/** The unique key is (city_id, name), so the clash message names the city. */
function duplicateHotelMessage(cityName: string | undefined): string {
  return cityName === undefined
    ? 'A hotel with this name already exists in this city.'
    : `A hotel with this name already exists in ${cityName}.`;
}

export async function createHotel(input: HotelInput, cityName?: string): Promise<Hotel> {
  const { data, error } = await supabase
    .from('hotels')
    .insert({
      city_id: input.cityId,
      name: input.name,
      star_rating: input.starRating,
      walk_to_station: input.walkToStation,
      room_types: input.roomTypes,
      notes: input.notes,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select(HOTEL_COLUMNS)
    .single<RawHotel>();
  if (error) throw toContentError(error, duplicateHotelMessage(cityName));
  return toHotel(data);
}

export async function updateHotel(
  id: string,
  loadedUpdatedAt: string,
  input: HotelInput,
  cityName?: string,
): Promise<Hotel> {
  const { data, error } = await supabase
    .from('hotels')
    .update({
      city_id: input.cityId,
      name: input.name,
      star_rating: input.starRating,
      walk_to_station: input.walkToStation,
      room_types: input.roomTypes,
      notes: input.notes,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .eq('id', id)
    .eq('updated_at', loadedUpdatedAt)
    .select(HOTEL_COLUMNS)
    .overrideTypes<RawHotel[], { merge: false }>();
  if (error) throw toContentError(error, duplicateHotelMessage(cityName));
  const row = data[0];
  if (row === undefined) throw new ConflictError();
  return toHotel(row);
}

/**
 * Tries the delete. A hotel referenced by a quotation is protected by the
 * foreign key (on delete restrict), and the caller shows that message.
 */
export async function deleteHotel(id: string): Promise<void> {
  const { error } = await supabase.from('hotels').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new ContentError('This hotel is used in quotations; deactivate it instead.');
    }
    throw toContentError(error);
  }
}

// -----------------------------------------------------------------------------
// Cities, operators, booking sites
// -----------------------------------------------------------------------------
export interface City {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly updatedAt: string;
}

export interface Operator {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly updatedAt: string;
}

export interface BookingSite {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly updatedAt: string;
}

export async function listCities(): Promise<readonly City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, sort_order, is_active, updated_at')
    .order('sort_order')
    .overrideTypes<
      { id: string; name: string; sort_order: number; is_active: boolean; updated_at: string }[],
      { merge: false }
    >();
  if (error) throw toContentError(error);
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}

export async function upsertCity(input: {
  id?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}): Promise<void> {
  const payload = { name: input.name, sort_order: input.sortOrder, is_active: input.isActive };
  const { error } =
    input.id === undefined
      ? await supabase.from('cities').insert(payload)
      : await supabase.from('cities').update(payload).eq('id', input.id);
  if (error) throw toContentError(error, 'A city with this name already exists.');
}

export async function listOperators(): Promise<readonly Operator[]> {
  const { data, error } = await supabase
    .from('operators')
    .select('id, name, notes, is_active, updated_at')
    .order('name')
    .overrideTypes<
      { id: string; name: string; notes: string | null; is_active: boolean; updated_at: string }[],
      { merge: false }
    >();
  if (error) throw toContentError(error);
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}

export async function upsertOperator(input: {
  id?: string;
  name: string;
  notes: string | null;
  isActive: boolean;
}): Promise<void> {
  const payload = { name: input.name, notes: input.notes, is_active: input.isActive };
  const { error } =
    input.id === undefined
      ? await supabase.from('operators').insert(payload)
      : await supabase.from('operators').update(payload).eq('id', input.id);
  if (error) throw toContentError(error, 'An operator with this name already exists.');
}

export async function listBookingSites(): Promise<readonly BookingSite[]> {
  const { data, error } = await supabase
    .from('booking_sites')
    .select('id, name, url, sort_order, is_active, updated_at')
    .order('sort_order')
    .overrideTypes<
      {
        id: string;
        name: string;
        url: string;
        sort_order: number;
        is_active: boolean;
        updated_at: string;
      }[],
      { merge: false }
    >();
  if (error) throw toContentError(error);
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}

export async function upsertBookingSite(input: {
  id?: string;
  name: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
}): Promise<void> {
  const payload = {
    name: input.name,
    url: input.url,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
  const { error } =
    input.id === undefined
      ? await supabase.from('booking_sites').insert(payload)
      : await supabase.from('booking_sites').update(payload).eq('id', input.id);
  if (error) throw toContentError(error, 'A booking site with this name already exists.');
}

// -----------------------------------------------------------------------------
// App settings
// -----------------------------------------------------------------------------
export interface AppSetting {
  readonly key: string;
  readonly value: unknown;
  readonly description: string | null;
  readonly updatedAt: string;
}

export async function listAppSettings(): Promise<readonly AppSetting[]> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, description, updated_at')
    .order('key')
    .overrideTypes<
      { key: string; value: unknown; description: string | null; updated_at: string }[],
      { merge: false }
    >();
  if (error) throw toContentError(error);
  return data.map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at,
  }));
}

export async function saveAppSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value: value as never }, { onConflict: 'key' });
  if (error) throw toContentError(error);
}
