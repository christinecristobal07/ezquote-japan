import { describe, expect, it } from 'vitest';
import { changedFields, entityLabel, fieldLabel, formatAuditValue, TRUNCATE_AT } from './audit.ts';

describe('changedFields', () => {
  it('reports only what moved on an update', () => {
    const changes = changedFields(
      { name: 'Old', value: 1, updated_at: 'a' },
      { name: 'New', value: 1, updated_at: 'b' },
    );
    expect(changes).toEqual([{ field: 'name', oldValue: 'Old', newValue: 'New' }]);
  });

  it('ignores the timestamp and id noise', () => {
    expect(
      changedFields(
        { id: '1', created_at: 'x', updated_at: 'x', name: 'Same' },
        { id: '1', created_at: 'y', updated_at: 'y', name: 'Same' },
      ),
    ).toEqual([]);
  });

  it('lists the populated fields on an insert', () => {
    const changes = changedFields(null, { name: 'Aira', email: null, role: 'sales_agent' });
    expect(changes.map((change) => change.field)).toEqual(['name', 'role']);
    expect(changes[0]).toEqual({ field: 'name', oldValue: null, newValue: 'Aira' });
  });

  it('lists what was lost on a delete', () => {
    const changes = changedFields({ name: 'Aira', notes: null }, null);
    expect(changes).toEqual([{ field: 'name', oldValue: 'Aira', newValue: null }]);
  });

  it('treats a changed array as a change', () => {
    const changes = changedFields(
      { data_issues: ['needs_email'] },
      { data_issues: ['needs_email', 'invalid_bad_link'] },
    );
    expect(changes).toHaveLength(1);
  });

  it('does not report an array that only looks different', () => {
    expect(changedFields({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
  });

  it('reports a field the new row has and the old one did not', () => {
    expect(changedFields({ amount: 1 }, { amount: 1, reason: 'Late surcharge' })).toEqual([
      { field: 'reason', oldValue: null, newValue: 'Late surcharge' },
    ]);
  });

  it('reports a field the new row has dropped', () => {
    expect(changedFields({ amount: 1, reason: 'Was wrong' }, { amount: 1 })).toEqual([
      { field: 'reason', oldValue: 'Was wrong', newValue: null },
    ]);
  });

  it('compares nested objects by value', () => {
    expect(changedFields({ meta: { a: 1 } }, { meta: { a: 1 } })).toEqual([]);
    expect(changedFields({ meta: { a: 1 } }, { meta: { a: 2 } })).toHaveLength(1);
  });

  it('copes with nothing at all', () => {
    expect(changedFields(null, null)).toEqual([]);
    expect(changedFields('not an object', 42)).toEqual([]);
    expect(changedFields(['an', 'array'], null)).toEqual([]);
  });
});

describe('entityLabel / fieldLabel', () => {
  it.each([
    ['service_rate_versions', 'Rate version'],
    ['fx_rates', 'FX rate'],
    ['category_markups', 'Category markup'],
    ['quotation_adjustments', 'Change Rate entry'],
    ['profiles', 'Agent profile'],
    ['agent_survey_links', 'Survey links'],
    ['hotels', 'Hotel'],
    ['content_items', 'Content item'],
  ])('%s reads "%s"', (table, label) => {
    expect(entityLabel(table)).toBe(label);
  });

  it('falls back to a readable form for anything unmapped', () => {
    expect(entityLabel('some_new_table')).toBe('Some new table');
  });

  it('names fields in plain words', () => {
    expect(fieldLabel('php_per_unit')).toBe('PHP per unit');
    expect(fieldLabel('is_active')).toBe('Active');
    expect(fieldLabel('created_by_name')).toBe('Entered by');
    expect(fieldLabel('mystery_column')).toBe('Mystery column');
  });
});

describe('formatAuditValue', () => {
  it('shows a dash for nothing', () => {
    expect(formatAuditValue('name', null).text).toBe('—');
    expect(formatAuditValue('name', undefined).text).toBe('—');
  });

  it('spells out booleans', () => {
    expect(formatAuditValue('is_active', true).text).toBe('Yes');
    expect(formatAuditValue('is_active', false).text).toBe('No');
  });

  it('formats money fields as pesos', () => {
    expect(formatAuditValue('amount', 20000).text).toBe('PHP 20,000');
    expect(formatAuditValue('value', '2500.50').text).toBe('PHP 2,500.5');
  });

  it('leaves a plain number alone, keeping FX precision', () => {
    expect(formatAuditValue('php_per_unit', 0.48).text).toBe('0.48');
    expect(formatAuditValue('min_pax', 2).text).toBe('2');
  });

  it('renders a timestamp in Manila time', () => {
    // 17:00 UTC on the 20th is already the 21st in Manila.
    expect(formatAuditValue('effective_from', '2026-11-20T17:00:00Z').text).toContain('Nov 21');
  });

  it('leaves a plain date as written', () => {
    expect(formatAuditValue('valid_until', '2027-11-30').text).toBe('2027-11-30');
  });

  it('turns an enum into words', () => {
    expect(formatAuditValue('status', 'not_booked').text).toBe('not booked');
    expect(formatAuditValue('role', 'sales_agent').text).toBe('sales agent');
  });

  it('leaves ordinary prose alone', () => {
    expect(formatAuditValue('reason', 'Corrected the quad room rate.').text).toBe(
      'Corrected the quad room rate.',
    );
  });

  it('joins arrays and names an empty one', () => {
    expect(formatAuditValue('data_issues', ['needs_email', 'placeholder_link']).text).toBe(
      'needs_email, placeholder_link',
    );
    expect(formatAuditValue('data_issues', []).text).toBe('(none)');
  });

  it('renders anything else as JSON', () => {
    expect(formatAuditValue('meta', { a: 1 }).text).toBe('{"a":1}');
  });

  it('truncates long text but keeps the full value for "show more"', () => {
    const long = 'x'.repeat(200);
    const formatted = formatAuditValue('reason', long);
    expect(formatted.truncated).toBe(true);
    expect(formatted.text).toHaveLength(TRUNCATE_AT + 1);
    expect(formatted.text.endsWith('…')).toBe(true);
    expect(formatted.full).toBe(long);
  });

  it('does not truncate a short value', () => {
    expect(formatAuditValue('reason', 'Quad room').truncated).toBe(false);
  });
});
