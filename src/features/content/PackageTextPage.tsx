import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  PageSpinner,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  formatContentLine,
  liveState,
  manilaToday,
  normalizeMultiline,
  type ContentType,
  type LiveState,
} from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import type { ContentItem } from '@/data/repositories/contentRepository';
import {
  useContentItems,
  useDeleteContentItem,
  useReorderContent,
  useSaveContentItem,
  useServiceMeta,
} from './queries';

const TYPES: readonly { type: ContentType; label: string }[] = [
  { type: 'inclusion', label: 'Inclusions' },
  { type: 'exclusion', label: 'Exclusions' },
  { type: 'note', label: 'Notes' },
  { type: 'requirement', label: 'Requirements' },
  { type: 'remark', label: 'Remarks' },
  { type: 'announcement', label: 'Announcements' },
  { type: 'availability_reminder', label: 'Availability reminder' },
  { type: 'booking_disclaimer', label: 'Booking disclaimer' },
  { type: 'personal_transactions', label: 'Personal transactions' },
];

const STATE_TONES: Record<LiveState, 'success' | 'info' | 'danger' | 'neutral'> = {
  Live: 'success',
  Scheduled: 'info',
  Expired: 'danger',
  Inactive: 'neutral',
};

interface Draft {
  body: string;
  conditionServiceId: string | null;
  isActive: boolean;
  startsOn: string;
  endsOn: string;
}

function toDraft(item: ContentItem | null): Draft {
  return {
    body: item?.body ?? '',
    conditionServiceId: item?.conditionServiceId ?? null,
    isActive: item?.isActive ?? true,
    startsOn: item?.startsOn ?? '',
    endsOn: item?.endsOn ?? '',
  };
}

