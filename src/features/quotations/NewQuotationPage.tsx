import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
} from '@/components/ui';
import { citySelectionError, formatValidityDate, MAX_PAX, MIN_PAX } from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import { getQuotation, setCities, setServices } from '@/data/repositories/quotationRepository';
import { useAppSettings, useCities } from '@/features/content/queries';
import { useMaxValidUntil } from '@/features/rates/queries';
import { CitiesField } from './CitiesField';
import { useCreateQuotation } from './queries';

/** Today in Manila, so a traveller cannot pick a date already past there. */
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date());
}

export function NewQuotationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateQuotation();
  const settings = useAppSettings();
  const cities = useCities();
  const maxValidUntil = useMaxValidUntil();

  const [clientName, setClientName] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [hotelCategory, setHotelCategory] = useState(3);
  const [cityIds, setCityIds] = useState<readonly string[]>([]);

  const today = manilaToday();
  const total = adults + children;
  const paxError =
    total < MIN_PAX || total > MAX_PAX
      ? `The group must be between ${String(MIN_PAX)} and ${String(MAX_PAX)} travellers.`
      : undefined;
  const lastSellable = maxValidUntil.data ?? null;
  const pastValidity = travelDate !== '' && lastSellable !== null && travelDate > lastSellable;

  const dateError =
    travelDate !== '' && travelDate < today
      ? 'The travel date cannot be in the past.'
      : pastValidity
        ? `Rates only run to ${formatValidityDate(lastSellable) ?? lastSellable}. Ask Product Development to extend them before quoting this date.`
        : undefined;
  const cityError = citySelectionError(cityIds);
  const canSubmit = paxError === undefined && dateError === undefined && cityError === null;

  async function submit(): Promise<void> {
    const header = await create.mutateAsync({
      clientName: clientName.trim() === '' ? null : clientName.trim(),
      travelDate: travelDate === '' ? null : travelDate,
      paxAdults: adults,
      paxChildren: children,
      hotelCategory,
    });

    await setCities(header.id, cityIds);

    // Pre-select the defaults, but only those the new snapshot actually has.
    const raw = settings.data?.find((row) => row.key === 'quotation.default_service_codes')?.value;
    const codes = Array.isArray(raw)
      ? raw.filter((code): code is string => typeof code === 'string')
      : [];

    if (codes.length > 0) {
      const detail = await getQuotation(header.id);
      const available = (detail?.snapshot.services ?? []).filter((service) =>
        codes.includes(service.code),
      );
      if (available.length > 0) {
        await setServices(
          header.id,
          available.map((service, index) => ({
            serviceId: service.serviceId,
            dayNumber: null,
            sortOrder: index + 1,
            addonIds: [],
          })),
        );
      }
    }

    await navigate(`/quotations/${header.id}`);
  }

  return (
    <>
      <PageHeader
        title="New quotation"
        description="A few details to start. Everything else is set in the builder."
      />

      <Card>
        <CardHeader title="Trip basics" />
        <CardBody className="space-y-4">
          <Alert tone="info">
            Creating the quotation freezes today&apos;s rates into it. Later rate changes will not
            affect it.
          </Alert>

          <CitiesField
            cities={(cities.data ?? []).filter((city) => city.isActive)}
            selected={cityIds}
            disabled={create.isPending}
            onChange={setCityIds}
          />

          <Field label="Client name" hint="Optional. It appears on the quotation.">
            <Input
              value={clientName}
              onChange={(event) => {
                setClientName(event.target.value);
              }}
            />
          </Field>

          <Field
            label="Travel date"
            hint={
              lastSellable === null
                ? 'Optional.'
                : `Optional. Rates currently run to ${formatValidityDate(lastSellable) ?? lastSellable}.`
            }
            error={dateError}
          >
            <Input
              type="date"
              min={today}
              {...(lastSellable === null ? {} : { max: lastSellable })}
              value={travelDate}
              onChange={(event) => {
                setTravelDate(event.target.value);
              }}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Adults" required>
              <Input
                type="number"
                min={0}
                value={adults}
                onChange={(event) => {
                  setAdults(Math.max(0, Number(event.target.value)));
                }}
              />
            </Field>
            <Field label="Children" required>
              <Input
                type="number"
                min={0}
                value={children}
                onChange={(event) => {
                  setChildren(Math.max(0, Number(event.target.value)));
                }}
              />
            </Field>
            <Field label="Total travellers" error={paxError}>
              <Input readOnly value={total} />
            </Field>
          </div>

          <Field label="Hotel category" required>
            <Select
              value={String(hotelCategory)}
              onChange={(event) => {
                setHotelCategory(Number(event.target.value));
              }}
            >
              <option value="3">3 star</option>
              <option value="4">4 star</option>
              <option value="5">5 star</option>
            </Select>
          </Field>

          <Button
            loading={create.isPending}
            disabled={!canSubmit}
            onClick={() => {
              void submit().catch((caught: unknown) => {
                toast.error(
                  caught instanceof ContentError
                    ? caught.message
                    : 'Could not create the quotation.',
                );
              });
            }}
          >
            Create quotation
          </Button>
        </CardBody>
      </Card>
    </>
  );
}
