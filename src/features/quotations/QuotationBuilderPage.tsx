import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Tooltip,
  useToast,
} from '@/components/ui';
import {
  autoAssignDays,
  buildItinerary,
  calculateQuotation,
  cityNames,
  defaultPackageTitle,
  filterToCities,
  inCityScope,
  outOfCityScope,
  quotationValidity,
  resolveDuration,
  validityWarning,
  ledgerView,
  toEngineInput,
  type AdjustmentRecord,
  type ItineraryService,
} from '@/domain';
import type { Database } from '@/data/database.types';

type PaxCategory = Database['public']['Enums']['pax_category'];
import { can, isManager } from '@/domain/permissions';
import { ConflictError, ContentError } from '@/data/repositories/contentRepository';
import type { NewAdjustment } from '@/data/repositories/adjustmentRepository';
import type { ServiceSelection } from '@/data/repositories/quotationRepository';
import { useAuth } from '@/features/auth/useAuth';
import {
  useAppSettings,
  useCities,
  useHotels,
  useServiceMeta,
  useBookingSites,
} from '@/features/content/queries';
import {
  DurationSection,
  ItinerarySection,
  ServicesSection,
  TravellersSection,
  type ServiceCardData,
} from './BuilderSections';
import {
  useAddAdjustments,
  useAdjustments,
  useQuotation,
  useReverseAdjustment,
  useSetCities,
  useSetHotels,
  useSetServices,
  useUpdatePricing,
  useUpdateQuotation,
} from './queries';
import {
  AdjustmentForm,
  AirfareAndMarkupCard,
  DetailedSummary,
  HotelCostCard,
  LedgerTable,
} from './PricingSections';
import { CitiesField } from './CitiesField';
import { OutputCategoriesField } from './OutputCategoriesField';
import { SnapshotPanel } from './SnapshotPanel';
import { saveStateLabel, useAutosave } from './useAutosave';

const ALL_CATEGORIES: readonly PaxCategory[] = [
  'quad',
  'triple',
  'twin',
  'solo',
  'child',
  'sneak_in',
];

function settingText(
  settings: readonly { key: string; value: unknown }[] | undefined,
  key: string,
  fallback: string,
): string {
  const value = settings?.find((row) => row.key === key)?.value;
  return typeof value === 'string' && value !== '' ? value : fallback;
}

