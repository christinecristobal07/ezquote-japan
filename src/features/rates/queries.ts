import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createDraft,
  deleteDraft,
  getVersion,
  listServiceRates,
  listVersionHistory,
  publishVersion,
  saveDraft,
  setInactive,
  type DraftAddon,
  type DraftFields,
} from '@/data/repositories/rateRepository';
import { insertFxRate, listFxRates } from '@/data/repositories/fxRepository';
import {
  insertCategoryMarkup,
  insertServiceMarkup,
  listCategoryMarkups,
  listServiceMarkups,
} from '@/data/repositories/markupRepository';
import type { Database } from '@/data/database.types';
import type { DraftTier } from '@/domain';

export const rateKeys = {
  all: ['rates'] as const,
  services: () => [...rateKeys.all, 'services'] as const,
  version: (id: string) => [...rateKeys.all, 'version', id] as const,
  history: (serviceId: string) => [...rateKeys.all, 'history', serviceId] as const,
  fx: ['fx'] as const,
  categoryMarkups: ['markups', 'category'] as const,
  serviceMarkups: ['markups', 'service'] as const,
};

/** A rate change moves the goalposts for every screen in this step. */
async function invalidateRates(client: QueryClient, serviceId?: string): Promise<void> {
  await client.invalidateQueries({ queryKey: rateKeys.all });
  if (serviceId !== undefined) {
    await client.invalidateQueries({ queryKey: rateKeys.history(serviceId) });
  }
}

export function useServiceRates() {
  return useQuery({ queryKey: rateKeys.services(), queryFn: listServiceRates });
}

export function useRateVersion(versionId: string | null) {
  return useQuery({
    queryKey: rateKeys.version(versionId ?? 'none'),
    queryFn: () => getVersion(versionId ?? ''),
    enabled: versionId !== null,
  });
}

export function useVersionHistory(serviceId: string) {
  return useQuery({
    queryKey: rateKeys.history(serviceId),
    queryFn: () => listVersionHistory(serviceId),
  });
}

export function useCreateDraft(serviceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fromVersionId?: string) => createDraft(serviceId, fromVersionId),
    onSuccess: () => invalidateRates(client, serviceId),
  });
}

export interface SaveDraftInput {
  readonly versionId: string;
  readonly fields: DraftFields;
  readonly tiers: readonly DraftTier[];
  readonly addons: readonly DraftAddon[];
}

export function useSaveDraft(serviceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveDraftInput) =>
      saveDraft(input.versionId, input.fields, input.tiers, input.addons),
    onSuccess: () => invalidateRates(client, serviceId),
  });
}

export function usePublishVersion(serviceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => publishVersion(versionId),
    onSuccess: () => invalidateRates(client, serviceId),
  });
}

export function useSetInactive(serviceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => setInactive(versionId),
    onSuccess: () => invalidateRates(client, serviceId),
  });
}

export function useDeleteDraft(serviceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => deleteDraft(versionId),
    onSuccess: () => invalidateRates(client, serviceId),
  });
}

// -----------------------------------------------------------------------------
// FX and markups
// -----------------------------------------------------------------------------
export function useFxRates() {
  return useQuery({ queryKey: rateKeys.fx, queryFn: listFxRates });
}

export function useInsertFxRate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      currency: Database['public']['Enums']['currency_code'];
      phpPerUnit: number;
      effectiveFrom: string;
    }) => insertFxRate(input.currency, input.phpPerUnit, input.effectiveFrom),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: rateKeys.fx });
      await client.invalidateQueries({ queryKey: rateKeys.all });
    },
  });
}

export function useCategoryMarkups() {
  return useQuery({ queryKey: rateKeys.categoryMarkups, queryFn: listCategoryMarkups });
}

export function useServiceMarkups() {
  return useQuery({ queryKey: rateKeys.serviceMarkups, queryFn: listServiceMarkups });
}

export function useInsertCategoryMarkup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      paxCategory: Database['public']['Enums']['pax_category'];
      markupType: Database['public']['Enums']['markup_type'];
      value: number;
      effectiveFrom: string;
    }) =>
      insertCategoryMarkup(input.paxCategory, input.markupType, input.value, input.effectiveFrom),
    onSuccess: () => client.invalidateQueries({ queryKey: rateKeys.categoryMarkups }),
  });
}

export function useInsertServiceMarkup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      serviceType: Database['public']['Enums']['service_type'];
      markupType: Database['public']['Enums']['markup_type'];
      value: number;
      effectiveFrom: string;
    }) =>
      insertServiceMarkup(input.serviceType, input.markupType, input.value, input.effectiveFrom),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: rateKeys.serviceMarkups });
      await client.invalidateQueries({ queryKey: rateKeys.all });
    },
  });
}
