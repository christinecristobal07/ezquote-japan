export {
  add,
  formatPhp,
  fromPhp,
  percentOf,
  scaleBy,
  toPhp,
  toScaledRate,
  MoneyError,
  FX_SCALE,
  type Centavos,
  type CurrencyCode,
  type FxTable,
  type ScaledRate,
} from './money.ts';

export {
  parseSnapshot,
  SnapshotError,
  type Markup,
  type RateSnapshot,
  type SnapshotAddon,
  type SnapshotCategory,
  type SnapshotService,
  type SnapshotTier,
} from './snapshot.ts';

export { findTier, type PaxType } from './tiers.ts';

export { roundUpTo99 } from './rounding.ts';

export {
  calculateQuotation,
  MAX_PAX,
  MIN_PAX,
  type BreakdownKind,
  type BreakdownLine,
  type CategoryResult,
  type Issue,
  type IssueCode,
  type IssueSeverity,
  type QuotationAdjustment,
  type QuotationInput,
  type QuotationResult,
  type SelectedService,
} from './rateEngine.ts';

export {
  resolveDuration,
  MAX_DAYS,
  MIN_DAYS,
  type DurationInput,
  type DurationMode,
  type DurationResult,
  type DurationService,
  type DurationWarning,
} from './duration.ts';

export * from './rates/index.ts';

export * from './content/index.ts';
export * from './output/index.ts';
