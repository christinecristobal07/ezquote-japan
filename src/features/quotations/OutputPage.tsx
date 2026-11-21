import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  PageHeader,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  buildItinerary,
  buildQuotationModel,
  defaultPackageTitle,
  ledgerView,
  outputFingerprint,
  renderQuotation,
  resolveDuration,
  toEngineInput,
  type ItineraryService,
  type OutputContentItem,
  type OutputIssue,
  type OutputPart,
  type QuotationModel,
} from '@/domain';
import { isManager } from '@/domain/permissions';
import { ContentError } from '@/data/repositories/contentRepository';
import { listVersions, markSent, saveVersion } from '@/data/repositories/outputRepository';
import { useAuth } from '@/features/auth/useAuth';
import {
  useAppSettings,
  useContentItems,
  useHotels,
  useServiceMeta,
} from '@/features/content/queries';
import { supabase } from '@/data/supabaseClient';
import { copyText } from './clipboard';
import { useAdjustments, useQuotation } from './queries';

const ISSUE_TEXT: Record<OutputIssue['code'], string> = {
  BLOCKED_CATEGORY: 'A category cannot be priced yet',
  NO_RATE_LINES: 'No rates to show',
  NO_BAD_LINK: 'You have no valid Bad link, so that line is left out',
  NO_GREAT_LINK: 'You have no valid Great link, so that line is left out',
  NO_LINKS_AT_ALL: 'You have no Rate My Service links, so the rating block is left out',
  NO_HOTELS: 'No hotels to list for this category',
};

