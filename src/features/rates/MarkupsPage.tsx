import { useState } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';
import { currentAndScheduled } from '@/domain';
import { RateError } from '@/data/repositories/rateRepository';
import type { MarkupRow } from '@/data/repositories/markupRepository';
import type { Database } from '@/data/database.types';
import {
  useCategoryMarkups,
  useInsertCategoryMarkup,
  useInsertServiceMarkup,
  useServiceMarkups,
} from './queries';
import { NewQuotationsOnlyNotice } from './shared';
import { formatDateTime, nowLocalInput } from './rateStatus';

type MarkupType = Database['public']['Enums']['markup_type'];
type PaxCategory = Database['public']['Enums']['pax_category'];
type ServiceType = Database['public']['Enums']['service_type'];

const CATEGORY_LABELS: Record<PaxCategory, string> = {
  quad: 'Quad',
  triple: 'Triple',
  twin: 'Twin',
  solo: 'Solo',
  child: 'Child',
  sneak_in: 'Sneak-in',
};

const SERVICE_LABELS: Record<ServiceType, string> = { tour: 'Tour', transfer: 'Transfer' };

function formatValue(row: MarkupRow | null): string {
  if (row === null) return '—';
  return row.markupType === 'percent'
    ? `${String(row.value)}%`
    : `PHP ${row.value.toLocaleString()}`;
}

interface EditTarget {
  readonly kind: 'category' | 'service';
  readonly key: string;
  readonly label: string;
  readonly current: MarkupRow | null;
}

function MarkupCard({
  label,
  split,
  onChange,
}: {
  label: string;
  split: {
    current: MarkupRow | null;
    scheduled: readonly MarkupRow[];
    history: readonly MarkupRow[];
  };
  onChange: () => void;
}) {
  return (
    <Card>
      <CardHeader
        title={label}
        actions={
          <Button variant="secondary" size="sm" onClick={onChange}>
            Change
          </Button>
        }
      />
      <CardBody>
        <p className="text-xl font-semibold text-slate-900 tabular-nums">
          {formatValue(split.current)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {split.current === null
            ? 'Nothing set yet.'
            : `Since ${formatDateTime(split.current.effectiveFrom)} · ${split.current.createdByName ?? 'unknown'}`}
        </p>

        {split.scheduled.map((row) => (
          <p key={row.id} className="mt-2 text-xs">
            <Badge tone="info">Scheduled</Badge> {formatValue(row)} from{' '}
            {formatDateTime(row.effectiveFrom)}
          </p>
        ))}

        {split.history.length > 0 && (
          <details className="mt-3 text-xs text-slate-600">
            <summary className="cursor-pointer">History ({split.history.length})</summary>
            <ul className="mt-2 space-y-1">
              {split.history.map((row) => (
                <li key={row.id}>
                  {formatValue(row)} · from {formatDateTime(row.effectiveFrom)} ·{' '}
                  {row.createdByName ?? 'unknown'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

export function MarkupsPage() {
  const now = new Date();
  const toast = useToast();
  const categories = useCategoryMarkups();
  const services = useServiceMarkups();
  const insertCategory = useInsertCategoryMarkup();
  const insertService = useInsertServiceMarkup();

  const [target, setTarget] = useState<EditTarget | null>(null);
  const [markupType, setMarkupType] = useState<MarkupType>('fixed');
  const [value, setValue] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(nowLocalInput(now));

  const parsed = Number(value);
  const positive = Number.isFinite(parsed) && parsed >= 0;
  const withinPercent = markupType === 'fixed' || parsed <= 100;
  const valid = value !== '' && positive && withinPercent;
  const busy = insertCategory.isPending || insertService.isPending;

  function openFor(entry: EditTarget): void {
    setTarget(entry);
    setMarkupType(entry.current?.markupType ?? 'fixed');
    setValue(entry.current === null ? '' : String(entry.current.value));
    setEffectiveFrom(nowLocalInput(new Date()));
  }

  function save(): void {
    if (target === null) return;
    const common = {
      markupType,
      value: parsed,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
    };
    const handlers = {
      onSuccess: () => {
        setTarget(null);
        toast.success(`${target.label} markup saved.`);
      },
      onError: (caught: unknown) => {
        toast.error(caught instanceof RateError ? caught.message : 'Could not save the markup.');
      },
    };

    if (target.kind === 'category') {
      insertCategory.mutate({ paxCategory: target.key as PaxCategory, ...common }, handlers);
    } else {
      insertService.mutate({ serviceType: target.key as ServiceType, ...common }, handlers);
    }
  }

  if (categories.isPending || services.isPending) return <Spinner label="Loading markups…" />;

  return (
    <>
      <PageHeader
        title="Markups"
        description="Added on top of the converted operator rate. Append-only, like FX."
        actions={
          <Link to="/admin/rates" className="text-brand-700 text-sm hover:underline">
            Back to rates
          </Link>
        }
      />
      <NewQuotationsOnlyNotice />

      <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-600 uppercase">
        Category markups
      </h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(CATEGORY_LABELS) as PaxCategory[]).map((code) => {
          const split = currentAndScheduled(
            (categories.data ?? []).filter((row) => row.paxCategory === code),
            now,
          );
          return (
            <MarkupCard
              key={code}
              label={CATEGORY_LABELS[code]}
              split={split}
              onChange={() => {
                openFor({
                  kind: 'category',
                  key: code,
                  label: CATEGORY_LABELS[code],
                  current: split.current,
                });
              }}
            />
          );
        })}
      </div>

      <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-600 uppercase">
        Service markups
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((code) => {
          const split = currentAndScheduled(
            (services.data ?? []).filter((row) => row.serviceType === code),
            now,
          );
          return (
            <MarkupCard
              key={code}
              label={SERVICE_LABELS[code]}
              split={split}
              onChange={() => {
                openFor({
                  kind: 'service',
                  key: code,
                  label: SERVICE_LABELS[code],
                  current: split.current,
                });
              }}
            />
          );
        })}
      </div>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
        title={`Change the ${target?.label ?? ''} markup`}
        description="This inserts a new row. The old value stays in the history."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={!valid} loading={busy} onClick={save}>
              Save markup
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Type">
            <Select
              value={markupType}
              onChange={(event) => {
                setMarkupType(event.target.value === 'percent' ? 'percent' : 'fixed');
              }}
            >
              <option value="fixed">Fixed PHP</option>
              <option value="percent">Percent</option>
            </Select>
          </Field>

          <Field
            label={markupType === 'percent' ? 'Percent' : 'Amount in PHP'}
            hint={
              markupType === 'percent'
                ? 'Up to 100. Applied to hotel + tours + transfers.'
                : 'Zero or more.'
            }
            error={
              value === ''
                ? undefined
                : !positive
                  ? 'Enter zero or more.'
                  : !withinPercent
                    ? 'A percent markup cannot exceed 100.'
                    : undefined
            }
          >
            <Input
              type="number"
              min="0"
              step={markupType === 'percent' ? '0.01' : '1'}
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          </Field>

          <Field label="Effective from" hint="Now, or a future date to schedule it.">
            <Input
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => {
                setEffectiveFrom(event.target.value);
              }}
            />
          </Field>

          <Alert tone="info">Existing quotations keep the markup they were created with.</Alert>
        </div>
      </Dialog>
    </>
  );
}
