import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createQuotation,
  getQuotation,
  setHotels,
  setServices,
  updateQuotation,
  type CreateQuotationInput,
  type HotelSelection,
  type QuotationPatch,
  type ServiceSelection,
} from '@/data/repositories/quotationRepository';

export const quotationKeys = {
  all: ['quotations'] as const,
  one: (id: string) => [...quotationKeys.all, id] as const,
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
