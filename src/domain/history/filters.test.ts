import { describe, expect, it } from 'vitest';
import {
  AUDIT_PRESET_TABLES,
  DEFAULT_AUDIT_FILTERS,
  DEFAULT_QUOTATION_FILTERS,
  auditFiltersToParams,
  auditTables,
  hasActiveAuditFilters,
  hasActiveQuotationFilters,
  nextSort,
  parseAuditFilters,
  parseQuotationFilters,
  quotationFiltersToParams,
  recordHistoryPath,
  type AuditFilters,
  type QuotationFilters,
} from './filters.ts';

describe('quotation filters', () => {
  it('reads the defaults from an empty URL', () => {
    expect(parseQuotationFilters(new URLSearchParams())).toEqual(DEFAULT_QUOTATION_FILTERS);
  });

  it('writes nothing for the defaults', () => {
    expect(quotationFiltersToParams(DEFAULT_QUOTATION_FILTERS).toString()).toBe('');
  });

  it('round-trips a fully populated filter set', () => {
    const filters: QuotationFilters = {
      search: 'Cruz',
      statuses: ['draft', 'sent'],
      agentId: '0f2a6f2e-0000-4000-8000-000000000001',
      from: '2026-12-01',
      to: '2027-01-31',
      sort: 'travel_date',
      direction: 'asc',
      page: 3,
    };
    const params = quotationFiltersToParams(filters);
    expect(parseQuotationFilters(new URLSearchParams(params.toString()))).toEqual(filters);
  });

  it('round-trips each sort column', () => {
    for (const sort of ['created_at', 'reference_no', 'travel_date', 'client_name'] as const) {
      const filters = { ...DEFAULT_QUOTATION_FILTERS, sort };
      expect(parseQuotationFilters(quotationFiltersToParams(filters)).sort).toBe(sort);
    }
  });

  it('trims the search text', () => {
    expect(parseQuotationFilters(new URLSearchParams('q=  Cruz  ')).search).toBe('Cruz');
  });

  it('ignores a status it does not know', () => {
    expect(parseQuotationFilters(new URLSearchParams('status=draft,nonsense')).statuses).toEqual([
      'draft',
    ]);
  });

  it('keeps a repeated status once', () => {
    expect(parseQuotationFilters(new URLSearchParams('status=sent,sent')).statuses).toEqual([
      'sent',
    ]);
  });

  it('falls back on a malformed date, sort or page', () => {
    const filters = parseQuotationFilters(
      new URLSearchParams('from=yesterday&to=2026-13&sort=secret&dir=sideways&page=0'),
    );
    expect(filters).toMatchObject({
      from: '',
      to: '',
      sort: 'created_at',
      direction: 'desc',
      page: 1,
    });
  });

  it('rejects a fractional or negative page', () => {
    expect(parseQuotationFilters(new URLSearchParams('page=2.5')).page).toBe(1);
    expect(parseQuotationFilters(new URLSearchParams('page=-4')).page).toBe(1);
  });

  it('knows when a list is filtered', () => {
    expect(hasActiveQuotationFilters(DEFAULT_QUOTATION_FILTERS)).toBe(false);
    // Sorting and paging are not filters: they do not change which rows match.
    expect(
      hasActiveQuotationFilters({ ...DEFAULT_QUOTATION_FILTERS, page: 4, direction: 'asc' }),
    ).toBe(false);
    expect(hasActiveQuotationFilters({ ...DEFAULT_QUOTATION_FILTERS, search: 'x' })).toBe(true);
    expect(hasActiveQuotationFilters({ ...DEFAULT_QUOTATION_FILTERS, statuses: ['sent'] })).toBe(
      true,
    );
  });
});

