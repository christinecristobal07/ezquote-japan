import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, IconButton, Input, MoneyText, Select, Alert } from '@/components/ui';
import {
  previewSellingRates,
  tierErrorText,
  tierWarningText,
  validateTiers,
  type DraftTier,
  type FxTable,
  type Markup,
} from '@/domain';

export interface TierEditorProps {
  readonly tiers: readonly DraftTier[];
  readonly currency: string;
  readonly serviceType: 'tour' | 'transfer';
  readonly fx: FxTable;
  readonly serviceMarkups: Readonly<Record<string, Markup>>;
  onChange: (tiers: readonly DraftTier[]) => void;
}

/**
 * Editable group-size bands with a live per-person preview.
 *
 * The preview uses the CURRENT FX and markups, not the ones frozen into any
 * quotation, so it answers "what would this cost if I published now".
 */
export function TierEditor({
  tiers,
  currency,
  serviceType,
  fx,
  serviceMarkups,
  onChange,
}: TierEditorProps) {
  const validation = validateTiers(tiers);
  const preview = previewSellingRates({ currency, serviceType, tiers, fx, serviceMarkups });

  function update(index: number, patch: Partial<DraftTier>): void {
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  }

  function addRow(paxType: 'adult' | 'child'): void {
    const last = [...tiers].filter((t) => t.paxType === paxType).pop();
    const nextMin = last ? Math.min(last.maxPax + 1, 60) : 1;
    onChange([...tiers, { paxType, minPax: nextMin, maxPax: 60, amount: 0 }]);
  }

  function removeRow(index: number): void {
    onChange(tiers.filter((_, i) => i !== index));
  }

  function errorsFor(index: number): string[] {
    return validation.errors.filter((e) => e.row === index).map(tierErrorText);
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <caption className="sr-only">Group-size tiers for this rate version</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th scope="col" className="px-2 py-2 text-xs font-semibold text-slate-600 uppercase">
              Pax type
            </th>
            <th scope="col" className="px-2 py-2 text-xs font-semibold text-slate-600 uppercase">
              Min
            </th>
            <th scope="col" className="px-2 py-2 text-xs font-semibold text-slate-600 uppercase">
              Max
            </th>
            <th scope="col" className="px-2 py-2 text-xs font-semibold text-slate-600 uppercase">
              {currency} per person
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right text-xs font-semibold text-slate-600 uppercase"
            >
              Converted
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right text-xs font-semibold text-slate-600 uppercase"
            >
              + markup
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right text-xs font-semibold text-slate-600 uppercase"
            >
              Per person
            </th>
            <th scope="col" className="px-2 py-2">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, index) => {
            const rowErrors = errorsFor(index);
            const row = preview[index];
            return (
              <tr key={index} className="border-b border-slate-100 align-top">
                <td className="px-2 py-2">
                  <Select
                    aria-label={`Pax type for row ${String(index + 1)}`}
                    value={tier.paxType}
                    onChange={(event) => {
                      update(index, {
                        paxType: event.target.value === 'child' ? 'child' : 'adult',
                      });
                    }}
                  >
                    <option value="adult">Adult</option>
                    <option value="child">Child</option>
                  </Select>
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Minimum pax for row ${String(index + 1)}`}
                    value={tier.minPax}
                    onChange={(event) => {
                      update(index, { minPax: Number(event.target.value) });
                    }}
                    className="w-20"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Maximum pax for row ${String(index + 1)}`}
                    value={tier.maxPax}
                    onChange={(event) => {
                      update(index, { maxPax: Number(event.target.value) });
                    }}
                    className="w-20"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    aria-label={`Amount for row ${String(index + 1)}`}
                    value={tier.amount}
                    onChange={(event) => {
                      update(index, { amount: Number(event.target.value) });
                    }}
                    className="w-28"
                  />
                  {rowErrors.map((message) => (
                    <p key={message} className="mt-1 text-xs text-red-700">
                      {message}
                    </p>
                  ))}
                </td>
                <td className="px-2 py-2 text-right">
                  <MoneyText centavos={row?.convertedPhp ?? null} />
                </td>
                <td className="px-2 py-2 text-right text-slate-600">
                  <MoneyText centavos={row?.markupPhp ?? null} />
                </td>
                <td className="px-2 py-2 text-right font-semibold">
                  <MoneyText centavos={row?.perPersonPhp ?? null} />
                </td>
                <td className="px-2 py-2 text-right">
                  <IconButton
                    aria-label={`Remove row ${String(index + 1)}`}
                    onClick={() => {
                      removeRow(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                </td>
              </tr>
            );
          })}
          {tiers.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-6 text-center text-sm text-slate-600">
                No tiers yet. Add at least one before saving.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            addRow('adult');
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add adult tier
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            addRow('child');
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add child tier
        </Button>
      </div>

      {validation.warnings.length > 0 && (
        <Alert tone="warning" title="Some group sizes have no rate">
          <ul className="list-inside list-disc">
            {validation.warnings.map((warning, index) => (
              <li key={index}>
                {warning.paxType === 'child' ? 'Child: ' : ''}
                {tierWarningText(warning)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {!validation.valid && (
        <Badge tone="danger">Fix {validation.errors.length} problem(s) before publishing</Badge>
      )}
    </div>
  );
}
