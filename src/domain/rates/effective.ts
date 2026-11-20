export interface EffectiveRow {
  readonly id: string;
  /** ISO timestamp. The row takes effect from this instant. */
  readonly effectiveFrom: string;
}

export interface EffectiveSplit<Row extends EffectiveRow> {
  /** The row in force right now, or null when nothing has taken effect yet. */
  readonly current: Row | null;
  /** Rows dated in the future, soonest first. */
  readonly scheduled: readonly Row[];
  /** Everything the current row superseded, newest first. */
  readonly history: readonly Row[];
}

/**
 * Splits append-only rows (FX rates, markups) into what applies now, what is
 * queued, and what it replaced.
 *
 * These tables are never updated: a change is a new row with its own
 * effective_from, and the newest row that has already taken effect wins.
 */
export function currentAndScheduled<Row extends EffectiveRow>(
  rows: readonly Row[],
  now: Date,
): EffectiveSplit<Row> {
  const stamp = now.getTime();
  const sorted = [...rows].sort(
    (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
  );

  const effective = sorted.filter((row) => new Date(row.effectiveFrom).getTime() <= stamp);
  const scheduled = sorted.filter((row) => new Date(row.effectiveFrom).getTime() > stamp).reverse();

  return {
    current: effective[0] ?? null,
    scheduled,
    history: effective.slice(1),
  };
}

/** Percentage difference between two rates, for the "big change" warning. */
export function percentChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return ((to - from) / Math.abs(from)) * 100;
}
