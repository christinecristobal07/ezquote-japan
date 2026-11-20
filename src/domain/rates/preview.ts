import { fromPhp, percentOf, toPhp, type Centavos, type FxTable } from '../money.ts';
import type { Markup } from '../snapshot.ts';
import type { DraftTier } from './validateTiers.ts';

export interface PreviewRow {
  readonly paxType: DraftTier['paxType'];
  readonly minPax: number;
  readonly maxPax: number;
  /** What the operator charges, in the service's own currency. */
  readonly operatorAmount: number;
  readonly currency: string;
  /** The operator amount converted to PHP centavos. */
  readonly convertedPhp: Centavos;
  /** The tour or transfer markup applied to this line. */
  readonly markupPhp: Centavos;
  /** What one traveller contributes for this service. */
  readonly perPersonPhp: Centavos;
}

export interface PreviewInput {
  readonly currency: string;
  readonly serviceType: 'tour' | 'transfer';
  readonly tiers: readonly DraftTier[];
  readonly fx: FxTable;
  readonly serviceMarkups: Readonly<Record<string, Markup>>;
}

/**
 * Shows what a tier will cost a traveller once converted and marked up.
 *
 * This is the same arithmetic the rate engine performs when pricing a real
 * quotation — conversion rounds once, and a percent markup applies to the
 * converted operator amount, not to the amount plus add-ons.
 */
export function previewSellingRates(input: PreviewInput): readonly PreviewRow[] {
  const markup = input.serviceMarkups[input.serviceType];

  return input.tiers.map((tier) => {
    const convertedPhp = toPhp(tier.amount, input.currency, input.fx);
    const markupPhp = markup
      ? markup.type === 'fixed'
        ? fromPhp(markup.value)
        : percentOf(convertedPhp, markup.value)
      : 0;

    return {
      paxType: tier.paxType,
      minPax: tier.minPax,
      maxPax: tier.maxPax,
      operatorAmount: tier.amount,
      currency: input.currency,
      convertedPhp,
      markupPhp,
      perPersonPhp: convertedPhp + markupPhp,
    };
  });
}

export interface TierDiffRow {
  readonly paxType: DraftTier['paxType'];
  readonly minPax: number;
  readonly maxPax: number;
  readonly change: 'added' | 'removed' | 'changed' | 'unchanged';
  readonly oldAmount: number | null;
  readonly newAmount: number | null;
}

function bandKey(tier: DraftTier): string {
  return `${tier.paxType}:${String(tier.minPax)}-${String(tier.maxPax)}`;
}

/** Compares a draft against the version it replaces, for the publish dialog. */
export function diffTiers(
  current: readonly DraftTier[],
  next: readonly DraftTier[],
): readonly TierDiffRow[] {
  const before = new Map(current.map((tier) => [bandKey(tier), tier]));
  const after = new Map(next.map((tier) => [bandKey(tier), tier]));
  const keys = [...new Set([...before.keys(), ...after.keys()])];

  const rows: TierDiffRow[] = keys.map((key) => {
    const oldTier = before.get(key);
    const newTier = after.get(key);
    const shape = newTier ?? oldTier;
    if (!shape) throw new Error('diffTiers: a key with no tier on either side');

    let change: TierDiffRow['change'];
    if (!oldTier) change = 'added';
    else if (!newTier) change = 'removed';
    else change = oldTier.amount === newTier.amount ? 'unchanged' : 'changed';

    return {
      paxType: shape.paxType,
      minPax: shape.minPax,
      maxPax: shape.maxPax,
      change,
      oldAmount: oldTier?.amount ?? null,
      newAmount: newTier?.amount ?? null,
    };
  });

  return rows.sort(
    (a, b) => a.paxType.localeCompare(b.paxType) || a.minPax - b.minPax || a.maxPax - b.maxPax,
  );
}
