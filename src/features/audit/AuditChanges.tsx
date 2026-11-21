import { fieldLabel, formatAuditValue } from '@/domain';
import type { AuditRow } from '@/data/repositories/auditRepository';

/**
 * The before/after detail of one audit entry.
 *
 * Long values are shown cut, with the whole text on hover: a reason field can
 * run to a paragraph and would otherwise break the table.
 */
export function AuditChanges({ row }: { row: AuditRow }) {
  if (row.changes.length === 0) {
    return <p className="py-2 text-sm text-slate-600">No field-level detail recorded.</p>;
  }

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Fields changed in this entry</caption>
      <thead>
        <tr className="text-left text-xs text-slate-500 uppercase">
          <th scope="col" className="py-1 pr-4 font-medium">
            Field
          </th>
          <th scope="col" className="py-1 pr-4 font-medium">
            Before
          </th>
          <th scope="col" className="py-1 font-medium">
            After
          </th>
        </tr>
      </thead>
      <tbody>
        {row.changes.map((change) => {
          const before = formatAuditValue(change.field, change.oldValue);
          const after = formatAuditValue(change.field, change.newValue);
          return (
            <tr key={change.field} className="align-top">
              <th scope="row" className="py-1 pr-4 text-left font-normal text-slate-600">
                {fieldLabel(change.field)}
              </th>
              <td className="py-1 pr-4 text-slate-500" title={before.truncated ? before.full : ''}>
                {before.text}
              </td>
              <td
                className="py-1 font-medium text-slate-900"
                title={after.truncated ? after.full : ''}
              >
                {after.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
