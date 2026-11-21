/**
 * Turning raw audit_log rows into something a manager can read.
 *
 * The triggers store whole row snapshots as jsonb, so most of the work here is
 * deciding what actually changed and what each value means.
 */

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

/** Columns that move on every write and say nothing about intent. */
const NOISE = new Set(['updated_at', 'created_at', 'id']);

export interface FieldChange {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** The meaningful field names of a row: no noise, and nothing left blank. */
function populated(row: Record<string, unknown>): string[] {
  return Object.keys(row)
    .filter((field) => !NOISE.has(field))
    .filter((field) => row[field] !== null && row[field] !== undefined)
    .sort();
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The fields that differ between two row snapshots.
 *
 * An INSERT lists every field that carries a value, a DELETE every field that
 * had one, and an UPDATE only what moved — timestamps excluded, since they
 * change on every write and would bury the real edit.
 */
export function changedFields(oldData: unknown, newData: unknown): readonly FieldChange[] {
  const before = asRecord(oldData);
  const after = asRecord(newData);

  if (before === null) {
    if (after === null) return [];
    return populated(after).map((field) => ({
      field,
      oldValue: null,
      newValue: after[field],
    }));
  }

  if (after === null) {
    return populated(before).map((field) => ({
      field,
      oldValue: before[field],
      newValue: null,
    }));
  }

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((field) => !NOISE.has(field))
    .filter((field) => !sameValue(before[field], after[field]))
    .sort()
    .map((field) => ({
      field,
      oldValue: before[field] ?? null,
      newValue: after[field] ?? null,
    }));
}

// -----------------------------------------------------------------------------
const ENTITY_LABELS: Record<string, string> = {
  service_rate_versions: 'Rate version',
  service_rate_tiers: 'Rate tier',
  service_rate_addons: 'Rate add-on',
  fx_rates: 'FX rate',
  category_markups: 'Category markup',
  service_markups: 'Service markup',
  quotation_adjustments: 'Change Rate entry',
  quotations: 'Quotation',
  profiles: 'Agent profile',
  agent_survey_links: 'Survey links',
  hotels: 'Hotel',
  cities: 'City',
  operators: 'Operator',
  booking_sites: 'Booking site',
  content_items: 'Content item',
  services: 'Service',
  app_settings: 'Setting',
};

export function entityLabel(tableName: string): string {
  return (
    ENTITY_LABELS[tableName] ??
    tableName.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
  );
}

// -----------------------------------------------------------------------------
const FIELD_LABELS: Record<string, string> = {
  php_per_unit: 'PHP per unit',
  effective_from: 'Effective from',
  valid_until: 'Valid until',
  markup_type: 'Markup type',
  pax_category: 'Pax category',
  service_type: 'Service type',
  is_active: 'Active',
  full_name: 'Full name',
  supervisor_id: 'Supervisor',
  data_issues: 'Data issues',
  bad_url: 'Bad link',
  great_url: 'Great link',
  star_rating: 'Star rating',
  content_type: 'Content type',
  sort_order: 'Sort order',
  min_pax: 'Min pax',
  max_pax: 'Max pax',
  reverses_id: 'Reverses',
  created_by_name: 'Entered by',
};

export function fieldLabel(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
  );
}

// -----------------------------------------------------------------------------
const MONEY_FIELDS = new Set(['amount', 'value', 'airfare_php', 'package_markup_value']);
const DATE_FIELDS = new Set(['effective_from', 'published_at', 'invited_at', 'changed_at']);
const DAY_FIELDS = new Set(['valid_until', 'travel_date', 'starts_on', 'ends_on']);

export const TRUNCATE_AT = 120;

export interface FormattedValue {
  readonly text: string;
  /** True when the text was cut, so the UI can offer "show more". */
  readonly truncated: boolean;
  readonly full: string;
}

function manilaDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

/** Renders one audit value for display, by what the field means. */
export function formatAuditValue(field: string, value: unknown): FormattedValue {
  const plain = (text: string): FormattedValue => ({
    text: text.length > TRUNCATE_AT ? `${text.slice(0, TRUNCATE_AT)}…` : text,
    truncated: text.length > TRUNCATE_AT,
    full: text,
  });

  if (value === null || value === undefined) return plain('—');
  if (typeof value === 'boolean') return plain(value ? 'Yes' : 'No');

  if (Array.isArray(value)) {
    return plain(value.length === 0 ? '(none)' : value.map((entry) => String(entry)).join(', '));
  }

  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) {
    const numeric = Number(value);
    if (MONEY_FIELDS.has(field)) {
      return plain(`PHP ${numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    }
    return plain(numeric.toLocaleString('en-US', { maximumFractionDigits: 6 }));
  }

  if (typeof value === 'string') {
    if (DATE_FIELDS.has(field)) return plain(manilaDateTime(value));
    if (DAY_FIELDS.has(field)) return plain(value);
    // Enum-looking values read better as words.
    if (/^[a-z]+(_[a-z]+)*$/.test(value) && value.length <= 40) {
      return plain(value.replace(/_/g, ' '));
    }
    return plain(value);
  }

  return plain(JSON.stringify(value));
}
