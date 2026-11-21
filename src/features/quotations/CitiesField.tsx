import { Badge, Checkbox, Field } from '@/components/ui';
import { citySelectionError, type NamedCity } from '@/domain';

export interface CitiesFieldProps {
  readonly cities: readonly NamedCity[];
  readonly selected: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (cityIds: readonly string[]) => void;
}

/**
 * The cities a package covers (FR-001).
 *
 * Checkboxes rather than a multi-select listbox: there are a handful of cities,
 * they are all worth seeing at once, and it works the same on a phone.
 */
export function CitiesField({ cities, selected, disabled, onChange }: CitiesFieldProps) {
  const error = citySelectionError(selected);

  return (
    <Field
      label="Cities covered"
      required
      hint="What the package covers. Tours, transfers and hotels are filtered to these."
      error={error ?? undefined}
    >
      <div className="flex flex-wrap gap-3">
        {cities.map((city) => (
          <Checkbox
            key={city.id}
            label={city.name}
            checked={selected.includes(city.id)}
            disabled={disabled}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...selected, city.id]
                  : selected.filter((id) => id !== city.id),
              );
            }}
          />
        ))}
        {cities.length === 0 && (
          <Badge tone="warning">No cities set up yet. A manager adds these under Content.</Badge>
        )}
      </div>
    </Field>
  );
}
