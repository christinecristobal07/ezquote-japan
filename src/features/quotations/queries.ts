import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAdjustments,
  listAdjustments,
  reverseAdjustment,
  type NewAdjustment,
} from '@/data/repositories/adjustmentRepository';
import type { AdjustmentRecord } from '@/domain';
import {
  createQuotation,
  getQuotation,
  setCities,
  setHotels,
  setServices,
  updatePricing,
  updateQuotation,
  type CreateQuotationInput,
  type HotelSelection,
  type QuotationPatch,
  type PricingPatch,
  type ServiceSelection,
} from '@/data/repositories/quotationRepository';

export const quotationKeys = {
  all: ['quotations'] as const,
  one: (id: string) => [...quotationKeys.all, id] as const,
  ledger: (id: string) => [...quotationKeys.all, id, 'ledger'] as const,
};

export function useQuotation(id: string) {
  return useQuery({
    queryKey: quotationKeys.one(id),
    queryFn: () => getQuotation(id),
    enabled: id !== '',
  });
}

export function useCreateQuotation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuotationInput) => createQuotation(input),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.all }),
  });
}

export function useUpdateQuotation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { updatedAt: string; patch: QuotationPatch }) =>
      updateQuotation(id, input.updatedAt, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.one(id) }),
  });
}

export function useSetServices(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (items: readonly ServiceSelection[]) => setServices(id, items),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.one(id) }),
  });
}

export function useSetHotels(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (hotels: readonly HotelSelection[]) => setHotels(id, hotels),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.one(id) }),
  });
}

export function useSetCities(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cityIds: readonly string[]) => setCities(id, cityIds),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.one(id) }),
  });
}

export function useAdjustments(id: string) {
  return useQuery({
    queryKey: quotationKeys.ledger(id),
    queryFn: () => listAdjustments(id),
    enabled: id !== '',
  });
}

export function useAddAdjustments(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entries: readonly NewAdjustment[]) => addAdjustments(id, entries),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.ledger(id) }),
  });
}

export function useReverseAdjustment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { entry: AdjustmentRecord; reason: string }) =>
      reverseAdjustment(id, input.entry, input.reason),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.ledger(id) }),
  });
}

export function useUpdatePricing(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { updatedAt: string; patch: PricingPatch }) =>
      updatePricing(id, input.updatedAt, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.one(id) }),
  });
}
