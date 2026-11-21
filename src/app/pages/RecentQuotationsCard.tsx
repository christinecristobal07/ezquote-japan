import { Link } from 'react-router';
import { Badge, Card, CardBody, CardHeader, EmptyState, Spinner } from '@/components/ui';
import { useRecentQuotations, useWeeklyQuotationCount } from '@/features/history/queries';
import { isManager, type Role } from '@/domain/permissions';

function day(value: string | null): string {
  if (value === null) return 'No travel date';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(
    new Date(value),
  );
}

/**
 * The dashboard's way back into work in progress. Managers also get the week's
 * volume, which is the one number they ask for daily.
 */
export function RecentQuotationsCard({ role }: { role: Role }) {
  const recent = useRecentQuotations(5);
  const weekly = useWeeklyQuotationCount(7);
  const showWeekly = isManager(role);

  return (
    <Card>
      <CardHeader
        title="Recent quotations"
        description={
          showWeekly && weekly.data !== undefined
            ? `${String(weekly.data)} created in the last 7 days.`
            : 'Pick up where you left off.'
        }
        actions={
          <Link to="/quotations" className="text-brand-700 text-sm hover:underline">
            See all
          </Link>
        }
      />
      <CardBody>
        {recent.isPending && <Spinner label="Loading quotations…" />}

        {!recent.isPending && (recent.data ?? []).length === 0 && (
          <EmptyState
            title="No quotations yet"
            text="Start one and it will show up here."
            action={
              <Link to="/quotations/new" className="text-brand-700 text-sm hover:underline">
                New quotation
              </Link>
            }
          />
        )}

        {(recent.data ?? []).length > 0 && (
          <ul className="divide-y divide-slate-100">
            {(recent.data ?? []).map((row) => (
              <li key={row.id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  to={`/quotations/${row.id}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="block font-medium text-slate-900">
                      {row.clientName ?? row.referenceNo}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {row.referenceNo} · {day(row.travelDate)}
                    </span>
                  </span>
                  <Badge tone={row.status === 'sent' ? 'success' : 'info'}>{row.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