export function QuotationBuilderPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { profile } = useAuth();

  const quotation = useQuotation(id);
  const serviceMeta = useServiceMeta();
  const settings = useAppSettings();
  const hotels = useHotels();
  const bookingSites = useBookingSites();
  const cities = useCities();

  const update = useUpdateQuotation(id);
  const setServices = useSetServices(id);
  const setHotels = useSetHotels(id);
  const setCities = useSetCities(id);
  const adjustments = useAdjustments(id);
  const addAdjustments = useAddAdjustments(id);
  const reverseAdjustment = useReverseAdjustment(id);
  const updatePricing = useUpdatePricing(id);

  const [customHotel, setCustomHotel] = useState('');
  const [adjustmentMode, setAdjustmentMode] = useState<'hotel' | 'other' | null>(null);
  const [reversing, setReversing] = useState<AdjustmentRecord | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const header = quotation.data?.header ?? null;
  const snapshot = quotation.data?.snapshot ?? null;

  const headerSave = useAutosave<Parameters<typeof update.mutateAsync>[0]['patch']>(
    useCallback(
      (patch) => {
        if (header === null) return Promise.resolve();
        return update.mutateAsync({ updatedAt: header.updatedAt, patch });
      },
      [header, update],
    ),
  );

  const readOnly =
    profile === null ||
    header === null ||
    (header.agentId !== profile.id && !isManager(profile.role));

  const selected = quotation.data?.services ?? [];
  const dayByService = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of selected) {
      const service = snapshot?.serviceById.get(row.serviceId);
      if (service?.consumesDay === true) map.set(row.serviceId, row.dayNumber);
    }
    return map;
  }, [selected, snapshot]);

  const serviceNames = useMemo(
    () => new Map((snapshot?.services ?? []).map((s) => [s.serviceId, s.name])),
    [snapshot],
  );

  /**
   * How long these rates are good for, from the services actually selected.
   * The quotation has to say so on its face, or a client books for December
   * against rates that stopped at the end of October.
   */
  const validity = quotationValidity(
    selected.map((row) => {
      const snap = snapshot?.serviceById.get(row.serviceId);
      return {
        serviceId: row.serviceId,
        name: snap?.name ?? row.serviceId,
        validUntil: snap?.validUntil ?? null,
      };
    }),
    header?.travelDate ?? null,
  );

  const cityIds = quotation.data?.cityIds ?? [];
  /**
   * The snapshot does not carry a service's city — it freezes rates, not
   * reference data — so the city comes from the live service list.
   */
  const cityByService = useMemo(
    () => new Map((serviceMeta.data ?? []).map((meta) => [meta.id, meta.cityId])),
    [serviceMeta.data],
  );

  if (quotation.isPending || profile === null) return <Spinner label="Loading quotation…" />;
  if (quotation.error !== null) {
    return (
      <Alert tone="danger" title="Could not load this quotation">
        {quotation.error.message}
      </Alert>
    );
  }
  if (quotation.data === null || header === null || snapshot === null) {
    return (
      <>
        <PageHeader title="Quotation not found" />
        <Alert tone="danger">It does not exist, or you cannot see it.</Alert>
      </>
    );
  }

  const ledger = ledgerView(adjustments.data ?? [], snapshot);
  const paxTotal = header.paxAdults + header.paxChildren;
  const selectedIds = new Set(selected.map((row) => row.serviceId));

  const engineInput = toEngineInput(
    snapshot,
    {
      paxAdults: header.paxAdults,
      paxChildren: header.paxChildren,
      airfarePhp: header.airfarePhp,
      packageMarkupType: header.packageMarkupType,
      packageMarkupValue: header.packageMarkupValue,
      outputCategories: header.outputCategories,
    },
    selected.map((row) => ({ serviceId: row.serviceId, sortOrder: row.sortOrder })),
    selected.flatMap((row) =>
      row.addonIds.map((addonId) => ({ serviceId: row.serviceId, addonId })),
    ),
    // Reversed rows and the reversals themselves cancel out, so only live
    // entries reach the engine.
    (adjustments.data ?? [])
      .filter((row) => {
        const entry = ledger.byCategory
          .get(row.paxCategory)
          ?.entries.find((candidate) => candidate.id === row.id);
        return entry !== undefined && !entry.isReversed && !entry.isReversal;
      })
      .map((row) => ({
        paxCategory: row.paxCategory,
        kind: row.kind,
        amount: row.amount,
        currency: row.currency,
      })),
  );

  /** Per-person price for one service alone, for the selection cards. */
  function perPersonFor(serviceId: string): number | null {
    const single = calculateQuotation({
      ...engineInput,
      services: [{ serviceId }],
      outputCategories: ['quad'],
      packageMarkup: null,
      airfarePhp: 0,
    });
    const category = single.categories[0];
    if (category === undefined || category.final === null) return null;
    return category.breakdown
      .filter((line) => line.kind === 'service' || line.kind === 'service_markup')
      .reduce((sum, line) => sum + line.amount, 0);
  }

  const cards: ServiceCardData[] = snapshot.services
    .map((service) => {
      const row = selected.find((entry) => entry.serviceId === service.serviceId);
      const quotable = service.tiers.some(
        (tier) => paxTotal >= tier.minPax && paxTotal <= tier.maxPax,
      );
      const isSelected = selectedIds.has(service.serviceId);
      const serviceCity = cityByService.get(service.serviceId) ?? null;
      return {
        service,
        selected: isSelected,
        addonIds: row?.addonIds ?? [],
        perPersonPhp: quotable ? perPersonFor(service.serviceId) : null,
        quotable,
        outOfScope: isSelected && !inCityScope(serviceCity, cityIds),
        inScope: inCityScope(serviceCity, cityIds),
      };
    })
    // Out of scope but already selected stays visible, so it can be removed.
    .filter((card) => card.inScope || card.selected);

  const itineraryServices: ItineraryService[] = selected.map((row) => {
    const snap = snapshot.serviceById.get(row.serviceId);
    const meta = serviceMeta.data?.find((entry) => entry.id === row.serviceId);
    return {
      serviceId: row.serviceId,
      name: snap?.name ?? row.serviceId,
      consumesDay: snap?.consumesDay ?? false,
      addsNight: snap?.addsNight ?? false,
      dayNumber: row.dayNumber,
      itineraryTitle: meta?.itineraryTitle ?? null,
      itineraryText: meta?.itineraryText ?? null,
    };
  });

  const resolved = resolveDuration(
    header.durationMode === 'derived'
      ? { mode: 'derived', services: itineraryServices }
      : {
          mode: 'agent_selected',
          agentDays: header.durationDays,
          services: itineraryServices,
        },
  );

  const itinerary = buildItinerary({
    durationDays: resolved.days,
    services: itineraryServices,
    arrivalText: settingText(settings.data, 'itinerary.arrival_text', 'Welcome to Japan!'),
    departureText: settingText(
      settings.data,
      'itinerary.departure_text',
      'Safe travels back home!',
    ),
    freeDayText: settingText(settings.data, 'itinerary.free_day_text', 'Free time own leisure'),
  });

  function reportError(caught: unknown): void {
    if (caught instanceof ConflictError) {
      toast.error('This quotation changed in another tab. Reload.');
      return;
    }
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  function writeServices(next: readonly ServiceSelection[]): void {
    setServices.mutate(next, { onError: reportError });
  }

  function currentSelections(): ServiceSelection[] {
    return selected.map((row) => ({
      serviceId: row.serviceId,
      dayNumber: row.dayNumber,
      sortOrder: row.sortOrder,
      addonIds: row.addonIds,
    }));
  }

  const chosenHotelIds = new Set(
    quotation.data.hotels
      .map((row) => row.hotelId)
      .filter((value): value is string => value !== null),
  );
  const customHotels = quotation.data.hotels.filter((row) => row.customName !== null);
  const categoryHotels = filterToCities(
    (hotels.data ?? []).filter(
      (hotel) => hotel.isActive && hotel.starRating === header.hotelCategory,
    ),
    cityIds,
  );

  const chosenReferenceHotels = (hotels.data ?? []).filter((hotel) => chosenHotelIds.has(hotel.id));
  const hotelsOutOfScope = outOfCityScope(chosenReferenceHotels, cityIds);
  const servicesOutOfScope = cards.filter((card) => card.outOfScope);
  const selectedCityNames = cityNames(cityIds, cities.data ?? []);
  const validityNote = validityWarning(validity);

  /**
   * Reasons the quotation must not be generated. The tours-do-not-fit case is
   * the supervisor's: every tour ticked on a 3-day trip used to produce a
   * quotation whose itinerary quietly left most of them out.
   */
  const blockingReasons: string[] = [];
  if (resolved.warnings.includes('TOURS_DO_NOT_FIT')) {
    blockingReasons.push(
      `these tours need ${String(resolved.requiredDays)} days but the trip is ${resolved.label} \u2014 add days and nights, or remove a tour`,
    );
  }

  return (
    <>
      <PageHeader
        title={header.packageTitle ?? defaultPackageTitle(resolved.label)}
        description={`${header.referenceNo}${header.clientName === null ? '' : ` · ${header.clientName}`}`}
        actions={
          <span className="flex items-center gap-3">
            <Link
              to={`/quotations/${id}/output`}
              className="text-brand-700 text-sm hover:underline"
            >
              Quotation text
            </Link>
            <Badge tone="neutral">{header.status}</Badge>
            <Tooltip label="This quotation keeps these rates even if rates change later.">
              <span className="text-xs text-slate-600">
                Rates as of {new Date(header.ratesAsOf).toLocaleDateString('en-PH')} · JPY{' '}
                {(snapshot.fx.JPY ?? 0) / 1_000_000}
              </span>
            </Tooltip>
            {headerSave.state !== 'idle' && (
              <span className="text-xs text-slate-500">
                {saveStateLabel(headerSave.state)}
                {headerSave.state === 'failed' && (
                  <Button size="sm" variant="ghost" onClick={headerSave.retry}>
                    Retry
                  </Button>
                )}
              </span>
            )}
          </span>
        }
      />

      {readOnly && (
        <Alert tone="info" className="mb-6">
          Viewing {serviceNames.get(header.agentId) ?? 'another agent'}&apos;s quotation
          (read-only).
        </Alert>
      )}

      {validityNote !== null && (
        <Alert
          tone={validity.travelDateOutside ? 'danger' : 'warning'}
          title={
            validity.travelDateOutside
              ? 'Travel date is past the rate validity'
              : 'No rate validity to show'
          }
          className="mb-6"
        >
          {validityNote}
        </Alert>
      )}

      {(servicesOutOfScope.length > 0 || hotelsOutOfScope.length > 0) && (
        <Alert
          tone="warning"
          title="Some selections are outside the chosen cities"
          className="mb-6"
        >
          <p>Nothing was removed. Review these, or add the city back.</p>
          <ul className="mt-2 list-disc pl-5">
            {servicesOutOfScope.map((card) => (
              <li key={card.service.serviceId}>{card.service.name}</li>
            ))}
            {hotelsOutOfScope.map((hotel) => (
              <li key={hotel.id}>{hotel.name}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Basics"
              description={
                selectedCityNames.length > 0
                  ? selectedCityNames.join(' · ')
                  : 'Choose the cities this package covers.'
              }
            />
            <CardBody>
              <CitiesField
                cities={(cities.data ?? []).filter((city) => city.isActive)}
                selected={cityIds}
                disabled={readOnly}
                onChange={(next) => {
                  setCities.mutate(next, { onError: reportError });
                }}
              />
            </CardBody>
          </Card>

          <TravellersSection
            adults={header.paxAdults}
            children={header.paxChildren}
            snapshot={snapshot}
            disabled={readOnly}
            onChange={(adults, children) => {
              headerSave.push({ paxAdults: adults, paxChildren: children });
            }}
          />

          <DurationSection
            mode={header.durationMode}
            days={header.durationDays}
            services={itineraryServices}
            disabled={readOnly}
            onChange={(mode, days) => {
              headerSave.push({ durationMode: mode, durationDays: days });
            }}
          />

          <ServicesSection
            tours={cards.filter((card) => card.service.serviceType === 'tour')}
            transfers={cards.filter((card) => card.service.serviceType === 'transfer')}
            disabled={readOnly}
            onToggle={(serviceId, isSelected) => {
              const next = isSelected
                ? [
                    ...currentSelections(),
                    {
                      serviceId,
                      dayNumber: null,
                      sortOrder: selected.length + 1,
                      addonIds: [],
                    },
                  ]
                : currentSelections().filter((row) => row.serviceId !== serviceId);
              writeServices(next);
            }}
            onToggleAddon={(serviceId, addonId, isSelected) => {
              writeServices(
                currentSelections().map((row) =>
                  row.serviceId === serviceId
                    ? {
                        ...row,
                        addonIds: isSelected
                          ? [...row.addonIds, addonId]
                          : row.addonIds.filter((value) => value !== addonId),
                      }
                    : row,
                ),
              );
            }}
          />

          <ItinerarySection
            days={itinerary.days}
            issues={itinerary.issues}
            assignableDays={Array.from(
              { length: Math.max(0, resolved.days - 2) },
              (_, index) => index + 2,
            )}
            dayByService={dayByService}
            serviceNames={serviceNames}
            disabled={readOnly}
            onAssign={(serviceId, day) => {
              writeServices(
                currentSelections().map((row) =>
                  row.serviceId === serviceId ? { ...row, dayNumber: day } : row,
                ),
              );
            }}
            onAutoArrange={() => {
              const assigned = autoAssignDays(itineraryServices, resolved.days);
              const byId = new Map(assigned.map((entry) => [entry.serviceId, entry.dayNumber]));
              writeServices(
                currentSelections().map((row) => ({
                  ...row,
                  dayNumber: byId.get(row.serviceId) ?? row.dayNumber,
                })),
              );
            }}
          />

          <Card>
            <CardHeader title="Hotels" description={`${String(header.hotelCategory ?? 3)} star`} />
            <CardBody className="space-y-4">
              <Field label="Category">
                <Select
                  value={String(header.hotelCategory ?? 3)}
                  disabled={readOnly}
                  onChange={(event) => {
                    headerSave.push({ hotelCategory: Number(event.target.value) });
                  }}
                >
                  <option value="3">3 star</option>
                  <option value="4">4 star</option>
                  <option value="5">5 star</option>
                </Select>
              </Field>

              <ul className="space-y-1">
                {categoryHotels.map((hotel) => (
                  <li key={hotel.id}>
                    <Checkbox
                      label={hotel.name}
                      checked={chosenHotelIds.has(hotel.id)}
                      disabled={readOnly}
                      onChange={(event) => {
                        const kept = (quotation.data?.hotels ?? [])
                          .filter((row) => row.hotelId !== hotel.id)
                          .map((row) => ({ hotelId: row.hotelId, customName: row.customName }));
                        setHotels.mutate(
                          event.target.checked
                            ? [...kept, { hotelId: hotel.id, customName: null }]
                            : kept,
                          { onError: reportError },
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>

              <div className="flex items-end gap-2">
                <Field label="Add other hotel" className="flex-1">
                  <Input
                    value={customHotel}
                    disabled={readOnly}
                    placeholder="Hotel XYZ"
                    onChange={(event) => {
                      setCustomHotel(event.target.value);
                    }}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={readOnly || customHotel.trim() === ''}
                  onClick={() => {
                    const kept = (quotation.data?.hotels ?? []).map((row) => ({
                      hotelId: row.hotelId,
                      customName: row.customName,
                    }));
                    setHotels.mutate([...kept, { hotelId: null, customName: customHotel.trim() }], {
                      onError: reportError,
                      onSuccess: () => {
                        setCustomHotel('');
                      },
                    });
                  }}
                >
                  Add
                </Button>
              </div>

              {customHotels.length > 0 && (
                <ul className="text-sm text-slate-700">
                  {customHotels.map((row) => (
                    <li key={row.id}>{row.customName}</li>
                  ))}
                </ul>
              )}

              <Field label="Booking status">
                <Select
                  value={header.bookingStatus}
                  disabled={readOnly}
                  onChange={(event) => {
                    headerSave.push({
                      bookingStatus: event.target.value as typeof header.bookingStatus,
                    });
                  }}
                >
                  <option value="not_booked">Not booked</option>
                  <option value="booked">Booked</option>
                  <option value="confirmed">Confirmed</option>
                </Select>
              </Field>

              {header.bookingStatus !== 'confirmed' && (
                <Alert tone="warning">
                  Rooms &amp; Rates are subjected to AVAILABILITY and REVISION at point of
                  confirmation or prior
                </Alert>
              )}

              {(bookingSites.data ?? []).length > 0 && (
                <p className="flex flex-wrap gap-2 text-sm">
                  {(bookingSites.data ?? [])
                    .filter((site) => site.isActive)
                    .map((site) => (
                      <a
                        key={site.id}
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        {site.name}
                      </a>
                    ))}
                </p>
              )}
            </CardBody>
          </Card>

          <HotelCostCard
            snapshot={snapshot}
            ledger={ledger}
            categories={header.outputCategories}
            readOnly={readOnly}
            onAdd={() => {
              setAdjustmentMode('hotel');
            }}
          />

          <Card>
            <CardHeader
              title="Change Rate"
              description="Per-person adjustments. Negative amounts are allowed."
              actions={
                readOnly ? undefined : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setAdjustmentMode('other');
                    }}
                  >
                    Add adjustment
                  </Button>
                )
              }
            />
          </Card>

          <LedgerTable
            ledger={ledger}
            snapshot={snapshot}
            categories={header.outputCategories}
            readOnly={readOnly}
            onReverse={(entry) => {
              setReversing(entry);
              setReverseReason('');
            }}
          />

          <AirfareAndMarkupCard
            airfarePhp={header.airfarePhp}
            markupType={header.packageMarkupType}
            markupValue={header.packageMarkupValue}
            readOnly={readOnly}
            onChange={(airfarePhp, markupType, markupValue) => {
              updatePricing.mutate(
                {
                  updatedAt: header.updatedAt,
                  patch: {
                    airfarePhp,
                    packageMarkupType: markupType,
                    packageMarkupValue: markupValue,
                  },
                },
                { onError: reportError },
              );
            }}
          />

          <Card>
            <CardHeader title="Output options" />
            <CardBody className="space-y-4">
              <div className="flex items-end gap-2">
                <Field label="Package title" className="flex-1">
                  <Input
                    value={header.packageTitle ?? defaultPackageTitle(resolved.label)}
                    disabled={readOnly}
                    onChange={(event) => {
                      headerSave.push({ packageTitle: event.target.value });
                    }}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={readOnly}
                  onClick={() => {
                    headerSave.push({ packageTitle: defaultPackageTitle(resolved.label) });
                  }}
                >
                  Reset
                </Button>
              </div>

              <Field label="Season label">
                <Input
                  value={header.seasonLabel ?? ''}
                  disabled={readOnly}
                  onChange={(event) => {
                    headerSave.push({ seasonLabel: event.target.value });
                  }}
                />
              </Field>

              <OutputCategoriesField
                categories={ALL_CATEGORIES}
                selected={header.outputCategories}
                adults={header.paxAdults}
                children={header.paxChildren}
                disabled={readOnly}
                onChange={(next) => {
                  headerSave.push({ outputCategories: next as typeof header.outputCategories });
                }}
              />
            </CardBody>
          </Card>

          <SnapshotPanel
            quotationId={id}
            snapshot={snapshot}
            ratesAsOf={header.ratesAsOf}
            canRequote={can(profile.role, 'quotation.create')}
          />
        </div>

        <DetailedSummary
          input={engineInput}
          outputCategories={header.outputCategories}
          snapshot={snapshot}
          extraBlocking={blockingReasons}
        />
      </div>

      <Dialog
        open={adjustmentMode !== null}
        onOpenChange={(open) => {
          if (!open && !addAdjustments.isPending) setAdjustmentMode(null);
        }}
        title={adjustmentMode === 'hotel' ? 'Add hotel cost' : 'Add a Change Rate entry'}
        description="Entries cannot be edited later. A mistake is corrected with a reversal."
      >
        {adjustmentMode !== null && (
          <AdjustmentForm
            mode={adjustmentMode}
            categories={header.outputCategories}
            snapshot={snapshot}
            nights={Math.max(1, resolved.days - 1)}
            busy={addAdjustments.isPending}
            onCancel={() => {
              setAdjustmentMode(null);
            }}
            onSubmit={(entries: readonly NewAdjustment[]) => {
              addAdjustments.mutate(entries, {
                onSuccess: () => {
                  setAdjustmentMode(null);
                  toast.success(
                    entries.length > 1
                      ? `${String(entries.length)} entries added.`
                      : 'Entry added.',
                  );
                },
                onError: reportError,
              });
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={reversing !== null}
        onOpenChange={(open) => {
          if (!open && !reverseAdjustment.isPending) setReversing(null);
        }}
        title="Reverse this entry?"
        description="The original stays on the record, with this reversal beside it."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={reverseAdjustment.isPending}
              onClick={() => {
                setReversing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={reverseAdjustment.isPending}
              disabled={reverseReason.trim().length < 3}
              onClick={() => {
                if (reversing === null) return;
                reverseAdjustment.mutate(
                  { entry: reversing, reason: reverseReason.trim() },
                  {
                    onSuccess: () => {
                      setReversing(null);
                      toast.success('Entry reversed.');
                    },
                    onError: reportError,
                  },
                );
              }}
            >
              Reverse entry
            </Button>
          </>
        }
      >
        <Field label="Reason" required hint="Why this entry was wrong.">
          <Input
            value={reverseReason}
            onChange={(event) => {
              setReverseReason(event.target.value);
            }}
          />
        </Field>
      </Dialog>
    </>
  );
}
