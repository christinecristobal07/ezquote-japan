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
} from '@/components/ui';
import {
  calculateQuotation,
  resolveDuration,
  tierLabel,
  type CategoryResult,
  type ItineraryDay,
  type ItineraryIssue,
  type QuotationInput,
  type RateSnapshot,
  type SnapshotService,
} from '@/domain';

// -----------------------------------------------------------------------------
export function TravellersSection({
  adults,
  children,
  snapshot,
  disabled,
  onChange,
}: {
  adults: number;
  children: number;
  snapshot: RateSnapshot;
  disabled: boolean;
  onChange: (adults: number, children: number) => void;
}) {
  const total = adults + children;
  const sample = snapshot.services[0];
  const band = sample === undefined ? null : tierLabel(snapshot, sample.serviceId, total);

  return (
    <Card>
      <CardHeader
        title="Travellers"
        description="The group size picks the rate band — children included."
      />
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <Field label="Adults">
          <Input
            type="number"
            min={0}
            disabled={disabled}
            value={adults}
            onChange={(event) => {
              onChange(Math.max(0, Number(event.target.value)), children);
            }}
          />
        </Field>
        <Field label="Children">
          <Input
            type="number"
            min={0}
            disabled={disabled}
            value={children}
            onChange={(event) => {
              onChange(adults, Math.max(0, Number(event.target.value)));
            }}
          />
        </Field>
        <Field label="Total" hint={band === null ? 'No band covers this size.' : `${band} tier`}>
          <Input readOnly value={total} />
        </Field>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function DurationSection({
  mode,
  days,
  services,
  disabled,
  onChange,
}: {
  mode: 'derived' | 'agent_selected';
  days: number;
  services: readonly { consumesDay: boolean; addsNight: boolean }[];
  disabled: boolean;
  onChange: (mode: 'derived' | 'agent_selected', days: number) => void;
}) {
  const resolved = resolveDuration(
    mode === 'derived'
      ? { mode: 'derived', services }
      : { mode: 'agent_selected', agentDays: days, services },
  );

  return (
    <Card>
      <CardHeader title="Duration" description={resolved.label} />
      <CardBody className="space-y-4">
        <Field label="How the length is decided">
          <Select
            value={mode}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value === 'derived' ? 'derived' : 'agent_selected';
              onChange(next, next === 'derived' ? resolved.requiredDays : days);
            }}
          >
            <option value="derived">Derived from services</option>
            <option value="agent_selected">Choose manually</option>
          </Select>
        </Field>

        {mode === 'agent_selected' && (
          <Field label="Days">
            <Select
              value={String(days)}
              disabled={disabled}
              onChange={(event) => {
                onChange('agent_selected', Number(event.target.value));
              }}
            >
              {[3, 4, 5, 6, 7].map((value) => (
                <option key={value} value={value}>
                  {value}D{value - 1}N
                </option>
              ))}
            </Select>
          </Field>
        )}

        {resolved.warnings.includes('TOURS_DO_NOT_FIT') && (
          <Alert tone="warning" title="The tours do not fit">
            These services need {resolved.requiredDays} days. Either lengthen the trip or remove a
            tour.
          </Alert>
        )}
        {resolved.warnings.includes('EXCEEDS_MAX_DURATION') && (
          <Alert tone="warning" title="Longer than 7D6N">
            Quotations are designed for 3D2N up to 7D6N.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export interface ServiceCardData {
  readonly service: SnapshotService;
  readonly selected: boolean;
  readonly addonIds: readonly string[];
  readonly perPersonPhp: number | null;
  /** Services with no tier for this group size cannot be quoted. */
  readonly quotable: boolean;
  /** Selected, but in a city the quotation no longer covers (FR-001). */
  readonly outOfScope: boolean;
}

export function ServicesSection({
  tours,
  transfers,
  disabled,
  onToggle,
  onToggleAddon,
}: {
  tours: readonly ServiceCardData[];
  transfers: readonly ServiceCardData[];
  disabled: boolean;
  onToggle: (serviceId: string, selected: boolean) => void;
  onToggleAddon: (serviceId: string, addonId: string, selected: boolean) => void;
}) {
  function group(title: string, items: readonly ServiceCardData[]) {
    return (
      <div key={title}>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {title}
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((entry) => (
            <li
              key={entry.service.serviceId}
              className={
                entry.selected
                  ? 'border-brand-600 bg-brand-50 rounded-lg border p-3'
                  : 'rounded-lg border border-slate-200 p-3'
              }
            >
              <Checkbox
                label={entry.service.name}
                checked={entry.selected}
                disabled={disabled || !entry.quotable}
                onChange={(event) => {
                  onToggle(entry.service.serviceId, event.target.checked);
                }}
              />
              <p className="mt-1 text-sm">
                {entry.quotable ? (
                  <MoneyText centavos={entry.perPersonPhp} />
                ) : (
                  <Badge tone="neutral">No rate yet</Badge>
                )}
                <span className="ml-1 text-xs text-slate-500">per person</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {entry.service.consumesDay && <Badge tone="info">Consumes day</Badge>}
                {entry.service.addsNight && <Badge tone="info">Adds night</Badge>}
                {entry.service.transferDirection !== null && (
                  <Badge tone="neutral">
                    {entry.service.transferDirection === 'one_way' ? 'One way' : 'Round trip'}
                  </Badge>
                )}
                {entry.outOfScope && <Badge tone="warning">Outside the chosen cities</Badge>}
              </p>
              {entry.selected &&
                entry.service.addons.map((addon) => (
                  <Checkbox
                    key={addon.id}
                    className="mt-2"
                    label={`${addon.name} +${String(addon.amount)} ${entry.service.currency}`}
                    checked={entry.addonIds.includes(addon.id)}
                    disabled={disabled}
                    onChange={(event) => {
                      onToggleAddon(entry.service.serviceId, addon.id, event.target.checked);
                    }}
                  />
                ))}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Tours & transfers"
        description="Filtered to the cities this package covers. Only services that were available when this quotation was created."
      />
      <CardBody className="space-y-6">
        {group('Tours', tours)}
        {group('Transfers', transfers)}
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function ItinerarySection({
  days,
  issues,
  assignableDays,
  dayByService,
  serviceNames,
  disabled,
  onAssign,
  onAutoArrange,
}: {
  days: readonly ItineraryDay[];
  issues: readonly ItineraryIssue[];
  assignableDays: readonly number[];
  dayByService: ReadonlyMap<string, number | null>;
  serviceNames: ReadonlyMap<string, string>;
  disabled: boolean;
  onAssign: (serviceId: string, day: number | null) => void;
  onAutoArrange: () => void;
}) {
  const dayConsuming = [...dayByService.keys()];

  return (
    <Card>
      <CardHeader
        title="Itinerary"
        description="Day 1 is arrival and the last day departure."
        actions={
          <Button size="sm" variant="secondary" disabled={disabled} onClick={onAutoArrange}>
            Auto-arrange
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {issues.length > 0 && (
          <Alert tone="warning" title="Check the day assignments">
            <ul className="list-inside list-disc">
              {issues.map((issue, index) => (
                <li key={index}>
                  {serviceNames.get(issue.serviceId) ?? issue.serviceId}:{' '}
                  {issue.code === 'DAY_CONFLICT'
                    ? `two tours share day ${String(issue.dayNumber ?? 0)}`
                    : issue.code === 'DAY_OUT_OF_RANGE'
                      ? `day ${String(issue.dayNumber ?? 0)} is not a tour day`
                      : 'no day chosen yet'}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {dayConsuming.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {dayConsuming.map((serviceId) => (
              <Field key={serviceId} label={serviceNames.get(serviceId) ?? serviceId}>
                <Select
                  value={String(dayByService.get(serviceId) ?? '')}
                  disabled={disabled}
                  onChange={(event) => {
                    onAssign(
                      serviceId,
                      event.target.value === '' ? null : Number(event.target.value),
                    );
                  }}
                >
                  <option value="">Not scheduled</option>
                  {assignableDays.map((day) => (
                    <option key={day} value={day}>
                      Day {day}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        )}

        <ol className="space-y-3">
          {days.map((day) => (
            <li key={day.dayNumber} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">
                Day {day.dayNumber} · {day.title}
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{day.body}</p>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
export function SummarySection({
  input,
  outputCategories,
}: {
  input: QuotationInput;
  outputCategories: readonly string[];
}) {
  const result = calculateQuotation(input);
  const blocking = result.issues.filter((issue) => issue.severity === 'error');
  const missingHotel = result.issues.some((issue) => issue.code === 'MISSING_HOTEL_COST');

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader title="Live summary" description="Per person, by room category." />
      <CardBody className="space-y-3">
        {missingHotel && (
          <Alert tone="warning" title="Hotel cost not entered">
            Hotel cost is entered in the next section (Step 12).
          </Alert>
        )}
        {blocking.length > 0 && (
          <Alert tone="danger" title="Cannot price yet">
            <ul className="list-inside list-disc">
              {blocking.map((issue, index) => (
                <li key={index}>{issue.code.replace(/_/g, ' ').toLowerCase()}</li>
              ))}
            </ul>
          </Alert>
        )}

        <ul className="space-y-1 text-sm">
          {result.categories
            .filter((category: CategoryResult) => outputCategories.includes(category.paxCategory))
            .map((category) => (
              <li key={category.paxCategory} className="flex justify-between gap-4">
                <span className="text-slate-700">{category.outputLabel}</span>
                <MoneyText centavos={category.final} />
              </li>
            ))}
        </ul>
      </CardBody>
    </Card>
  );
}
