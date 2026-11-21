import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  MoneyText,
  PageHeader,
  PageSpinner,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { previewSellingRates, validateTiers, type DraftTier, type Markup } from '@/domain';
import { RateError } from '@/data/repositories/rateRepository';
import type { RateVersionDetail } from '@/data/repositories/rateRepository';
import {
  useCreateDraft,
  useDeleteDraft,
  useFxRates,
  usePublishVersion,
  useRateVersion,
  useSaveDraft,
  useServiceMarkups,
  useServiceRates,
  useSetInactive,
  useVersionHistory,
} from './queries';
import { PublishDialog } from './PublishDialog';
import { TierEditor } from './TierEditor';
import { NewQuotationsOnlyNotice, RateStatusBadge } from './shared';
import { formatDateTime, fxTableFrom, rateStatus } from './rateStatus';
import { currentAndScheduled } from '@/domain';

function toDraftTiers(version: RateVersionDetail | null | undefined): DraftTier[] {
  return (version?.tiers ?? []).map((tier) => ({
    paxType: tier.paxType,
    minPax: tier.minPax,
    maxPax: tier.maxPax,
    amount: tier.amount,
  }));
}

function ReadOnlyTiers({
  version,
  serviceType,
  fx,
  serviceMarkups,
}: {
  version: RateVersionDetail;
  serviceType: 'tour' | 'transfer';
  fx: Record<string, number>;
  serviceMarkups: Record<string, Markup>;
}) {
  const rows = previewSellingRates({
    currency: version.currency,
    serviceType,
    tiers: toDraftTiers(version),
    fx,
    serviceMarkups,
  });

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Published tiers with the per-person preview</caption>
      <thead>
        <tr className="border-b border-slate-200 text-left">
          <th scope="col" className="py-2 text-xs font-semibold text-slate-600 uppercase">
            Band
          </th>
          <th
            scope="col"
            className="py-2 text-right text-xs font-semibold text-slate-600 uppercase"
          >
            Operator {version.currency}
          </th>
          <th
            scope="col"
            className="py-2 text-right text-xs font-semibold text-slate-600 uppercase"
          >
            Converted
          </th>
          <th
            scope="col"
            className="py-2 text-right text-xs font-semibold text-slate-600 uppercase"
          >
            + markup
          </th>
          <th
            scope="col"
            className="py-2 text-right text-xs font-semibold text-slate-600 uppercase"
          >
            Per person
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.paxType}-${String(row.minPax)}`} className="border-b border-slate-100">
            <td className="py-2">
              {row.minPax}–{row.maxPax} pax
              {row.paxType === 'child' && <span className="text-slate-500"> (child)</span>}
            </td>
            <td className="py-2 text-right tabular-nums">{row.operatorAmount.toLocaleString()}</td>
            <td className="py-2 text-right">
              <MoneyText centavos={row.convertedPhp} />
            </td>
            <td className="py-2 text-right text-slate-600">
              <MoneyText centavos={row.markupPhp} />
            </td>
            <td className="py-2 text-right">
              <MoneyText centavos={row.perPersonPhp} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ServiceRatePage() {
  const { serviceId = '' } = useParams();
  const toast = useToast();
  const now = new Date();

  const services = useServiceRates();
  const history = useVersionHistory(serviceId);
  const fxQuery = useFxRates();
  const markupQuery = useServiceMarkups();

  const service = services.data?.find((row) => row.serviceId === serviceId) ?? null;
  const draftQuery = useRateVersion(service?.draftId ?? null);
  const publishedQuery = useRateVersion(service?.published?.id ?? null);

  const [draftTiers, setDraftTiers] = useState<DraftTier[] | null>(null);
  const [validUntil, setValidUntil] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [inactiveId, setInactiveId] = useState<string | null>(null);

  const createDraft = useCreateDraft(serviceId);
  const saveDraft = useSaveDraft(serviceId);
  const publish = usePublishVersion(serviceId);
  const discard = useDeleteDraft(serviceId);
  const makeInactive = useSetInactive(serviceId);

  const fx = fxTableFrom(fxQuery.data ?? [], now);
  const serviceMarkups: Record<string, Markup> = {};
  for (const type of ['tour', 'transfer'] as const) {
    const rows = (markupQuery.data ?? []).filter((row) => row.serviceType === type);
    const { current } = currentAndScheduled(rows, now);
    if (current) serviceMarkups[type] = { type: current.markupType, value: current.value };
  }

  if (services.isPending) return <PageSpinner label="Loading service…" />;
  if (service === null) {
    return (
      <>
        <PageHeader title="Service not found" />
        <Alert tone="danger">That service does not exist, or you cannot see it.</Alert>
      </>
    );
  }

  const draft = draftQuery.data ?? null;
  const published = publishedQuery.data ?? null;
  const tiers = draftTiers ?? toDraftTiers(draft);
  const validation = validateTiers(tiers);
  const serviceType = service.serviceType;

  function reportError(caught: unknown): void {
    toast.error(caught instanceof RateError ? caught.message : 'Something went wrong.');
  }

  return (
    <>
      <PageHeader
        title={service.name}
        description={`${serviceType === 'tour' ? 'Tour' : 'Transfer'} · ${service.code}`}
        actions={
          <Link to="/admin/rates" className="text-brand-700 text-sm hover:underline">
            Back to rates
          </Link>
        }
      />
      <NewQuotationsOnlyNotice />

      <Card className="mb-6">
        <CardHeader
          title="Current published version"
          description={
            published === null
              ? 'This service has no published rate. It is quoted on request.'
              : `Effective ${formatDateTime(published.effectiveFrom)} · valid until ${published.validUntil ?? '—'}`
          }
          actions={
            draft === null ? (
              <Button
                loading={createDraft.isPending}
                onClick={() => {
                  createDraft.mutate(published?.id, {
                    onSuccess: () => {
                      toast.success('Draft created from the current version.');
                    },
                    onError: reportError,
                  });
                }}
              >
                Create new version
              </Button>
            ) : (
              <Badge tone="warning">Draft in progress</Badge>
            )
          }
        />
        <CardBody>
          {published === null ? (
            <p className="text-sm text-slate-600">Nothing published yet.</p>
          ) : (
            <>
              <ReadOnlyTiers
                version={published}
                serviceType={serviceType}
                fx={fx}
                serviceMarkups={serviceMarkups}
              />
              {published.addons.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Add-ons</h3>
                  <ul className="mt-1 text-sm text-slate-700">
                    {published.addons.map((addon) => (
                      <li key={addon.id}>
                        {addon.name} · {published.currency} {addon.amount.toLocaleString()}
                        {addon.defaultSelected ? ' · on by default' : ' · off by default'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 text-xs text-slate-500">
                Published by {published.publishedByName ?? 'unknown'} on{' '}
                {formatDateTime(published.publishedAt)}
              </p>
            </>
          )}
        </CardBody>
      </Card>

      {draft !== null && (
        <Card className="mb-6">
          <CardHeader
            title="Draft editor"
            description="Nothing here affects quotations until you publish."
            actions={
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  loading={saveDraft.isPending}
                  onClick={() => {
                    saveDraft.mutate(
                      {
                        versionId: draft.id,
                        fields: {
                          validUntil: validUntil === '' ? draft.validUntil : validUntil,
                          notes: notes === '' ? draft.notes : notes,
                        },
                        tiers,
                        addons: draft.addons.map((addon) => ({
                          name: addon.name,
                          amount: addon.amount,
                          defaultSelected: addon.defaultSelected,
                        })),
                      },
                      {
                        onSuccess: () => {
                          toast.success('Draft saved.');
                        },
                        onError: reportError,
                      },
                    );
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setDiscardOpen(true);
                  }}
                >
                  Discard draft
                </Button>
                <Button
                  disabled={!validation.valid}
                  onClick={() => {
                    setPublishOpen(true);
                  }}
                >
                  Publish
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valid until" required hint="The last day these rates may be quoted.">
                <Input
                  type="date"
                  value={validUntil === '' ? (draft.validUntil ?? '') : validUntil}
                  onChange={(event) => {
                    setValidUntil(event.target.value);
                  }}
                />
              </Field>
              <Field label="Notes" hint="Internal only.">
                <Textarea
                  rows={2}
                  value={notes === '' ? (draft.notes ?? '') : notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                  }}
                />
              </Field>
            </div>

            <TierEditor
              tiers={tiers}
              currency={draft.currency}
              serviceType={serviceType}
              fx={fx}
              serviceMarkups={serviceMarkups}
              onChange={(next) => {
                setDraftTiers([...next]);
              }}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Version history" description="Every version of this rate." />
        <CardBody>
          {history.isPending ? (
            <Spinner label="Loading history…" />
          ) : (
            <ul className="space-y-3">
              {(history.data ?? []).map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <RateStatusBadge
                      status={rateStatus(
                        {
                          hasPublished: version.status === 'published',
                          hasDraft: version.status === 'draft',
                          effectiveFrom: version.effectiveFrom,
                          validUntil: version.validUntil,
                        },
                        now,
                      )}
                    />
                    <span>
                      {version.tiers.length} tiers · effective{' '}
                      {formatDateTime(version.effectiveFrom)}
                      {version.validUntil === null ? '' : ` · until ${version.validUntil}`}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    created by {version.createdByName ?? 'unknown'}
                    {version.publishedAt === null
                      ? ''
                      : ` · published by ${version.publishedByName ?? 'unknown'} on ${formatDateTime(version.publishedAt)}`}
                  </span>
                  {version.status === 'published' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInactiveId(version.id);
                      }}
                    >
                      Set inactive
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {draft !== null && (
        <>
          <PublishDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            currentTiers={toDraftTiers(published)}
            draftTiers={tiers}
            currency={draft.currency}
            busy={publish.isPending}
            onConfirm={() => {
              publish.mutate(draft.id, {
                onSuccess: () => {
                  setPublishOpen(false);
                  setDraftTiers(null);
                  toast.success('Rate published. New quotations will use it.');
                },
                onError: reportError,
              });
            }}
          />
          <ConfirmDialog
            open={discardOpen}
            onOpenChange={setDiscardOpen}
            title="Discard this draft?"
            message="The draft and its tiers are deleted. The published version is untouched."
            confirmLabel="Discard draft"
            danger
            onConfirm={async () => {
              await discard.mutateAsync(draft.id).catch(reportError);
              setDraftTiers(null);
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={inactiveId !== null}
        onOpenChange={(open) => {
          if (!open) setInactiveId(null);
        }}
        title="Set this version inactive?"
        message="New quotations will fall back to the previous published version, or have no rate for this service at all. Existing quotations keep their frozen rates."
        confirmLabel="Set inactive"
        danger
        onConfirm={async () => {
          if (inactiveId === null) return;
          await makeInactive.mutateAsync(inactiveId).catch(reportError);
          setInactiveId(null);
        }}
      />
    </>
  );
}
