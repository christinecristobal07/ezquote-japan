import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  PageHeader,
  useToast,
  type Column,
} from '@/components/ui';
import {
  PAGE_SIZE,
  nextSort,
  parseQuotationFilters,
  quotationFiltersToParams,
  type QuotationFilters,
  type QuotationSort,
} from '@/domain';
import { can, isManager } from '@/domain/permissions';
import { ContentError } from '@/data/repositories/contentRepository';
import type { DuplicateResult, QuotationListRow } from '@/data/repositories/quotationRepository';
import { useAuth } from '@/features/auth/useAuth';
import { useAgents } from '@/features/agents/queries';
import { HistoryFilters } from './HistoryFilters';
import { ReassignDialog, type ReassignTarget } from './ReassignDialog';
import { RequoteDialog } from './RequoteDialog';
import { STATUS_LABELS } from './statusLabels';
import {
  useDuplicateQuotation,
  useQuotationList,
  useReassignQuotation,
  useSetQuotationStatus,
} from './queries';

function day(value: string | null): string {
  if (value === null) return '—';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(
    new Date(value),
  );
}

function statusTone(status: QuotationListRow['status']) {
  if (status === 'sent') return 'success' as const;
  if (status === 'archived') return 'neutral' as const;
  return 'info' as const;
}

function SortButton({
  column,
  label,
  filters,
  onChange,
}: {
  column: QuotationSort;
  label: string;
  filters: QuotationFilters;
  onChange: (next: QuotationFilters) => void;
}) {
  const active = filters.sort === column;
  const Icon = filters.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 uppercase hover:text-slate-900"
      aria-sort={active ? (filters.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => {
        onChange(nextSort(filters, column));
      }}
    >
      {label}
      {active && <Icon aria-hidden="true" className="h-3 w-3" />}
    </button>
  );
}

export interface QuotationHistoryProps {
  readonly title: string;
  readonly description: string;
  /** 'mine' pins the list to the signed-in agent, whatever their role. */
  readonly scope: 'mine' | 'team';
}

