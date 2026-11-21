import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuotationFilters } from '@/domain';
import {
  countQuotationsSince,
  duplicateQuotation,
  listQuotations,
  listRecentQuotations,
  previewCurrentSnapshot,
  setQuotationStatus,
} from '@/data/repositories/quotationRepository';
import { quotationKeys } from '@/features/quotations/queries';

export const historyKeys = {
  list: (filters: QuotationFilters) => ['quotations', 'list', filters] as const,
  recent: ['quotations', 'recent'] as const,
  weekly: ['quotations', 'weekly'] as const,
  currentSnapshot: ['rates', 'currentSnapshot'] as const,
};

export function useQuotationList(filters: QuotationFilters) {
  return useQuery({
    queryKey: historyKeys.list(filters),
    queryFn: () => listQuotations(filters),
    // Paging feels broken if the table empties between pages.
    placeholderData: (previous) => previous,
  });
}

export function useRecentQuotations(limit = 5) {
  return useQuery({
    queryKey: [...historyKeys.recent, limit],
    queryFn: () => listRecentQuotations(limit),
  });
}

export function useWeeklyQuotationCount(days = 7) {
  return useQuery({
    queryKey: [...historyKeys.weekly, days],
    queryFn: () => countQuotationsSince(days),
  });
}

export function useDuplicateQuotation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateQuotation(id),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.all }),
  });
}

export function useSetQuotationStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; updatedAt: string; status: 'draft' | 'sent' | 'archived' }) =>
      setQuotationStatus(input.id, input.updatedAt, input.status),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.all }),
  });
}

/**
 * Today's rates, fetched only when the comparison panel is opened. It is not a
 * cheap query and most agents never need it.
 */
export function useCurrentSnapshot(enabled: boolean) {
  return useQuery({
    queryKey: historyKeys.currentSnapshot,
    queryFn: () => previewCurrentSnapshot(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
