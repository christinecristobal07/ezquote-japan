import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContentItem,
  createService,
  deleteContentItem,
  listContentItems,
  listServiceMeta,
  reorderContent,
  updateContentItem,
  updateService,
  type ContentItemInput,
  type ServiceInput,
} from '@/data/repositories/contentRepository';
import {
  createHotel,
  deleteHotel,
  listAppSettings,
  listBookingSites,
  listCities,
  listHotels,
  listOperators,
  saveAppSetting,
  updateHotel,
  upsertBookingSite,
  upsertCity,
  upsertOperator,
  type HotelInput,
} from '@/data/repositories/referenceRepository';
import type { Database } from '@/data/database.types';

type ContentType = Database['public']['Enums']['content_type'];

export const contentKeys = {
  services: ['content', 'services'] as const,
  items: ['content', 'items'] as const,
  hotels: ['content', 'hotels'] as const,
  cities: ['content', 'cities'] as const,
  operators: ['content', 'operators'] as const,
  bookingSites: ['content', 'bookingSites'] as const,
  settings: ['content', 'settings'] as const,
};

// -----------------------------------------------------------------------------
export function useServiceMeta() {
  return useQuery({ queryKey: contentKeys.services, queryFn: listServiceMeta });
}

export function useSaveService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { mode: 'create'; values: ServiceInput }
        | {
            mode: 'update';
            id: string;
            updatedAt: string;
            values: Omit<ServiceInput, 'code' | 'serviceType'>;
          },
    ) =>
      input.mode === 'create'
        ? createService(input.values)
        : updateService(input.id, input.updatedAt, input.values),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.services }),
  });
}

// -----------------------------------------------------------------------------
export function useContentItems() {
  return useQuery({ queryKey: contentKeys.items, queryFn: listContentItems });
}

export function useSaveContentItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { mode: 'create'; values: ContentItemInput }
        | {
            mode: 'update';
            id: string;
            updatedAt: string;
            values: Omit<ContentItemInput, 'contentType'>;
          },
    ) =>
      input.mode === 'create'
        ? createContentItem(input.values)
        : updateContentItem(input.id, input.updatedAt, input.values),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.items }),
  });
}

export function useDeleteContentItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteContentItem(id),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.items }),
  });
}

export function useReorderContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { contentType: ContentType; ids: readonly string[] }) =>
      reorderContent(input.contentType, input.ids),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.items }),
  });
}

// -----------------------------------------------------------------------------
export function useHotels() {
  return useQuery({ queryKey: contentKeys.hotels, queryFn: listHotels });
}

export function useSaveHotel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { mode: 'create'; values: HotelInput; cityName?: string }
        | { mode: 'update'; id: string; updatedAt: string; values: HotelInput; cityName?: string },
    ) =>
      input.mode === 'create'
        ? createHotel(input.values, input.cityName)
        : updateHotel(input.id, input.updatedAt, input.values, input.cityName),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.hotels }),
  });
}

export function useDeleteHotel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHotel(id),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.hotels }),
  });
}

// -----------------------------------------------------------------------------
export function useCities() {
  return useQuery({ queryKey: contentKeys.cities, queryFn: listCities });
}

export function useSaveCity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: upsertCity,
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.cities }),
  });
}

export function useOperators() {
  return useQuery({ queryKey: contentKeys.operators, queryFn: listOperators });
}

export function useSaveOperator() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: upsertOperator,
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.operators }),
  });
}

export function useBookingSites() {
  return useQuery({ queryKey: contentKeys.bookingSites, queryFn: listBookingSites });
}

export function useSaveBookingSite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: upsertBookingSite,
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.bookingSites }),
  });
}

// -----------------------------------------------------------------------------
export function useAppSettings() {
  return useQuery({ queryKey: contentKeys.settings, queryFn: listAppSettings });
}

export function useSaveAppSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; value: unknown }) => saveAppSetting(input.key, input.value),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.settings }),
  });
}