export function QuotationHistory({ title, description, scope }: QuotationHistoryProps) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();

  const [requoted, setRequoted] = useState<DuplicateResult | null>(null);
  const [reassigning, setReassigning] = useState<ReassignTarget | null>(null);

  const showAgentFilter = scope === 'team';
  const agents = useAgents();

  const urlFilters = parseQuotationFilters(params);
  const filters: QuotationFilters =
    scope === 'mine' && profile !== null ? { ...urlFilters, agentId: profile.id } : urlFilters;

  const list = useQuotationList(filters);
  const duplicate = useDuplicateQuotation();
  const setStatus = useSetQuotationStatus();
  const reassign = useReassignQuotation();

  // Only a supervisor or a manager may hand a quotation over, and the database
  // enforces that; offering the action to an agent who will only be refused is
  // worse than not offering it.
  const canReassign = profile !== null && can(profile.role, 'quotation.viewTeam');

  function applyFilters(next: QuotationFilters): void {
    setParams(quotationFiltersToParams(scope === 'mine' ? { ...next, agentId: '' } : next), {
      replace: true,
    });
  }

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const first = (filters.page - 1) * PAGE_SIZE;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<QuotationListRow>[] = [
    {
      key: 'reference',
      header: (
        <SortButton
          column="reference_no"
          label="Reference"
          filters={filters}
          onChange={applyFilters}
        />
      ),
      cell: (row) => (
        <Link to={`/quotations/${row.id}`} className="text-brand-700 font-medium hover:underline">
          {row.referenceNo}
        </Link>
      ),
    },
    {
      key: 'client',
      header: (
        <SortButton column="client_name" label="Client" filters={filters} onChange={applyFilters} />
      ),
      cell: (row) => (
        <span>
          <span className="block text-slate-900">{row.clientName ?? 'No client yet'}</span>
          {row.packageTitle !== null && (
            <span className="block text-xs text-slate-500">{row.packageTitle}</span>
          )}
        </span>
      ),
    },
    ...(scope === 'team'
      ? [
          {
            key: 'agent',
            header: 'Agent',
            cell: (row: QuotationListRow) => row.agentName ?? '—',
          },
        ]
      : []),
    {
      key: 'travel',
      header: (
        <SortButton
          column="travel_date"
          label="Travel date"
          filters={filters}
          onChange={applyFilters}
        />
      ),
      cell: (row) => day(row.travelDate),
    },
    {
      key: 'pax',
      header: 'Pax',
      align: 'right',
      cell: (row) => `${String(row.paxTotal)} · ${String(row.durationDays)}D`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge>,
    },
    {
      key: 'created',
      header: (
        <SortButton column="created_at" label="Created" filters={filters} onChange={applyFilters} />
      ),
      cell: (row) => day(row.createdAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <IconButton aria-label={`Actions for ${row.referenceNo}`}>
              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => {
                void navigate(`/quotations/${row.id}`);
              }}
            >
              Open
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void navigate(`/quotations/${row.id}/output`);
              }}
            >
              Quotation text
            </DropdownMenuItem>
            {profile !== null && can(profile.role, 'quotation.create') && (
              <DropdownMenuItem
                onSelect={() => {
                  duplicate.mutate(row.id, {
                    onSuccess: (result) => {
                      setRequoted(result);
                    },
                    onError: reportError,
                  });
                }}
              >
                Requote with current rates
              </DropdownMenuItem>
            )}
            {canReassign && (
              <DropdownMenuItem
                onSelect={() => {
                  setReassigning({
                    id: row.id,
                    referenceNo: row.referenceNo,
                    agentId: row.agentId,
                    agentName: row.agentName,
                  });
                }}
              >
                Reassign to agent
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                setStatus.mutate(
                  {
                    id: row.id,
                    updatedAt: row.updatedAt,
                    status: row.status === 'archived' ? 'draft' : 'archived',
                  },
                  {
                    onSuccess: () => {
                      toast.success(
                        row.status === 'archived'
                          ? `${row.referenceNo} restored.`
                          : `${row.referenceNo} archived.`,
                      );
                    },
                    onError: reportError,
                  },
                );
              }}
            >
              {row.status === 'archived' ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          profile !== null && can(profile.role, 'quotation.create') ? (
            <Button onClick={() => void navigate('/quotations/new')}>New quotation</Button>
          ) : undefined
        }
      />

      <HistoryFilters
        filters={filters}
        agents={
          showAgentFilter
            ? (agents.data ?? []).map((agent) => ({ id: agent.id, name: agent.fullName }))
            : undefined
        }
        onChange={applyFilters}
      />

      {list.error !== null && (
        <Alert tone="danger" title="Could not load the list" className="mb-4">
          {list.error.message}
        </Alert>
      )}

      <Card>
        <DataTable
          caption={title}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={list.isPending}
          empty={
            <EmptyState
              title="No quotations here"
              text={
                filters.search === '' && filters.statuses.length === 0
                  ? 'Quotations you create will appear here.'
                  : 'Nothing matches these filters.'
              }
            />
          }
        />
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
                applyFilters({ ...filters, page: filters.page + 1 });
              }}
            >
              Next
            </Button>
          </span>
        </nav>
      )}

      <ReassignDialog
        quotation={reassigning}
        agents={(agents.data ?? []).map((agent) => ({ id: agent.id, name: agent.fullName }))}
        busy={reassign.isPending}
        onCancel={() => {
          setReassigning(null);
        }}
        onConfirm={(agentId) => {
          if (reassigning === null) return;
          const reference = reassigning.referenceNo;
          reassign.mutate(
            { id: reassigning.id, agentId },
            {
              onSuccess: () => {
                setReassigning(null);
                toast.success(`${reference} reassigned.`);
              },
              onError: reportError,
            },
          );
        }}
      />

      <RequoteDialog
        result={requoted}
        onClose={() => {
          setRequoted(null);
        }}
        onOpen={(id) => {
          setRequoted(null);
          void navigate(`/quotations/${id}`);
        }}
      />
    </>
  );
}

export function QuotationsPage() {
  return (
    <QuotationHistory
      title="My quotations"
      description="Every quotation you have built, newest first."
      scope="mine"
    />
  );
}

export function TeamQuotationsPage() {
  const { profile } = useAuth();
  const everyone = profile !== null && isManager(profile.role);
  return (
    <QuotationHistory
      title={everyone ? 'All quotations' : 'Team quotations'}
      description={
        everyone
          ? 'Every quotation in the system, newest first.'
          : 'Quotations from the agents who report to you.'
      }
      scope="team"
    />
  );
}
