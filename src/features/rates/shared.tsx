import { Alert, Badge, type BadgeTone } from '@/components/ui';
import { DAYS_BEFORE_EXPIRY_WARNING, daysUntil, type RateStatusLabel } from './rateStatus';

/** Every screen in this step repeats the same promise, so it lives in one place. */
export function NewQuotationsOnlyNotice() {
  return (
    <Alert tone="info" title="Changes apply to new quotations only" className="mb-6">
      Existing quotations keep the rates, FX and markups frozen into them when they were created.
    </Alert>
  );
}

const STATUS_TONES: Record<RateStatusLabel, BadgeTone> = {
  Published: 'success',
  'Draft pending': 'warning',
  Scheduled: 'info',
  'No rate': 'neutral',
  Expired: 'danger',
};

export function RateStatusBadge({ status }: { status: RateStatusLabel }) {
  return <Badge tone={STATUS_TONES[status]}>{status}</Badge>;
}

export function ValidUntilCell({ validUntil, now }: { validUntil: string | null; now: Date }) {
  const days = daysUntil(validUntil, now);
  if (validUntil === null || days === null) return <span className="text-slate-400">—</span>;
  if (days < 0) return <Badge tone="danger">Expired {validUntil}</Badge>;
  if (days <= DAYS_BEFORE_EXPIRY_WARNING) {
    return (
      <Badge tone="warning">
        {validUntil} · {days}d left
      </Badge>
    );
  }
  return <span>{validUntil}</span>;
}
