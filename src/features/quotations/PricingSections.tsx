import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  MoneyText,
  Select,
  Textarea,
} from '@/components/ui';
import {
  adjustmentErrorText,
  calculateQuotation,
  emptyCategoryLedger,
  formatPhp,
  hotelPerPersonExplanation,
  nightlyToStayTotal,
  scaleBy,
  validateAdjustmentInput,
  type AdjustmentKind,
  type AdjustmentRecord,
  type CategoryResult,
  type LedgerView,
  type QuotationInput,
  type RateSnapshot,
} from '@/domain';
import type { NewAdjustment } from '@/data/repositories/adjustmentRepository';

const KINDS: readonly { value: AdjustmentKind; label: string }[] = [
  { value: 'operator_charge', label: 'Operator charge' },
  { value: 'rate_difference', label: 'Rate difference' },
  { value: 'special_arrangement', label: 'Special arrangement' },
  { value: 'extra_transfer', label: 'Extra transfer' },
  { value: 'child_adjustment', label: 'Child adjustment' },
  { value: 'surcharge', label: 'Surcharge' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES = ['PHP', 'JPY', 'USD'] as const;

function manilaStamp(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

// -----------------------------------------------------------------------------
export function HotelCostCard({
  snapshot,
  ledger,
  categories,
  readOnly,
  onAdd,
}: {
  snapshot: RateSnapshot;
  ledger: LedgerView;
  categories: readonly string[];
  readOnly: boolean;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Hotel cost"
        description="Entered as a room cost for the whole stay, per category."
        actions={
          readOnly ? undefined : (
            <Button size="sm" onClick={onAdd}>
              Add hotel cost
            </Button>
          )
        }
      />
      <CardBody>
        <table className="w-full text-sm">
          <caption className="sr-only">Hotel cost per category</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th scope="col" className="py-2 text-xs font-semibold text-slate-600 uppercase">
                Category
              </th>
              <th
                scope="col"
                className="py-2 text-right text-xs font-semibold text-slate-600 uppercase"
              >
                Room total
              </th>
              <th
                scope="col"
                className="py-2 text-right text-xs font-semibold text-slate-600 uppercase"
              >
                Per person
              </th>
              <th scope="col" className="py-2 text-xs font-semibold text-slate-600 uppercase">
                How
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((code) => {
              const category = snapshot.categoryByCode.get(code);
              const entry = ledger.byCategory.get(code) ?? emptyCategoryLedger(code);
              if (category === undefined) return null;
              const perPerson = scaleBy(
                entry.hotelRoomTotalPhp,
                category.hotelDivisor,
                category.hotelMultiplier,
              );
              return (
                <tr key={code} className="border-b border-slate-100">
                  <td className="py-2">{category.label}</td>
                  <td className="py-2 text-right">
                    <MoneyText centavos={entry.hotelRoomTotalPhp} />
                  </td>
                  <td className="py-2 text-right">
                    <MoneyText centavos={perPerson} />
                  </td>
                  <td className="py-2 text-xs text-slate-600">
                    {entry.hasHotelCost ? (
                      hotelPerPersonExplanation(
                        code,
                        entry.hotelRoomTotalPhp,
                        category.hotelDivisor,
                        category.hotelMultiplier,
                      )
                    ) : (
                      <Badge tone="warning">No hotel cost yet</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export interface AdjustmentDialogProps {
  readonly open: boolean;
  readonly mode: 'hotel' | 'other';
  readonly categories: readonly string[];
  readonly snapshot: RateSnapshot;
  readonly nights: number;
  readonly busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entries: readonly NewAdjustment[]) => void;
}

/** Shared body for both the hotel-cost and Change Rate dialogs. */
export function AdjustmentForm({
  mode,
  categories,
  snapshot,
  nights,
  busy,
  onSubmit,
  onCancel,
}: Omit<AdjustmentDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const [allCategories, setAllCategories] = useState(false);
  const [category, setCategory] = useState(categories[0] ?? 'quad');
  // Mounted fresh per dialog open, so the initial kind needs no syncing effect.
  const [kind, setKind] = useState<AdjustmentKind>(mode === 'hotel' ? 'hotel' : 'surcharge');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('PHP');
  const [perNightMode, setPerNightMode] = useState(false);
  const [amount, setAmount] = useState('');
  const [nightlyNights, setNightlyNights] = useState(String(nights));
  const [reason, setReason] = useState('');
  const [perCategory, setPerCategory] = useState<Record<string, string>>({});

  const chosen = allCategories ? categories : [category];

  function amountFor(code: string): number {
    const raw = allCategories ? (perCategory[code] ?? '') : amount;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return Number.NaN;
    return perNightMode ? nightlyToStayTotal(parsed, Number(nightlyNights)) : parsed;
  }

  const validations = chosen.map((code) =>
    validateAdjustmentInput({
      paxCategories: [code],
      kind,
      amount: amountFor(code),
      currency,
      reason,
    }),
  );
  const errors = [...new Set(validations.flatMap((result) => result.errors))];
  const valid = chosen.length > 0 && validations.every((result) => result.valid);

  return (
    <div className="space-y-4">
      {categories.length > 1 && (
        <Checkbox
          label="All selected categories"
          checked={allCategories}
          onChange={(event) => {
            setAllCategories(event.target.checked);
          }}
        />
      )}

      {!allCategories && (
        <Field label="Category" required>
          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
            }}
          >
            {categories.map((code) => (
              <option key={code} value={code}>
                {snapshot.categoryByCode.get(code)?.label ?? code}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {mode === 'other' && (
        <Field label="Kind" required>
          <Select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as AdjustmentKind);
            }}
          >
            {KINDS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {mode === 'hotel' && (
        <Field label="Input mode">
          <Select
            value={perNightMode ? 'night' : 'total'}
            onChange={(event) => {
              setPerNightMode(event.target.value === 'night');
            }}
          >
            <option value="total">Total for the stay</option>
            <option value="night">Per night × nights</option>
          </Select>
        </Field>
      )}

      {perNightMode && (
        <Field label="Nights">
          <Input
            type="number"
            min={1}
            value={nightlyNights}
            onChange={(event) => {
              setNightlyNights(event.target.value);
            }}
          />
        </Field>
      )}

      {allCategories ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Amount per category {perNightMode ? '(per night)' : ''}
          </legend>
          {categories.map((code) => (
            <Field key={code} label={snapshot.categoryByCode.get(code)?.label ?? code}>
              <Input
                type="number"
                step="0.01"
                value={perCategory[code] ?? ''}
                onChange={(event) => {
                  setPerCategory({ ...perCategory, [code]: event.target.value });
                }}
              />
            </Field>
          ))}
        </fieldset>
      ) : (
        <Field
          label={perNightMode ? 'Amount per night' : 'Amount'}
          required
          hint={mode === 'other' ? 'Negative amounts are allowed.' : undefined}
        >
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
        </Field>
      )}

      <Field label="Currency" hint="Converted at this quotation's frozen FX.">
        <Select
          value={currency}
          onChange={(event) => {
            setCurrency(event.target.value as (typeof CURRENCIES)[number]);
          }}
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Reason" required hint="This is kept forever and shown in the ledger.">
        <Textarea
          rows={2}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>

      {errors.length > 0 && reason !== '' && (
        <Alert tone="warning">
          <ul className="list-inside list-disc">
            {errors.map((error) => (
              <li key={error}>{adjustmentErrorText(error)}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={!valid}
          onClick={() => {
            onSubmit(
              chosen.map((code) => ({
                paxCategory: code as NewAdjustment['paxCategory'],
                kind,
                amount: amountFor(code),
                currency,
                reason: reason.trim(),
              })),
            );
          }}
        >
          Save {chosen.length > 1 ? `${String(chosen.length)} entries` : 'entry'}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
export function LedgerTable({
  ledger,
  snapshot,
  categories,
  readOnly,
  onReverse,
}: {
  ledger: LedgerView;
  snapshot: RateSnapshot;
  categories: readonly string[];
  readOnly: boolean;
  onReverse: (entry: AdjustmentRecord) => void;
}) {
  const rows = categories.flatMap(
    (code) => (ledger.byCategory.get(code) ?? emptyCategoryLedger(code)).entries,
  );

  return (
    <Card>
      <CardHeader
        title="Change Rate ledger"
        description="Append-only. A correction is a reversal, and both stay on the record."
      />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">No entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Change Rate entries</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left">
                {['When', 'By', 'Category', 'Kind', 'Amount', 'PHP', 'Reason', ''].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="py-2 text-xs font-semibold text-slate-600 uppercase"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.id}
                  className={
                    entry.isReversed
                      ? 'border-b border-slate-100 text-slate-400 line-through'
                      : 'border-b border-slate-100'
                  }
                >
                  <td className="py-2 text-xs">{manilaStamp(entry.createdAt)}</td>
                  <td className="py-2 text-xs">{entry.createdByName ?? 'system'}</td>
                  <td className="py-2">
                    {snapshot.categoryByCode.get(entry.paxCategory)?.label ?? entry.paxCategory}
                  </td>
                  <td className="py-2">{entry.kind.replace(/_/g, ' ')}</td>
                  <td className="py-2 tabular-nums">
                    {entry.currency} {entry.amount.toLocaleString()}
                  </td>
                  <td className="py-2 tabular-nums">{formatPhp(entry.amountPhp)}</td>
                  <td className="py-2">
                    {entry.reason}
                    {entry.isReversed && (
                      <span className="ml-1 text-xs no-underline">
                        — reversed by {entry.reversedByName ?? 'someone'} on{' '}
                        {entry.reversedAt === null ? '' : manilaStamp(entry.reversedAt)}
                      </span>
                    )}
                    {entry.isReversal && <Badge tone="neutral">reversal</Badge>}
                  </td>
                  <td className="py-2 text-right">
                    {!readOnly && !entry.isReversed && !entry.isReversal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onReverse(entry);
                        }}
                      >
                        Reverse
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {categories.map((code) => {
                const entry = ledger.byCategory.get(code) ?? emptyCategoryLedger(code);
                if (entry.entries.length === 0) return null;
                return (
                  <tr key={code} className="border-t border-slate-200 font-medium">
                    <td colSpan={5} className="py-2">
                      Net for {snapshot.categoryByCode.get(code)?.label ?? code}
                    </td>
                    <td className="py-2 tabular-nums">
                      {formatPhp(entry.hotelRoomTotalPhp + entry.otherNetPhp)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                );
              })}
            </tfoot>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function AirfareAndMarkupCard({
  airfarePhp,
  markupType,
  markupValue,
  readOnly,
  onChange,
}: {
  airfarePhp: number;
  markupType: 'fixed' | 'percent' | null;
  markupValue: number | null;
  readOnly: boolean;
  onChange: (
    airfarePhp: number,
    markupType: 'fixed' | 'percent' | null,
    markupValue: number | null,
  ) => void;
}) {
  const percentTooBig = markupType === 'percent' && (markupValue ?? 0) > 100;

  return (
    <Card>
      <CardHeader title="Airfare & package markup" />
      <CardBody className="space-y-4">
        <Field label="Airfare per person (PHP)">
          <Input
            type="number"
            min={0}
            step="0.01"
            disabled={readOnly}
            value={airfarePhp}
            onChange={(event) => {
              onChange(Math.max(0, Number(event.target.value)), markupType, markupValue);
            }}
          />
        </Field>

        <Field label="Package markup" hint="Percent is applied to hotel + tours + transfers.">
          <Select
            value={markupType ?? 'none'}
            disabled={readOnly}
            onChange={(event) => {
              const next = event.target.value;
              if (next === 'none') onChange(airfarePhp, null, null);
              else onChange(airfarePhp, next === 'percent' ? 'percent' : 'fixed', markupValue ?? 0);
            }}
          >
            <option value="none">None</option>
            <option value="fixed">Fixed PHP</option>
            <option value="percent">Percent</option>
          </Select>
        </Field>

        {markupType !== null && (
          <Field
            label={markupType === 'percent' ? 'Percent' : 'Amount in PHP'}
            error={percentTooBig ? 'A percent markup cannot exceed 100.' : undefined}
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={readOnly}
              value={markupValue ?? 0}
              onChange={(event) => {
                onChange(airfarePhp, markupType, Math.max(0, Number(event.target.value)));
              }}
            />
          </Field>
        )}
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
const LINE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  service: 'Service',
  service_markup: 'Service markup',
  category_markup: 'Category markup',
  package_markup: 'Package markup',
  airfare: 'Airfare',
  adjustment: 'Change Rate',
  rounding: 'Rounding to 99',
};

/**
 * The summary proves its own arithmetic: it sums the lines it actually renders
 * and compares that to the final figure, rather than trusting the engine.
 */
export function DetailedSummary({
  input,
  outputCategories,
  snapshot,
  onGenerate,
  extraBlocking = [],
}: {
  input: QuotationInput;
  outputCategories: readonly string[];
  snapshot: RateSnapshot;
  onGenerate?: () => void;
  /**
   * Reasons to refuse generating that the engine cannot see, because they are
   * about the shape of the trip rather than its arithmetic — tours that need
   * more days than the trip has, for one.
   */
  extraBlocking?: readonly string[];
}) {
  const result = calculateQuotation(input);
  const engineBlocking = result.issues.filter((issue) => issue.severity === 'error');
  const blocking: string[] = [
    ...engineBlocking.map((issue) => issue.code.replace(/_/g, ' ').toLowerCase()),
    ...extraBlocking,
  ];
  const shown = result.categories.filter((category) =>
    outputCategories.includes(category.paxCategory),
  );

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader title="Live summary" description="Per person, by room category." />
      <CardBody className="space-y-4">
        {blocking.length > 0 && (
          <Alert tone="danger" title="Cannot price yet">
            <ul className="list-inside list-disc">
              {blocking.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Alert>
        )}

        {shown.map((category) => (
          <CategoryBreakdown key={category.paxCategory} category={category} snapshot={snapshot} />
        ))}

        <Button
          disabled={blocking.length > 0}
          title={blocking.length === 0 ? undefined : `Fix first: ${blocking.join(', ')}`}
          onClick={onGenerate}
        >
          Generate quotation
        </Button>
        {blocking.length > 0 && (
          <p className="text-xs text-slate-500">Resolve the issues above to generate.</p>
        )}
      </CardBody>
    </Card>
  );
}

function CategoryBreakdown({
  category,
  snapshot,
}: {
  category: CategoryResult;
  snapshot: RateSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const linesTotal = category.breakdown.reduce((sum, line) => sum + line.amount, 0);
  const reconciles = category.final !== null && linesTotal === category.final;

  useEffect(() => {
    if (category.final !== null && !reconciles) {
      console.error(
        `Breakdown does not reconcile for ${category.paxCategory}: lines ${String(linesTotal)} vs final ${String(category.final)}`,
      );
    }
  }, [category.final, category.paxCategory, linesTotal, reconciles]);

  return (
    <div className="border-b border-slate-100 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-700">
          {snapshot.categoryByCode.get(category.paxCategory)?.outputLabel ?? category.outputLabel}
        </span>
        <span className="text-lg font-semibold" data-testid="quotation-total">
          <MoneyText centavos={category.final} />
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>subtotal {formatPhp(category.subtotal)}</span>
        <button
          type="button"
          className="text-brand-700 hover:underline"
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          {open ? 'Hide' : 'Show'} breakdown
        </button>
      </div>

      {open && (
        <>
          <ul className="mt-2 space-y-0.5 text-xs">
            {category.breakdown.map((line, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="text-slate-600">
                  {line.label || (LINE_LABELS[line.kind] ?? line.kind)}
                </span>
                <span className="tabular-nums">{formatPhp(line.amount)}</span>
              </li>
            ))}
          </ul>
          <p
            className={
              reconciles
                ? 'mt-1 text-xs text-emerald-700'
                : 'mt-1 text-xs font-semibold text-red-700'
            }
          >
            Lines total {formatPhp(linesTotal)} = final {reconciles ? '✓' : '✗'}
          </p>
        </>
      )}
    </div>
  );
}
