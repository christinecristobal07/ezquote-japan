import { supabase } from '@/data/supabaseClient';
import type { Database } from '@/data/database.types';
import {
  PAGE_SIZE,
  auditTables,
  changedFields,
  entityLabel,
  fieldLabel,
  formatAuditValue,
  type AuditAction,
  type AuditFilters,
  type FieldChange,
} from '@/domain';
import { CSV_ROW_LIMIT, toCsv } from '@/lib/csv';
import { toContentError } from './contentRepository';

/**
 * Reading the audit log.
 *
 * The log is managers-only at the database level, so nothing here checks who is
 * asking — an agent simply gets no rows. Rows are never written from the
 * client: triggers do that.
 */

export type { AuditAction };

export interface AuditRow {
  readonly id: number;
  readonly tableName: string;
  readonly entityLabel: string;
  readonly recordId: string | null;
  /** The name of the thing that changed, when we could resolve one. */
  readonly recordLabel: string | null;
  readonly action: AuditAction;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly changedAt: string;
  readonly changes: readonly FieldChange[];
}

export interface AuditPage {
  readonly rows: readonly AuditRow[];
  readonly total: number;
}

const COLUMNS =
  'id, table_name, record_id, action, old_data, new_data, changed_by, changed_at, actor:profiles!audit_log_changed_by_fkey ( full_name )';

interface RawAuditRow {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: unknown;
  new_data: unknown;
  changed_by: string | null;
  changed_at: string;
  actor: { full_name: string } | null;
}

function toAction(value: string): AuditAction {
  return value === 'INSERT' || value === 'DELETE' ? value : 'UPDATE';
}

/**
 * Manila days to an instant range. `to` is inclusive of the whole day, so a
 * window of 21 Nov to 21 Nov covers that day in Manila rather than nothing.
 */
function dayStart(day: string): string {
  return `${day}T00:00:00+08:00`;
}
function dayEnd(day: string): string {
  return `${day}T23:59:59.999+08:00`;
}

/**
 * A readable name for the row that changed.
 *
 * The log only keeps an id, and the row it points at may since have been
 * edited or deleted, so this is best-effort: one query per table involved in
 * the page, never one per row.
 */
type NamedTable = Extract<
  keyof Database['public']['Tables'],
  'services' | 'hotels' | 'cities' | 'operators' | 'booking_sites' | 'profiles'
>;

const NAMED_TABLES: Readonly<Record<string, { table: NamedTable; column: string }>> = {
  services: { table: 'services', column: 'name' },
  hotels: { table: 'hotels', column: 'name' },
  cities: { table: 'cities', column: 'name' },
  operators: { table: 'operators', column: 'name' },
  booking_sites: { table: 'booking_sites', column: 'name' },
  profiles: { table: 'profiles', column: 'full_name' },
};

async function resolveLabels(rows: readonly RawAuditRow[]): Promise<Map<string, string>> {
  const wanted = new Map<string, Set<string>>();
  for (const row of rows) {
    const named = NAMED_TABLES[row.table_name];
    if (named === undefined || row.record_id === null) continue;
    const ids = wanted.get(row.table_name) ?? new Set<string>();
    ids.add(row.record_id);
    wanted.set(row.table_name, ids);
  }

  const labels = new Map<string, string>();
  await Promise.all(
    [...wanted].map(async ([tableName, ids]) => {
      const named = NAMED_TABLES[tableName];
      if (named === undefined) return;
      const { data } = await supabase
        .from(named.table)
        .select(`id, ${named.column}`)
        .in('id', [...ids])
        .overrideTypes<Record<string, string>[], { merge: false }>();
      for (const record of data ?? []) {
        const label = record[named.column];
        if (typeof label === 'string') labels.set(`${tableName}:${record.id}`, label);
      }
    }),
  );
  return labels;
}

function buildQuery(filters: AuditFilters) {
  let query = supabase
    .from('audit_log')
    .select(COLUMNS, { count: 'exact' })
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false });

  const tables = auditTables(filters);
  if (tables.length > 0) query = query.in('table_name', [...tables]);
  if (filters.recordId !== '') query = query.eq('record_id', filters.recordId);
  if (filters.actorId !== '') query = query.eq('changed_by', filters.actorId);
  if (filters.from !== '') query = query.gte('changed_at', dayStart(filters.from));
  if (filters.to !== '') query = query.lte('changed_at', dayEnd(filters.to));
  return query;
}

async function toRows(raw: readonly RawAuditRow[]): Promise<readonly AuditRow[]> {
  const labels = await resolveLabels(raw);
  return raw.map((row) => ({
    id: row.id,
    tableName: row.table_name,
    entityLabel: entityLabel(row.table_name),
    recordId: row.record_id,
    recordLabel:
      row.record_id === null ? null : (labels.get(`${row.table_name}:${row.record_id}`) ?? null),
    action: toAction(row.action),
    actorId: row.changed_by,
    actorName: row.actor?.full_name ?? null,
    changedAt: row.changed_at,
    changes: changedFields(row.old_data, row.new_data),
  }));
}

export async function listAuditEntries(filters: AuditFilters): Promise<AuditPage> {
  const first = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await buildQuery(filters)
    .range(first, first + PAGE_SIZE - 1)
    .overrideTypes<RawAuditRow[], { merge: false }>();

  if (error) throw toContentError(error);
  return { rows: await toRows(data), total: count ?? 0 };
}

export const AUDIT_CSV_HEADERS = [
  'When',
  'Who',
  'What changed',
  'Record',
  'Action',
  'Field',
  'Before',
  'After',
] as const;

/**
 * The filtered log as CSV, one line per changed field so the file can be
 * filtered in Excel. Capped: an unbounded export would time out and produce a
 * file nothing can open.
 */
export async function exportAuditCsv(filters: AuditFilters): Promise<string> {
  const { data, error } = await buildQuery(filters)
    .range(0, CSV_ROW_LIMIT - 1)
    .overrideTypes<RawAuditRow[], { merge: false }>();
  if (error) throw toContentError(error);

  const rows = await toRows(data);
  const lines = rows.flatMap((row) => {
    const common = [
      row.changedAt,
      row.actorName ?? 'System',
      row.entityLabel,
      row.recordLabel ?? row.recordId ?? '',
      row.action,
    ];
    if (row.changes.length === 0) return [[...common, '', '', '']];
    return row.changes.map((change) => [
      ...common,
      fieldLabel(change.field),
      formatAuditValue(change.field, change.oldValue).full,
      formatAuditValue(change.field, change.newValue).full,
    ]);
  });

  return toCsv(AUDIT_CSV_HEADERS, lines);
}

/** Who has made changes, for the actor filter. */
export interface AuditActor {
  readonly id: string;
  readonly name: string;
}

export async function listAuditActors(): Promise<readonly AuditActor[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')
    .overrideTypes<{ id: string; full_name: string }[], { merge: false }>();
  if (error) throw toContentError(error);
  return data.map((row) => ({ id: row.id, name: row.full_name }));
}