describe('nextSort', () => {
  it('flips direction when the same column is clicked again', () => {
    const once = nextSort(DEFAULT_QUOTATION_FILTERS, 'created_at');
    expect(once).toMatchObject({ sort: 'created_at', direction: 'asc' });
    expect(nextSort(once, 'created_at').direction).toBe('desc');
  });

  it('starts dates newest-first and names A to Z', () => {
    expect(nextSort(DEFAULT_QUOTATION_FILTERS, 'travel_date').direction).toBe('desc');
    expect(nextSort(DEFAULT_QUOTATION_FILTERS, 'client_name').direction).toBe('asc');
    expect(nextSort(DEFAULT_QUOTATION_FILTERS, 'reference_no').direction).toBe('asc');
  });

  it('returns to the first page, since the order changed', () => {
    const filters = { ...DEFAULT_QUOTATION_FILTERS, page: 5 };
    expect(nextSort(filters, 'client_name').page).toBe(1);
    expect(nextSort(filters, 'created_at').page).toBe(1);
  });

  it('keeps the filters that are not about ordering', () => {
    const filters = { ...DEFAULT_QUOTATION_FILTERS, search: 'Cruz', statuses: ['sent'] as const };
    expect(nextSort(filters, 'client_name')).toMatchObject({ search: 'Cruz', statuses: ['sent'] });
  });
});

describe('audit filters', () => {
  it('reads the defaults from an empty URL', () => {
    expect(parseAuditFilters(new URLSearchParams())).toEqual(DEFAULT_AUDIT_FILTERS);
  });

  it('writes nothing for the defaults', () => {
    expect(auditFiltersToParams(DEFAULT_AUDIT_FILTERS).toString()).toBe('');
  });

  it('round-trips a fully populated filter set', () => {
    const filters: AuditFilters = {
      preset: 'rates',
      actorId: '0f2a6f2e-0000-4000-8000-000000000002',
      from: '2026-11-01',
      to: '2026-11-21',
      table: 'fx_rates',
      recordId: '42',
      page: 2,
    };
    expect(parseAuditFilters(auditFiltersToParams(filters))).toEqual(filters);
  });

  it('falls back to the all tab for an unknown preset', () => {
    expect(parseAuditFilters(new URLSearchParams('tab=everything')).preset).toBe('all');
  });

  it('gives the all tab no table restriction', () => {
    expect(auditTables({ ...DEFAULT_AUDIT_FILTERS, preset: 'all' })).toEqual([]);
  });

  it('restricts each preset to its own tables', () => {
    expect(auditTables({ ...DEFAULT_AUDIT_FILTERS, preset: 'change_rate' })).toEqual([
      'quotation_adjustments',
    ]);
    expect(auditTables({ ...DEFAULT_AUDIT_FILTERS, preset: 'agents' })).toEqual([
      'profiles',
      'agent_survey_links',
    ]);
    expect(auditTables({ ...DEFAULT_AUDIT_FILTERS, preset: 'rates' })).toEqual(
      AUDIT_PRESET_TABLES.rates,
    );
  });

  it('narrows to the one table when a record history is open', () => {
    expect(auditTables({ ...DEFAULT_AUDIT_FILTERS, preset: 'rates', table: 'fx_rates' })).toEqual([
      'fx_rates',
    ]);
  });

  it('knows when the log is filtered', () => {
    expect(hasActiveAuditFilters(DEFAULT_AUDIT_FILTERS)).toBe(false);
    // The tab is navigation, not a filter the user needs a "clear" button for.
    expect(hasActiveAuditFilters({ ...DEFAULT_AUDIT_FILTERS, preset: 'rates' })).toBe(false);
    expect(hasActiveAuditFilters({ ...DEFAULT_AUDIT_FILTERS, actorId: 'x' })).toBe(true);
  });

  it('builds a deep link to one record', () => {
    expect(recordHistoryPath('fx_rates', '42')).toBe('/audit?table=fx_rates&record=42');
    expect(parseAuditFilters(new URLSearchParams('table=fx_rates&record=42'))).toMatchObject({
      table: 'fx_rates',
      recordId: '42',
    });
  });
});
