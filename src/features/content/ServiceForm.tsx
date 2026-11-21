import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
  Select,
  Textarea,
} from '@/components/ui';
import { formatContentLine, normalizeMultiline, slugifyCode } from '@/domain';
import { type ServiceFormValues } from './serviceFormValues';
import type { City, Operator } from '@/data/repositories/referenceRepository';

export interface ServiceFormProps {
  readonly mode: 'create' | 'edit';
  readonly initial: ServiceFormValues;
  readonly cities: readonly City[];
  readonly operators: readonly Operator[];
  /** Null when the service has no published rate, for the warning badge. */
  readonly serviceId?: string | undefined;
  readonly hasPublishedRate?: boolean | undefined;
  readonly busy?: boolean;
  onSubmit: (values: ServiceFormValues) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ServiceForm({
  mode,
  initial,
  cities,
  operators,
  serviceId,
  hasPublishedRate,
  busy = false,
  onSubmit,
  onCancel,
  onDirtyChange,
}: ServiceFormProps) {
  const [values, setValues] = useState<ServiceFormValues>(initial);
  const [codeTouched, setCodeTouched] = useState(mode === 'edit');

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function set<K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const isTransfer = values.serviceType === 'transfer';
  const nameError = values.name.trim() === '' ? 'A name is required.' : undefined;
  const directionError =
    isTransfer && values.transferDirection === null ? 'Choose a direction.' : undefined;
  const canSubmit = nameError === undefined && directionError === undefined && !busy;

  const itineraryPreview = normalizeMultiline(values.itineraryText ?? '');
  const inclusionPreview = formatContentLine('inclusion', values.inclusionText ?? '', {
    duration: '3D2N',
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          ...values,
          name: values.name.trim(),
          description: normalizeOrNull(values.description),
          itineraryTitle: normalizeOrNull(values.itineraryTitle),
          itineraryText: normalizeOrNull(values.itineraryText),
          inclusionText: normalizeOrNull(values.inclusionText),
          transferDirection: isTransfer ? values.transferDirection : null,
        });
      }}
      className="grid gap-6 lg:grid-cols-2"
    >
      <Card>
        <CardHeader title={mode === 'create' ? 'New service' : 'Edit service'} />
        <CardBody className="space-y-4">
          <Field label="Name" required error={nameError}>
            <Input
              value={values.name}
              onChange={(event) => {
                const name = event.target.value;
                set('name', name);
                if (mode === 'create' && !codeTouched) set('code', slugifyCode(name));
              }}
            />
          </Field>

          <Field
            label="Code"
            required
            hint={
              mode === 'create'
                ? 'Generated from the name. It can never be changed later.'
                : 'The code is fixed once a service exists.'
            }
          >
            <Input
              value={values.code}
              readOnly={mode === 'edit'}
              disabled={mode === 'edit'}
              onChange={(event) => {
                setCodeTouched(true);
                // Keep what is typed, minus characters the column rejects.
                set('code', event.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_'));
              }}
            />
          </Field>

          <Field label="Type" required hint={mode === 'edit' ? 'The type is fixed.' : undefined}>
            <Select
              value={values.serviceType}
              disabled={mode === 'edit'}
              onChange={(event) => {
                const next = event.target.value === 'transfer' ? 'transfer' : 'tour';
                set('serviceType', next);
                set('transferDirection', next === 'transfer' ? 'round_trip' : null);
                if (next === 'transfer') set('consumesDay', false);
              }}
            >
              <option value="tour">Tour</option>
              <option value="transfer">Transfer</option>
            </Select>
          </Field>

          {isTransfer && (
            <Field label="Direction" required error={directionError}>
              <Select
                value={values.transferDirection ?? 'round_trip'}
                onChange={(event) => {
                  set(
                    'transferDirection',
                    event.target.value === 'one_way' ? 'one_way' : 'round_trip',
                  );
                }}
              >
                <option value="round_trip">Round trip</option>
                <option value="one_way">One way</option>
              </Select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City">
              <Select
                value={values.cityId ?? ''}
                onChange={(event) => {
                  set('cityId', event.target.value === '' ? null : event.target.value);
                }}
              >
                <option value="">None</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Operator">
              <Select
                value={values.operatorId ?? ''}
                onChange={(event) => {
                  set('operatorId', event.target.value === '' ? null : event.target.value);
                }}
              >
                <option value="">None</option>
                {operators.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              rows={2}
              value={values.description ?? ''}
              onChange={(event) => {
                set('description', event.target.value);
              }}
            />
          </Field>

          <Field label="Itinerary title" hint="The first line of the day in the quotation.">
            <Input
              value={values.itineraryTitle ?? ''}
              onChange={(event) => {
                set('itineraryTitle', event.target.value);
              }}
            />
          </Field>

          <Field label="Itinerary text" hint="One stop per line. Emoji are kept exactly as typed.">
            <Textarea
              rows={8}
              value={values.itineraryText ?? ''}
              onChange={(event) => {
                set('itineraryText', event.target.value);
              }}
            />
          </Field>

          <Field label="Inclusion line" hint="How this service appears under Inclusions.">
            <Input
              value={values.inclusionText ?? ''}
              onChange={(event) => {
                set('inclusionText', event.target.value);
              }}
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="Consumes a day"
              checked={values.consumesDay}
              onChange={(event) => {
                set('consumesDay', event.target.checked);
              }}
            />
            <Checkbox
              label="Adds a night"
              checked={values.addsNight}
              onChange={(event) => {
                set('addsNight', event.target.checked);
              }}
            />
            <Checkbox
              label="Active"
              checked={values.isActive}
              onChange={(event) => {
                set('isActive', event.target.checked);
              }}
            />
          </div>

          <Field label="Sort order">
            <Input
              type="number"
              value={values.sortOrder}
              onChange={(event) => {
                set('sortOrder', Number(event.target.value));
              }}
              className="w-28"
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!canSubmit}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Preview" description="Exactly how this appears in a 3D2N quotation." />
        <CardBody className="space-y-4">
          {mode === 'edit' && hasPublishedRate === false && (
            <Alert tone="warning" title="No published rate">
              This service cannot be priced yet.{' '}
              {serviceId !== undefined && (
                <Link to={`/admin/rates/${serviceId}`} className="underline">
                  Set a rate
                </Link>
              )}
            </Alert>
          )}

          <div>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Itinerary day
            </h3>
            <div className="mt-1 rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-semibold">{values.itineraryTitle ?? '(no title)'}</p>
              <p className="whitespace-pre-wrap">{itineraryPreview || '(no itinerary text)'}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Inclusion line
            </h3>
            <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">
              {values.inclusionText === null || values.inclusionText === ''
                ? '(no inclusion text)'
                : inclusionPreview.text}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {values.consumesDay && <Badge tone="info">Consumes day</Badge>}
            {values.addsNight && <Badge tone="info">Adds night</Badge>}
            {isTransfer && (
              <Badge tone="neutral">
                {values.transferDirection === 'one_way' ? 'One way' : 'Round trip'}
              </Badge>
            )}
            <Badge tone={values.isActive ? 'success' : 'neutral'}>
              {values.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}

function normalizeOrNull(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeMultiline(value);
  return normalized === '' ? null : normalized;
}
