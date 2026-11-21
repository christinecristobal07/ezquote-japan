import type { QuotationStatusFilter } from '@/domain';

export const STATUS_LABELS: Readonly<Record<QuotationStatusFilter, string>> = {
  draft: 'Draft',
  sent: 'Sent',
  archived: 'Archived',
};
