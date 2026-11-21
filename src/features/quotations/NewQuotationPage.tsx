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
import { MAX_PAX, MIN_PAX } from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import { setServices } from '@/data/repositories/quotationRepository';
import { useAppSettings } from '@/features/content/queries';
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

  const [clientName, setClientName] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [hotelCategory, setHotelCategory] = useState(3);

  const today = manilaToday();
  const total = adults + children;
  const paxError =
    total < MIN_PAX || total > MAX_PAX
      ? `The group must be between ${String(MIN_PAX)} and ${String(MAX_PAX)} travellers.`
      : undefined;
  const dateError =
    travelDate !== '' && travelDate < today ? 'The travel date cannot be in the past.' : undefined;
  const canSubmit = paxError === undefined && dateError === undefined;

  async function submit(): Promise<void> {
    const header = await create.mutateAsync({
      clientName: clientName.trim() === '' ? null : clientName.trim(),
      travelDate: travelDate === '' ? null : travelDate,
      paxAdults: adults,
      paxChildren: children,
      hotelCategory,
    });

    // Pre-select the defaults, but only those the new snapshot actually has.
    const raw = settings.data?.find((row) => row.key === 'quotation.default_service_codes')?.value;
    const codes = Array.isArray(raw)
      ? raw.filter((code): code is string => typeof code === 'string')
      : [];

    if (codes.length > 0) {
      const detail = await import('@/data/repositories/quotationRepository').then((module) =>
        module.getQuotation(header.id),
      );
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

      <Card className="max-w-2xl">
        <CardHeader title="Trip basics" />
        <CardBody className="space-y-4">
          <Alert tone="info">
            Creating the quotation freezes today&apos;s rates into it. Later rate changes will not
            affect it.
          </Alert>

          <Field label="Client name" hint="Optional. It appears on the quotation.">
            <Input
              value={clientName}
              onChange={(event) => {
                setClientName(event.target.value);
              }}
            />
          </Field>

          <Field label="Travel date" hint="Optional." error={dateError}>
            <Input
              type="date"
              min={today}
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
