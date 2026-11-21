import { useMutation, useQuery } from '@tanstack/react-query';
import type { AuditFilters } from '@/domain';
import {
  exportAuditCsv,
  listAuditActors,
  listAuditEntries,
} from '@/data/repositories/auditRepository';
import { downloadCsv } from '@/lib/csv';

export const auditKeys = {
  list: (filters: AuditFilters) => ['audit', 'list', filters] as const,
  actors: ['audit', 'actors'] as const,
};

export function useAuditEntries(filters: AuditFilters) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => listAuditEntries(filters),
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useAuditActors() {
  return useQuery({ queryKey: auditKeys.actors, queryFn: listAuditActors, retry: false });
}

export function useAuditExport() {
  return useMutation({
    mutationFn: async (filters: AuditFilters) => {
      const csv = await exportAuditCsv(filters);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`ezquote-audit-${stamp}.csv`, csv);
    },
  });
}
