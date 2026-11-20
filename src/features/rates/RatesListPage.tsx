import { Link } from 'react-router';
import { Alert, Badge, Card, CardHeader, DataTable, PageHeader, Spinner } from '@/components/ui';
import type { ServiceRateSummary } from '@/data/repositories/rateRepository';
import { useServiceRates } from './queries';
import { NewQuotationsOnlyNotice, RateStatusBadge, ValidUntilCell } from './shared';
import { formatDateTime, rateStatus } from './rateStatus';

function Group({
  title,
  rows,
  loading,
  now,
}: {
  title: string;
  rows: readonly ServiceRateSummary[];
  loading: boolean;
  now: Date;
}) {
  return (
    <Card className="mb-6">
      <CardHeader title={title} description={`${String(rows.length)} services`} />
      <DataTable
        caption={`${title} and their current rates`}
        rows={rows}
        loading={loading}
        rowKey={(row) => row.serviceId}
        columns={[
          {
            key: 'name',
            header: 'Service',
            cell: (row) => (
              <Link to={`/admin/rates/${row.serviceId}`} className="text-brand-700 hover:underline">
                {row.name}
              </Link>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (row) => (
              <RateStatusBadge
                status={rateStatus(
                  {
                    hasPublished: row.published !== null,
                    hasDraft: row.draftId !== null,
                    effectiveFrom: row.published?.effectiveFrom ?? null,
                    validUntil: row.published?.validUntil ?? null,
                  },
                  now,
                )}
              />
            ),
          },
          {
            key: 'currency',
            header: 'Currency',
            cell: (row) => row.published?.currency ?? '—',
          },
          {
            key: 'tiers',
            header: 'Tiers',
            align: 'right',
            cell: (row) => (row.published === null ? '—' : row.published.tierCount),
          },
          {
            key: 'validUntil',
            header: 'Valid until',
            cell: (row) => (
              <ValidUntilCell validUntil={row.published?.validUntil ?? null} now={now} />
            ),
          },
          {
            key: 'effectiveFrom',
            header: 'Effective from',
            cell: (row) =>
              row.published === null ? '—' : formatDateTime(row.published.effectiveFrom),
          },
          {
            key: 'action',
            header: 'Action',
            align: 'right',
            cell: (row) => (
              <Link
                to={`/admin/rates/${row.serviceId}`}
                className="text-brand-700 text-sm hover:underline"
              >
                {row.draftId === null ? 'View' : 'Edit draft'}
              </Link>
            ),
          },
        ]}
      />
    </Card>
  );
}

export function RatesListPage() {
  const now = new Date();
  const { data, isPending, error } = useServiceRates();

  const services = data ?? [];
  const tours = services.filter((service) => service.serviceType === 'tour');
  const transfers = services.filter((service) => service.serviceType === 'transfer');

  return (
    <>
      <PageHeader
        title="Rates & FX"
        description="Operator rates by group size, exchange rates and markups."
        actions={
          <div className="flex gap-2 text-sm">
            <Link to="/admin/rates/fx" className="text-brand-700 hover:underline">
              Exchange rates
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/admin/rates/markups" className="text-brand-700 hover:underline">
              Markups
            </Link>
          </div>
        }
      />
      <NewQuotationsOnlyNotice />

      {error !== null && (
        <Alert tone="danger" title="Could not load the rates" className="mb-6">
          {error.message}
        </Alert>
      )}

      {isPending ? (
        <Spinner label="Loading rates…" />
      ) : (
        <>
          <Group title="Tours" rows={tours} loading={false} now={now} />
          <Group title="Transfers" rows={transfers} loading={false} now={now} />
          <p className="text-xs text-slate-500">
            <Badge tone="neutral">No rate</Badge> means the service is quoted on request, like
            Sapporo.
          </p>
        </>
      )}
    </>
  );
}
