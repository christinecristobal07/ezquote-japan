import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
  type Column,
} from '@/components/ui';
import {
  AUDIT_PRESETS,
  AUDIT_PRESET_LABELS,
  PAGE_SIZE,
  auditFiltersToParams,
  entityLabel,
  hasActiveAuditFilters,
  parseAuditFilters,
  recordHistoryPath,
  type AuditFilters,
  type AuditPreset,
} from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import type { AuditRow } from '@/data/repositories/auditRepository';
import { CSV_ROW_LIMIT } from '@/lib/csv';
import { cn } from '@/lib/cn';
import { AuditChanges } from './AuditChanges';
import { useAuditActors, useAuditEntries, useAuditExport } from './queries';

function when(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

const ACTION_TONES = { INSERT: 'success', UPDATE: 'info', DELETE: 'danger' } as const;
const ACTION_LABELS = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed' } as const;

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);

  const filters = parseAuditFilters(params);
  const entries = useAuditEntries(filters);
  const actors = useAuditActors();
  const exportCsv = useAuditExport();

  function applyFilters(next: AuditFilters): void {
    setParams(auditFiltersToParams(next), { replace: true });
  }

  const rows = entries.data?.rows ?? [];
  const total = entries.data?.total ?? 0;
  const first = (filters.page - 1) * PAGE_SIZE;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<AuditRow>[] = [
    {
      key: 'expand',
      header: <span className="sr-only">Detail</span>,
      cell: (row) => {
        const open = expanded === row.id;
        const Icon = open ? ChevronDown : ChevronRight;
        return (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Hide what changed' : 'Show what changed'}
            className="text-slate-500 hover:text-slate-900"
            onClick={() => {
              setExpanded(open ? null : row.id);
            }}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        );
      },
    },
    { key: 'when', header: 'When', cell: (row) => when(row.changedAt) },
    { key: 'who', header: 'Who', cell: (row) => row.actorName ?? 'System' },
    {
      key: 'what',
      header: 'What changed',
      cell: (row) => (
        <span>
          <span className="block text-slate-900">{row.entityLabel}</span>
          {row.recordLabel !== null && (
            <span className="block text-xs text-slate-500">{row.recordLabel}</span>
          )}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (row) => <Badge tone={ACTION_TONES[row.action]}>{ACTION_LABELS[row.action]}</Badge>,
    },
    {
      key: 'fields',
      header: 'Fields',
      align: 'right',
      cell: (row) => String(row.changes.length),
    },
    {
      key: 'history',
      header: <span className="sr-only">History</span>,
      align: 'right',
      cell: (row) =>
        row.recordId === null ? null : (
          <Link
            to={recordHistoryPath(row.tableName, row.recordId)}
            className="text-brand-700 text-xs hover:underline"
          >
            This record
          </Link>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every important change, with who made it and when. Entries cannot be edited or deleted."
        actions={
          <Button
            variant="secondary"
            loading={exportCsv.isPending}
            onClick={() => {
              exportCsv.mutate(filters, {
                onSuccess: () => {
                  toast.success('Export downloaded.');
                },
                onError: (caught: unknown) => {
                  toast.error(
                    caught instanceof ContentError ? caught.message : 'Could not export.',
                  );
                },
              });
            }}
          >
            <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200" aria-label="Audit views">
        {AUDIT_PRESETS.map((preset: AuditPreset) => (
          <button
            key={preset}
            type="button"
            aria-current={filters.preset === preset ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              filters.preset === preset
                ? 'border-brand-600 text-brand-700 font-medium'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
            onClick={() => {
              // Switching tab drops a single-record view: the two disagree.
              applyFilters({ ...filters, preset, table: '', recordId: '', page: 1 });
            }}
          >
            {AUDIT_PRESET_LABELS[preset]}
          </button>
        ))}
      </nav>

      {filters.recordId !== '' && (
        <Alert tone="info" className="mb-4" title="Showing one record">
          <p className="flex flex-wrap items-center gap-3">
            <span>
              The full history of one {entityLabel(filters.table).toLowerCase()}, newest first.
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                applyFilters({ ...filters, table: '', recordId: '', page: 1 });
              }}
            >
              Show everything
            </Button>
          </p>
        </Alert>
      )}

      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
        }}
        role="search"
      >
        <Field label="Who">
          <Select
            value={filters.actorId}
            onChange={(event) => {
              applyFilters({ ...filters, actorId: event.target.value, page: 1 });
            }}
          >
            <option value="">Anyone</option>
            {(actors.data ?? []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="From">
          <Input
            type="date"
            value={filters.from}
            onChange={(event) => {
              applyFilters({ ...filters, from: event.target.value, page: 1 });
            }}
          />
        </Field>

        <Field label="To">
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => {
              applyFilters({ ...filters, to: event.target.value, page: 1 });
            }}
          />
        </Field>

        {hasActiveAuditFilters(filters) && (
          <Button
            variant="ghost"
            onClick={() => {
              applyFilters({
                ...filters,
                actorId: '',
                from: '',
                to: '',
                table: '',
                recordId: '',
                page: 1,
              });
            }}
          >
            Clear filters
          </Button>
        )}
      </form>

      {entries.error !== null && (
        <Alert tone="danger" title="Could not load the audit log" className="mb-4">
          {entries.error.message}
        </Alert>
      )}

      {total > CSV_ROW_LIMIT && (
        <Alert tone="warning" className="mb-4">
          An export covers the newest {CSV_ROW_LIMIT.toLocaleString('en-US')} entries. Narrow the
          dates to export the rest.
        </Alert>
      )}

      <Card>
        <DataTable
          caption="Audit log"
          columns={columns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={entries.isPending}
          empty={
            <EmptyState
              title="Nothing recorded here"
              text={
                hasActiveAuditFilters(filters)
                  ? 'Nothing matches these filters.'
                  : 'Changes to rates, agents and Change Rate entries will appear here.'
              }
            />
          }
        />
        {expanded !== null && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            {rows
              .filter((row) => row.id === expanded)
              .map((row) => (
                <AuditChanges key={row.id} row={row} />
              ))}
          </div>
        )}
      </Card>

      {total > 0 && (
        <nav
          className="mt-4 flex items-center justify-between text-sm text-slate-600"
          aria-label="Pagination"
        >
          <p>
            {String(first + 1)}–{String(Math.min(first + rows.length, total))} of {String(total)}
          </p>
          <span className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => {
                setExpanded(null);
                applyFilters({ ...filters, page: filters.page - 1 });
              }}
            >
              Previous
            </Button>
            <span>
              Page {String(filters.page)} of {String(lastPage)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={filters.page >= lastPage}
              onClick={() => {
                setExpanded(null);
                applyFilters({ ...filters, page: filters.page + 1 });
              }}
            >
              Next
            </Button>
          </span>
        </nav>
      )}
    </>
  );
}
