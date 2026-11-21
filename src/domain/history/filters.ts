/**
 * The filters behind the quotation history and the audit log, and how they are
 * written into the address bar.
 *
 * Keeping them here, as plain data, means a filtered list is a shareable link:
 * a supervisor can paste a month of archived quotes to an agent and they see
 * the same rows. The parse side is deliberately forgiving — a hand-edited or
 * stale URL falls back to the default rather than erroring.
 */

export const QUOTATION_STATUSES = ['draft', 'sent', 'archived'] as const;
export type QuotationStatusFilter = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_SORTS = [
  'created_at',
  'reference_no',
  'travel_date',
  'client_name',
] as const;
export type QuotationSort = (typeof QUOTATION_SORTS)[number];

export type SortDirection = 'asc' | 'desc';

export const PAGE_SIZE = 25;

export interface QuotationFilters {
  /** Free text, matched against reference, client and package title. */
  readonly search: string;
  readonly statuses: readonly QuotationStatusFilter[];
  /** A profile id, or '' for everyone the viewer can see. */
  readonly agentId: string;
  /** Travel date window, as plain yyyy-mm-dd days. */
  readonly from: string;
  readonly to: string;
  readonly sort: QuotationSort;
  readonly direction: SortDirection;
  /** 1-based. */
  readonly page: number;
}

export const DEFAULT_QUOTATION_FILTERS: QuotationFilters = {
  search: '',
  statuses: [],
  agentId: '',
  from: '',
  to: '',
  sort: 'created_at',
  direction: 'desc',
  page: 1,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function day(value: string | null): string {
  return value !== null && DAY.test(value) ? value : '';
}

function pageNumber(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function parseQuotationFilters(params: URLSearchParams): QuotationFilters {
  const statuses = (params.get('status') ?? '')
    .split(',')
    .map((part) => oneOf(part, QUOTATION_STATUSES))
    .filter((status) => status !== null);

  return {
    search: (params.get('q') ?? '').trim(),
    // A status listed twice in the URL should still filter once.
    statuses: [...new Set(statuses)],
    agentId: params.get('agent') ?? '',
    from: day(params.get('from')),
    to: day(params.get('to')),
    sort: oneOf(params.get('sort'), QUOTATION_SORTS) ?? DEFAULT_QUOTATION_FILTERS.sort,
    direction: oneOf(params.get('dir'), ['asc', 'desc'] as const) ?? 'desc',
    page: pageNumber(params.get('page')),
  };
}

/** Only what differs from the default is written, so a clean list has a clean URL. */
export function quotationFiltersToParams(filters: QuotationFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search !== '') params.set('q', filters.search);
  if (filters.statuses.length > 0) params.set('status', filters.statuses.join(','));
  if (filters.agentId !== '') params.set('agent', filters.agentId);
  if (filters.from !== '') params.set('from', filters.from);
  if (filters.to !== '') params.set('to', filters.to);
  if (filters.sort !== DEFAULT_QUOTATION_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.direction !== DEFAULT_QUOTATION_FILTERS.direction) {
    params.set('dir', filters.direction);
  }
  if (filters.page !== 1) params.set('page', String(filters.page));
  return params;
}

export function hasActiveQuotationFilters(filters: QuotationFilters): boolean {
  return (
    filters.search !== '' ||
    filters.statuses.length > 0 ||
    filters.agentId !== '' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}

/** Clicking a column header sorts by it, and flips direction if already sorted. */
export function nextSort(filters: QuotationFilters, column: QuotationSort): QuotationFilters {
  if (filters.sort === column) {
    return { ...filters, direction: filters.direction === 'asc' ? 'desc' : 'asc', page: 1 };
  }
  // Newest-first reads better for dates; names read better A to Z.
  const direction: SortDirection =
    column === 'reference_no' || column === 'client_name' ? 'asc' : 'desc';
  return { ...filters, sort: column, direction, page: 1 };
}

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------

export const AUDIT_PRESETS = ['all', 'rates', 'change_rate', 'agents'] as const;
export type AuditPreset = (typeof AUDIT_PRESETS)[number];

export const AUDIT_PRESET_LABELS: Readonly<Record<AuditPreset, string>> = {
  all: 'All changes',
  rates: 'Rate changes',
  change_rate: 'Change Rate entries',
  agents: 'Agents & links',
};

/**
 * Which audited tables each tab covers. 'all' is an empty list, meaning no
 * table filter at all.
 */
export const AUDIT_PRESET_TABLES: Readonly<Record<AuditPreset, readonly string[]>> = {
  all: [],
  rates: [
    'service_rate_versions',
    'service_rate_tiers',
    'service_rate_addons',
    'fx_rates',
    'category_markups',
    'service_markups',
  ],
  change_rate: ['quotation_adjustments'],
  agents: ['profiles', 'agent_survey_links'],
};

export interface AuditFilters {
  readonly preset: AuditPreset;
  /** A profile id for the person who made the change, or ''. */
  readonly actorId: string;
  /** Changed-at window, as plain yyyy-mm-dd days in Manila time. */
  readonly from: string;
  readonly to: string;
  /** One record's history, as table + id. Set by the history deep links. */
  readonly table: string;
  readonly recordId: string;
  readonly page: number;
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  preset: 'all',
  actorId: '',
  from: '',
  to: '',
  table: '',
  recordId: '',
  page: 1,
};

export function parseAuditFilters(params: URLSearchParams): AuditFilters {
  return {
    preset: oneOf(params.get('tab'), AUDIT_PRESETS) ?? 'all',
    actorId: params.get('actor') ?? '',
    from: day(params.get('from')),
    to: day(params.get('to')),
    table: params.get('table') ?? '',
    recordId: params.get('record') ?? '',
    page: pageNumber(params.get('page')),
  };
}

export function auditFiltersToParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.preset !== 'all') params.set('tab', filters.preset);
  if (filters.actorId !== '') params.set('actor', filters.actorId);
  if (filters.from !== '') params.set('from', filters.from);
  if (filters.to !== '') params.set('to', filters.to);
  if (filters.table !== '') params.set('table', filters.table);
  if (filters.recordId !== '') params.set('record', filters.recordId);
  if (filters.page !== 1) params.set('page', String(filters.page));
  return params;
}

/**
 * The tables a query should restrict to: the preset's list, narrowed to one
 * table when a record's history is being viewed.
 */
export function auditTables(filters: AuditFilters): readonly string[] {
  if (filters.table !== '') return [filters.table];
  return AUDIT_PRESET_TABLES[filters.preset];
}

export function hasActiveAuditFilters(filters: AuditFilters): boolean {
  return (
    filters.actorId !== '' || filters.from !== '' || filters.to !== '' || filters.recordId !== ''
  );
}

/** A deep link to one record's full history. */
export function recordHistoryPath(tableName: string, recordId: string): string {
  const params = auditFiltersToParams({
    ...DEFAULT_AUDIT_FILTERS,
    table: tableName,
    recordId,
  });
  return `/audit?${params.toString()}`;
}
