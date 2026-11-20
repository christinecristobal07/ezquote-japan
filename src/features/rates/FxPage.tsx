import { useState } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Dialog,
  Field,
  Input,
  MoneyText,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';
import { currentAndScheduled, percentChange, toPhp, toScaledRate } from '@/domain';
import type { FxRateRow } from '@/data/repositories/fxRepository';
import { RateError } from '@/data/repositories/rateRepository';
import { useFxRates, useInsertFxRate } from './queries';
import { NewQuotationsOnlyNotice } from './shared';
import { formatDateTime, nowLocalInput } from './rateStatus';

const CURRENCIES = ['JPY', 'USD'] as const;
type Currency = (typeof CURRENCIES)[number];

/** The Mt Fuji 2–6 band, so a rate change is shown in money people recognise. */
const SAMPLE_JPY = 10_850;
export const BIG_CHANGE_PERCENT = 10;

export function FxPage() {
  const now = new Date();
  const toast = useToast();
  const { data, isPending, error } = useFxRates();
  const insert = useInsertFxRate();

  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>('JPY');
  const [value, setValue] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(nowLocalInput(now));

  const rows = data ?? [];
  const byCurrency = CURRENCIES.map((code) => ({
    code,
    ...currentAndScheduled(
      rows.filter((row) => row.currency === code),
      now,
    ),
  }));

  const currentForDialog = byCurrency.find((entry) => entry.code === currency)?.current ?? null;
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const change =
    currentForDialog === null || !valid ? null : percentChange(currentForDialog.phpPerUnit, parsed);

  const beforePhp =
    currentForDialog === null
      ? null
      : toPhp(SAMPLE_JPY, 'JPY', { JPY: toScaledRate(currentForDialog.phpPerUnit, 'JPY') });
  const afterPhp = valid ? toPhp(SAMPLE_JPY, 'JPY', { JPY: toScaledRate(parsed, 'JPY') }) : null;

  return (
    <>
      <PageHeader
        title="Exchange rates"
        description="PHP per one unit of the operator's currency. Append-only: a change is a new row."
        actions={
          <div className="flex items-center gap-3">
            <Link to="/admin/rates" className="text-brand-700 text-sm hover:underline">
              Back to rates
            </Link>
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              Set new rate
            </Button>
          </div>
        }
      />
      <NewQuotationsOnlyNotice />

      {error !== null && (
        <Alert tone="danger" title="Could not load exchange rates" className="mb-6">
          {error.message}
        </Alert>
      )}

      {isPending ? (
        <Spinner label="Loading exchange rates…" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {byCurrency.map((entry) => (
              <Card key={entry.code}>
                <CardHeader title={entry.code} description={`PHP per 1 ${entry.code}`} />
                <CardBody>
                  <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                    {entry.current === null ? '—' : entry.current.phpPerUnit}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.current === null
                      ? 'No rate in effect.'
                      : `Since ${formatDateTime(entry.current.effectiveFrom)} · set by ${entry.current.createdByName ?? 'unknown'}`}
                  </p>
                  {entry.scheduled.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {entry.scheduled.map((row) => (
                        <p key={row.id} className="text-xs">
                          <Badge tone="info">Scheduled</Badge> {row.phpPerUnit} from{' '}
                          {formatDateTime(row.effectiveFrom)}
                        </p>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="History" description="Every rate ever set, newest first." />
            <DataTable
              caption="Exchange rate history"
              rows={rows}
              rowKey={(row: FxRateRow) => row.id}
              columns={[
                { key: 'currency', header: 'Currency', cell: (row) => row.currency },
                {
                  key: 'rate',
                  header: 'PHP per unit',
                  align: 'right',
                  cell: (row) => <span className="tabular-nums">{row.phpPerUnit}</span>,
                },
                {
                  key: 'from',
                  header: 'Effective from',
                  cell: (row) => formatDateTime(row.effectiveFrom),
                },
                { key: 'by', header: 'Set by', cell: (row) => row.createdByName ?? '—' },
                { key: 'at', header: 'Recorded', cell: (row) => formatDateTime(row.createdAt) },
              ]}
            />
          </Card>
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={insert.isPending ? () => undefined : setOpen}
        title="Set a new exchange rate"
        description="The new rate applies to quotations created from its effective date onwards."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={insert.isPending}
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!valid}
              loading={insert.isPending}
              onClick={() => {
                insert.mutate(
                  {
                    currency,
                    phpPerUnit: parsed,
                    effectiveFrom: new Date(effectiveFrom).toISOString(),
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setValue('');
                      toast.success(`${currency} rate saved.`);
                    },
                    onError: (caught: unknown) => {
                      toast.error(
                        caught instanceof RateError ? caught.message : 'Could not save the rate.',
                      );
                    },
                  },
                );
              }}
            >
              Save rate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Currency">
            <Select
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value === 'USD' ? 'USD' : 'JPY');
              }}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="PHP per unit"
            hint="Greater than zero, up to six decimal places."
            error={value !== '' && !valid ? 'Enter a number greater than zero.' : undefined}
          >
            <Input
              type="number"
              step="0.000001"
              min="0"
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

          {currency === 'JPY' && (
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">Mt Fuji, 2–6 pax ({SAMPLE_JPY} JPY)</p>
              <p className="mt-1 text-slate-700">
                <MoneyText centavos={beforePhp} /> <span aria-hidden="true">→</span>{' '}
                <MoneyText centavos={afterPhp} />
              </p>
            </div>
          )}

          {change !== null && Math.abs(change) > BIG_CHANGE_PERCENT && (
            <Alert tone="warning" title="That is a big move">
              This changes the rate by {change.toFixed(1)}%. Double-check before saving.
            </Alert>
          )}
        </div>
      </Dialog>
    </>
  );
}