export function PackageTextPage() {
  const toast = useToast();
  const today = manilaToday();
  const items = useContentItems();
  const services = useServiceMeta();
  const save = useSaveContentItem();
  const remove = useDeleteContentItem();
  const reorder = useReorderContent();

  const [activeType, setActiveType] = useState<ContentType>('inclusion');
  const [editing, setEditing] = useState<{ item: ContentItem | null } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<ContentItem | null>(null);

  const rows = (items.data ?? [])
    .filter((item) => item.contentType === activeType)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  function move(index: number, direction: -1 | 1): void {
    const next = [...rows];
    const target = index + direction;
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    reorder.mutate(
      { contentType: activeType, ids: next.map((row) => row.id) },
      { onError: reportError },
    );
  }

  if (items.isPending || services.isPending) return <PageSpinner label="Loading content…" />;

  const bodyError = draft !== null && draft.body.trim() === '' ? 'Say something.' : undefined;
  const windowError =
    draft !== null && draft.startsOn !== '' && draft.endsOn !== '' && draft.endsOn < draft.startsOn
      ? 'The end date cannot be before the start date.'
      : undefined;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Section" className="w-64">
          <Select
            value={activeType}
            onChange={(event) => {
              setActiveType(event.target.value as ContentType);
            }}
          >
            {TYPES.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          className="ml-auto"
          onClick={() => {
            setDraft(toDraft(null));
            setEditing({ item: null });
          }}
        >
          New line
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={TYPES.find((entry) => entry.type === activeType)?.label ?? activeType}
            description={`${String(rows.length)} lines`}
          />
          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing here yet.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((item, index) => {
                  const state = liveState(
                    { isActive: item.isActive, startsOn: item.startsOn, endsOn: item.endsOn },
                    today,
                  );
                  const condition = services.data?.find(
                    (service) => service.id === item.conditionServiceId,
                  );
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 rounded-md border border-slate-200 p-3"
                    >
                      <span className="flex flex-col">
                        <IconButton
                          aria-label={`Move "${item.body.slice(0, 24)}" up`}
                          disabled={index === 0 || reorder.isPending}
                          onClick={() => {
                            move(index, -1);
                          }}
                        >
                          <ChevronUp aria-hidden="true" className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          aria-label={`Move "${item.body.slice(0, 24)}" down`}
                          disabled={index === rows.length - 1 || reorder.isPending}
                          onClick={() => {
                            move(index, 1);
                          }}
                        >
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        </IconButton>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm whitespace-pre-wrap">{item.body}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge tone={STATE_TONES[state]}>{state}</Badge>
                          {condition !== undefined && (
                            <Badge tone="info">only with {condition.name}</Badge>
                          )}
                          {(item.startsOn !== null || item.endsOn !== null) && (
                            <span className="text-xs text-slate-500">
                              {item.startsOn ?? '…'} → {item.endsOn ?? '…'}
                            </span>
                          )}
                        </span>
                      </span>

                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDraft(toDraft(item));
                            setEditing({ item });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleting(item);
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Quotation preview"
            description="The live lines only, as they appear in a 3D2N quotation."
          />
          <CardBody>
            <div className="space-y-1 text-sm">
              {rows
                .filter(
                  (item) =>
                    liveState(
                      { isActive: item.isActive, startsOn: item.startsOn, endsOn: item.endsOn },
                      today,
                    ) === 'Live',
                )
                .map((item) => {
                  const line = formatContentLine(activeType, item.body, { duration: '3D2N' });
                  return (
                    <p key={item.id} className="whitespace-pre-wrap">
                      {line.text}
                      {line.unknownTokens.length > 0 && (
                        <Badge tone="danger" className="ml-2">
                          unknown: {line.unknownTokens.join(', ')}
                        </Badge>
                      )}
                    </p>
                  );
                })}
              {rows.length > 0 &&
                rows.every(
                  (item) =>
                    liveState(
                      { isActive: item.isActive, startsOn: item.startsOn, endsOn: item.endsOn },
                      today,
                    ) !== 'Live',
                ) && <p className="text-slate-600">Nothing in this section is live today.</p>}
            </div>
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setEditing(null);
        }}
        title={editing?.item === null ? 'New line' : 'Edit line'}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => {
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={bodyError !== undefined || windowError !== undefined}
              onClick={() => {
                if (draft === null || editing === null) return;
                const values = {
                  body: normalizeMultiline(draft.body),
                  conditionServiceId: draft.conditionServiceId,
                  isActive: draft.isActive,
                  startsOn: draft.startsOn === '' ? null : draft.startsOn,
                  endsOn: draft.endsOn === '' ? null : draft.endsOn,
                };
                const input =
                  editing.item === null
                    ? {
                        mode: 'create' as const,
                        values: {
                          ...values,
                          contentType: activeType,
                          sortOrder: (rows.length + 1) * 10,
                        },
                      }
                    : {
                        mode: 'update' as const,
                        id: editing.item.id,
                        updatedAt: editing.item.updatedAt,
                        values,
                      };
                save.mutate(input, {
                  onSuccess: () => {
                    setEditing(null);
                    toast.success('Line saved.');
                  },
                  onError: reportError,
                });
              }}
            >
              Save line
            </Button>
          </>
        }
      >
        {draft !== null && (
          <div className="space-y-4">
            <Field
              label="Text"
              required
              error={bodyError}
              hint="{{duration}} becomes 3D2N and so on."
            >
              <Textarea
                rows={4}
                value={draft.body}
                onChange={(event) => {
                  setDraft({ ...draft, body: event.target.value });
                }}
              />
            </Field>

            <Field
              label="Only when this service is selected"
              hint="Leave empty to always show the line."
            >
              <Select
                value={draft.conditionServiceId ?? ''}
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    conditionServiceId: event.target.value === '' ? null : event.target.value,
                  });
                }}
              >
                <option value="">Always show</option>
                {(services.data ?? []).map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts on" hint="Optional.">
                <Input
                  type="date"
                  value={draft.startsOn}
                  onChange={(event) => {
                    setDraft({ ...draft, startsOn: event.target.value });
                  }}
                />
              </Field>
              <Field label="Ends on" hint="Optional." error={windowError}>
                <Input
                  type="date"
                  value={draft.endsOn}
                  onChange={(event) => {
                    setDraft({ ...draft, endsOn: event.target.value });
                  }}
                />
              </Field>
            </div>

            <Checkbox
              label="Active"
              checked={draft.isActive}
              onChange={(event) => {
                setDraft({ ...draft, isActive: event.target.checked });
              }}
            />

            <Alert tone="info">
              Preview: {formatContentLine(activeType, draft.body, { duration: '3D2N' }).text}
            </Alert>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this line?"
        message="It disappears from future quotations. Existing quotations keep what they were sent with."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleting === null) return;
          await remove
            .mutateAsync(deleting.id)
            .then(() => {
              toast.success('Line deleted.');
            })
            .catch(reportError);
          setDeleting(null);
        }}
      />
    </>
  );
}
