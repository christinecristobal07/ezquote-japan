import { Alert, Checkbox } from '@/components/ui';
import { categoryFit, fitHint, unfitSelected } from '@/domain';

export interface OutputCategoriesFieldProps {
  readonly categories: readonly string[];
  readonly selected: readonly string[];
  readonly adults: number;
  readonly children: number;
  readonly disabled: boolean;
  readonly onChange: (next: readonly string[]) => void;
}

/**
 * Which occupancy categories the quotation shows.
 *
 * Every category used to be tickable whatever the group size, so an agent
 * quoting two people could send a QUAD SHARE rate for a room those two cannot
 * fill. A category the party cannot form is now disabled and says why.
 *
 * One that is already ticked stays tickable, so it can be cleared — the same
 * rule as city scope: flag what no longer fits, never silently rewrite a
 * quotation someone may already have sent.
 */
export function OutputCategoriesField({
  categories,
  selected,
  adults,
  children,
  disabled,
  onChange,
}: OutputCategoriesFieldProps) {
  const unfit = unfitSelected(selected, adults, children);

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">Categories to show</legend>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {categories.map((category) => {
          const checked = selected.includes(category);
          const last = checked && selected.length === 1;
          const fit = categoryFit(category, adults, children);
          const hint = fitHint(fit);

          return (
            <span key={category} className="flex flex-col">
              <Checkbox
                label={category.replace('_', ' ')}
                checked={checked}
                disabled={disabled || last || (!fit.allowed && !checked)}
                title={fit.reason ?? undefined}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...selected, category]
                      : selected.filter((value) => value !== category),
                  );
                }}
              />
              {hint !== null && (
                <span
                  className={
                    fit.allowed ? 'ml-6 text-xs text-slate-500' : 'ml-6 text-xs text-amber-700'
                  }
                >
                  {hint}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {unfit.length > 0 && (
        <Alert tone="warning" className="mt-3" title="Some categories no longer fit">
          <p>
            The group changed since these were chosen. Nothing was removed; untick what no longer
            applies.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {unfit.map((fit) => (
              <li key={fit.code}>
                {fit.code.replace('_', ' ')} — {fit.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </fieldset>
  );
}
