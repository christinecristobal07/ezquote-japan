import { useState } from 'react';
import { z } from 'zod';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { normalizeMultiline } from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import { useAppSettings, useSaveAppSetting, useServiceMeta } from './queries';

/**
 * Each setting is validated against its own schema before saving, because the
 * column is plain jsonb and a wrong shape would only surface much later, in
 * the quotation output.
 */
const SCHEMAS = {
  'quotation.validity_label': z.string().min(1, 'Say what the validity line should read.'),
  'quotation.default_service_codes': z.array(z.string().regex(/^[a-z0-9_]+$/)),
  'itinerary.arrival_text': z.string().min(1, 'Arrival text is required.'),
  'itinerary.departure_text': z.string().min(1, 'Departure text is required.'),
  'itinerary.free_day_text': z.string().min(1, 'Free day text is required.'),
} as const;

type SettingKey = keyof typeof SCHEMAS;

const TEXT_KEYS: readonly { key: SettingKey; label: string; hint: string; rows: number }[] = [
  {
    key: 'quotation.validity_label',
    label: 'Validity label',
    hint: 'Printed on every quotation.',
    rows: 2,
  },
  {
    key: 'itinerary.arrival_text',
    label: 'Arrival day text',
    hint: 'The first day of every itinerary.',
    rows: 2,
  },
  {
    key: 'itinerary.departure_text',
    label: 'Departure day text',
    hint: 'The last day of every itinerary.',
    rows: 2,
  },
  {
    key: 'itinerary.free_day_text',
    label: 'Free day text',
    hint: 'Used for days with no tour.',
    rows: 2,
  },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asCodes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function SettingsPage() {
  const toast = useToast();
  const settings = useAppSettings();
  const services = useServiceMeta();
  const save = useSaveAppSetting();

  const [edits, setEdits] = useState<Partial<Record<SettingKey, string>>>({});
  const [codes, setCodes] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});

  if (settings.isPending || services.isPending) return <Spinner label="Loading settings…" />;

  const byKey = new Map((settings.data ?? []).map((row) => [row.key, row.value]));
  const currentCodes = codes ?? asCodes(byKey.get('quotation.default_service_codes'));
  const activeServices = (services.data ?? []).filter((service) => service.isActive);

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  function persist(key: SettingKey, raw: unknown): void {
    const parsed = SCHEMAS[key].safeParse(raw);
    if (!parsed.success) {
      setErrors((current) => ({
        ...current,
        [key]: parsed.error.issues[0]?.message ?? 'That value is not valid.',
      }));
      return;
    }
    setErrors((current) => ({ ...current, [key]: undefined }));
    save.mutate(
      { key, value: parsed.data },
      {
        onSuccess: () => {
          toast.success('Setting saved.');
        },
        onError: reportError,
      },
    );
  }

  return (
    <>
      <Alert tone="info" className="mb-6">
        These values appear on every new quotation. Existing quotations are unaffected.
      </Alert>

      <Card className="mb-6">
        <CardHeader title="Text" description="Wording reused across quotations." />
        <CardBody className="space-y-4">
          {TEXT_KEYS.map((entry) => {
            const value = edits[entry.key] ?? asString(byKey.get(entry.key));
            return (
              <div key={entry.key}>
                <Field label={entry.label} hint={entry.hint} error={errors[entry.key]}>
                  <Textarea
                    rows={entry.rows}
                    value={value}
                    onChange={(event) => {
                      setEdits((current) => ({ ...current, [entry.key]: event.target.value }));
                    }}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  loading={save.isPending}
                  onClick={() => {
                    persist(entry.key, normalizeMultiline(value));
                  }}
                >
                  Save
                </Button>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Default services"
          description="Pre-selected when an agent starts a new quotation."
        />
        <CardBody>
          <fieldset className="space-y-2">
            <legend className="sr-only">Default services</legend>
            {activeServices.map((service) => (
              <Checkbox
                key={service.id}
                label={`${service.name} (${service.code})`}
                checked={currentCodes.includes(service.code)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...currentCodes, service.code]
                    : currentCodes.filter((code) => code !== service.code);
                  setCodes(next);
                }}
              />
            ))}
          </fieldset>
          {errors['quotation.default_service_codes'] !== undefined && (
            <p className="mt-2 text-sm text-red-700">{errors['quotation.default_service_codes']}</p>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            loading={save.isPending}
            onClick={() => {
              persist('quotation.default_service_codes', currentCodes);
            }}
          >
            Save defaults
          </Button>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="All settings" description="Raw values, for reference." />
        <CardBody>
          <dl className="space-y-2 text-sm">
            {(settings.data ?? []).map((row) => (
              <div key={row.key} className="grid gap-1 sm:grid-cols-[18rem_1fr]">
                <dt className="font-mono text-xs text-slate-600">{row.key}</dt>
                <dd className="break-words whitespace-pre-wrap text-slate-800">
                  {JSON.stringify(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <div className="mt-6">
        <Field label="Quick check" hint="Nothing is saved until you press a Save button.">
          <Input readOnly value={`${String(currentCodes.length)} default service(s) selected`} />
        </Field>
      </div>
    </>
  );
}