function settingText(
  settings: readonly { key: string; value: unknown }[] | undefined,
  key: string,
  fallback: string,
): string {
  const value = settings?.find((row) => row.key === key)?.value;
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/** RLS limits this to the signed-in agent's own row. */
async function fetchMyLinks(profileId: string) {
  const { data } = await supabase
    .from('agent_survey_links')
    .select('bad_url, great_url')
    .eq('profile_id', profileId)
    .maybeSingle();
  return { badUrl: data?.bad_url ?? null, greatUrl: data?.great_url ?? null };
}

export function OutputPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const client = useQueryClient();
  const { profile } = useAuth();

  const quotation = useQuotation(id);
  const adjustments = useAdjustments(id);
  const serviceMeta = useServiceMeta();
  const content = useContentItems();
  const settings = useAppSettings();
  const hotels = useHotels();

  const links = useQuery({
    queryKey: ['myLinks', profile?.id ?? 'none'],
    queryFn: () => fetchMyLinks(profile?.id ?? ''),
    enabled: profile !== null,
  });

  const versions = useQuery({
    queryKey: ['outputs', id],
    queryFn: () => listVersions(id),
    enabled: id !== '',
  });

  const [viewing, setViewing] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async (model: QuotationModel) => {
      await saveVersion(id, {
        text: renderQuotation(model, 'full'),
        fingerprint: outputFingerprint(model),
        rates: model.rateLines.map((line) => ({
          paxCategory: line.paxCategory,
          label: line.label,
          amount: line.amount,
        })),
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['outputs', id] }),
  });

  const header = quotation.data?.header ?? null;
  const snapshot = quotation.data?.snapshot ?? null;

  const model = useMemo<QuotationModel | null>(() => {
    if (header === null || snapshot === null || profile === null) return null;

    const selected = quotation.data?.services ?? [];
    const live = ledgerView(adjustments.data ?? [], snapshot);
    const liveAdjustments = (adjustments.data ?? []).filter((row) => {
      const entry = live.byCategory
        .get(row.paxCategory)
        ?.entries.find((candidate) => candidate.id === row.id);
      return entry !== undefined && !entry.isReversed && !entry.isReversal;
    });

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
        : { mode: 'agent_selected', agentDays: header.durationDays, services: itineraryServices },
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

    const hotelById = new Map((hotels.data ?? []).map((hotel) => [hotel.id, hotel]));
    const selectedHotels = (quotation.data?.hotels ?? []).map((row) => ({
      name: row.customName ?? hotelById.get(row.hotelId ?? '')?.name ?? 'Hotel',
      starRating: hotelById.get(row.hotelId ?? '')?.starRating ?? header.hotelCategory ?? 3,
    }));

    return buildQuotationModel({
      snapshot,
      engineInput: toEngineInput(
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
        liveAdjustments.map((row) => ({
          paxCategory: row.paxCategory,
          kind: row.kind,
          amount: row.amount,
          currency: row.currency,
        })),
      ),
      // The signed-in user signs the quotation, never the owner.
      agentName: profile.fullName,
      agentBadUrl: links.data?.badUrl ?? null,
      agentGreatUrl: links.data?.greatUrl ?? null,
      packageTitle: header.packageTitle ?? defaultPackageTitle(resolved.label),
      validityLabel: settingText(settings.data, 'quotation.validity_label', ''),
      seasonLabel: header.seasonLabel,
      durationLabel: resolved.label,
      hotelCategory: header.hotelCategory ?? 3,
      selectedHotels,
      categoryHotels: (hotels.data ?? [])
        .filter((hotel) => hotel.isActive)
        .map((hotel) => ({ name: hotel.name, starRating: hotel.starRating })),
      services: selected.map((row) => {
        const snap = snapshot.serviceById.get(row.serviceId);
        const meta = serviceMeta.data?.find((entry) => entry.id === row.serviceId);
        return {
          serviceId: row.serviceId,
          name: snap?.name ?? row.serviceId,
          consumesDay: snap?.consumesDay ?? false,
          inclusionText: meta?.inclusionText ?? null,
          dayNumber: row.dayNumber,
          selectedAddonNames: row.addonIds
            .map((addonId) => snap?.addons.find((addon) => addon.id === addonId)?.name)
            .filter((name): name is string => name !== undefined),
        };
      }),
      content: (content.data ?? []).map((item): OutputContentItem => ({
        id: item.id,
        contentType: item.contentType,
        body: item.body,
        isActive: item.isActive,
        startsOn: item.startsOn,
        endsOn: item.endsOn,
        sortOrder: item.sortOrder,
        conditionServiceId: item.conditionServiceId,
      })),
      itinerary: itinerary.days,
      bookingStatus: header.bookingStatus,
      today: new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Manila',
      }).format(new Date()),
    });
  }, [
    adjustments.data,
    content.data,
    header,
    hotels.data,
    links.data,
    profile,
    quotation.data,
    serviceMeta.data,
    settings.data,
    snapshot,
  ]);

  if (quotation.isPending || profile === null) return <Spinner label="Loading quotation…" />;
  if (header === null || model === null) {
    return (
      <>
        <PageHeader title="Quotation not found" />
        <Alert tone="danger">It does not exist, or you cannot see it.</Alert>
      </>
    );
  }

  const latest = versions.data?.[0] ?? null;
  const currentFingerprint = outputFingerprint(model);
  const outOfDate = latest !== null && latest.fingerprint !== currentFingerprint;
  const readOnly = header.agentId !== profile.id && !isManager(profile.role);

  async function copyPart(part: OutputPart): Promise<void> {
    if (latest === null || model === null) return;
    // Parts are re-rendered from the model behind the saved version, so a copy
    // never mixes a stale full text with fresh parts.
    const text = part === 'full' ? latest.text : renderQuotation(model, part);
    const outcome = await copyText(text);

    if (outcome === 'failed') {
      setManualCopy(text);
      return;
    }
    toast.success('Copied');

    if (part === 'full' && header !== null && header.status === 'draft') {
      await markSent(id, header.updatedAt)
        .then(() => client.invalidateQueries({ queryKey: ['quotations', id] }))
        .catch(() => {
          // Not worth interrupting the agent: the text is already copied.
        });
    }
  }

  return (
    <>
      <PageHeader
        title="Quotation text"
        description={`${header.referenceNo}${header.clientName === null ? '' : ` · ${header.clientName}`}`}
        actions={
          <span className="flex items-center gap-3">
            <Badge tone={header.status === 'sent' ? 'success' : 'neutral'}>{header.status}</Badge>
            <Link to={`/quotations/${id}`} className="text-brand-700 text-sm hover:underline">
              Back to builder
            </Link>
          </span>
        }
      />

      {model.issues.length > 0 && (
        <Alert
          tone={model.canGenerate ? 'warning' : 'danger'}
          title={model.canGenerate ? 'Worth checking' : 'Cannot generate yet'}
          className="mb-4"
        >
          <ul className="list-inside list-disc">
            {model.issues.map((issue, index) => (
              <li key={index}>
                {ISSUE_TEXT[issue.code]}
                {issue.detail === undefined ? '' : `: ${issue.detail}`}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {outOfDate && (
        <Alert tone="warning" title="Inputs changed since the last version" className="mb-4">
          Regenerate before copying, or you will send out-of-date numbers.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Preview"
            description="Exactly what will be pasted into Messenger."
            actions={
              readOnly ? undefined : (
                <Button
                  loading={generate.isPending}
                  disabled={!model.canGenerate}
                  title={
                    model.canGenerate
                      ? undefined
                      : model.issues.map((issue) => ISSUE_TEXT[issue.code]).join('; ')
                  }
                  onClick={() => {
                    generate.mutate(model, {
                      onSuccess: () => {
                        toast.success(
                          latest === null ? 'Quotation generated.' : 'New version saved.',
                        );
                      },
                      onError: (caught: unknown) => {
                        toast.error(
                          caught instanceof ContentError ? caught.message : 'Could not save.',
                        );
                      },
                    });
                  }}
                >
                  {latest === null ? 'Generate quotation' : 'Regenerate quotation'}
                </Button>
              )
            }
          />
          <CardBody>
            <div
              data-testid="output-preview"
              className="rounded-md bg-slate-50 p-4 text-sm whitespace-pre-wrap"
            >
              {latest?.text ?? renderQuotation(model, 'full')}
            </div>
            {latest === null && (
              <p className="mt-2 text-xs text-slate-500">
                This is a live preview. Generate to save a version you can copy.
              </p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Copy" description="Pick what to paste." />
            <CardBody className="flex flex-col gap-2">
              {(
                [
                  ['full', 'Copy Full Quotation'],
                  ['rates', 'Copy Rates Only'],
                  ['itinerary', 'Copy Itinerary'],
                  ['inclusionsExclusions', 'Copy Inclusions & Exclusions'],
                ] as const
              ).map(([part, label]) => (
                <Button
                  key={part}
                  variant={part === 'full' ? 'primary' : 'secondary'}
                  disabled={latest === null || outOfDate}
                  onClick={() => {
                    void copyPart(part);
                  }}
                >
                  {label}
                </Button>
              ))}
              {latest === null && (
                <p className="text-xs text-slate-500">Generate a version first.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Version history" description="Every version ever generated." />
            <CardBody>
              {versions.isPending ? (
                <Spinner label="Loading versions…" />
              ) : (versions.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-600">Nothing generated yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(versions.data ?? []).map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2"
                    >
                      <span>
                        {new Intl.DateTimeFormat('en-PH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Asia/Manila',
                        }).format(new Date(version.generatedAt))}
                        <span className="ml-1 text-xs text-slate-500">
                          by {version.generatedByName ?? 'unknown'}
                        </span>
                      </span>
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setViewing(version.text);
                          }}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            void copyText(version.text).then((outcome) => {
                              if (outcome === 'failed') setManualCopy(version.text);
                              else toast.success('Copied');
                            });
                          }}
                        >
                          Copy
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Sticky on phones, where the agent copies straight into Messenger. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3 lg:hidden">
        <Button
          className="w-full"
          disabled={latest === null || outOfDate}
          onClick={() => {
            void copyPart('full');
          }}
        >
          Copy Full Quotation
        </Button>
      </div>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
        title="Saved version"
      >
        <div className="max-h-96 overflow-y-auto rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">
          {viewing}
        </div>
      </Dialog>

      <Dialog
        open={manualCopy !== null}
        onOpenChange={(open) => {
          if (!open) setManualCopy(null);
        }}
        title="Copy it manually"
        description="Your browser blocked the clipboard. Select everything below and copy."
      >
        <Textarea
          readOnly
          rows={14}
          value={manualCopy ?? ''}
          onFocus={(event) => {
            event.target.select();
          }}
        />
      </Dialog>
    </>
  );
}
