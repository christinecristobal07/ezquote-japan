import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

export interface Column<Row> {
  /** Stable key, also used for the React key. */
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  /**
   * Centred by default, which is how the team reads these tables. Action
   * columns stay right, and long free text is easier to scan left.
   */
  readonly align?: 'left' | 'center' | 'right';
  readonly className?: string;
}

export interface DataTableProps<Row> {
  /** Describes the table for screen readers; visually hidden by default. */
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  loadingRows?: number;
  empty?: ReactNode;
  className?: string;
}

function alignClass(align: Column<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'left') return 'text-left';
  return 'text-center';
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  loadingRows = 5,
  empty,
  className,
}: DataTableProps<Row>) {
  const showEmpty = !loading && rows.length === 0;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 uppercase',
                  alignClass(column.align),
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: loadingRows }, (_, index) => (
              <tr key={`skeleton-${String(index)}`} className="border-b border-slate-100">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading &&
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-100 hover:bg-slate-50">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-2.5 align-middle text-slate-800',
                      alignClass(column.align),
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}

          {showEmpty && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-0">
                {empty ?? (
                  <p className="py-8 text-center text-sm text-slate-600">Nothing here yet.</p>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
