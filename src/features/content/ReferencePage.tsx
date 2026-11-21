import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  Dialog,
  Field,
  Input,
  PageSpinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { ContentError } from '@/data/repositories/contentRepository';
import type { BookingSite, City, Operator } from '@/data/repositories/referenceRepository';
import {
  useBookingSites,
  useCities,
  useOperators,
  useSaveBookingSite,
  useSaveCity,
  useSaveOperator,
} from './queries';

type Target =
  | { kind: 'city'; row: City | null }
  | { kind: 'operator'; row: Operator | null }
  | { kind: 'site'; row: BookingSite | null }
  | null;

interface Draft {
  name: string;
  notes: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
}

const HTTPS = /^https:\/\/\S+$/;

export function ReferencePage() {
  const toast = useToast();
  const cities = useCities();
  const operators = useOperators();
  const sites = useBookingSites();
  const saveCity = useSaveCity();
  const saveOperator = useSaveOperator();
  const saveSite = useSaveBookingSite();

  const [target, setTarget] = useState<Target>(null);
  const [draft, setDraft] = useState<Draft>({
    name: '',
    notes: '',
    url: '',
    sortOrder: 0,
    isActive: true,
  });

  const busy = saveCity.isPending || saveOperator.isPending || saveSite.isPending;

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  function open(next: NonNullable<Target>): void {
    setDraft({
      name: next.row?.name ?? '',
      notes: next.kind === 'operator' ? (next.row?.notes ?? '') : '',
      url: next.kind === 'site' ? (next.row?.url ?? '') : '',
      sortOrder: next.kind === 'operator' ? 0 : (next.row?.sortOrder ?? 0),
      isActive: next.row?.isActive ?? true,
    });
    setTarget(next);
  }

  const nameError = draft.name.trim() === '' ? 'A name is required.' : undefined;
  const urlError =
    target?.kind === 'site' && !HTTPS.test(draft.url.trim())
      ? 'Enter a full https:// address.'
      : undefined;
  const canSave = nameError === undefined && urlError === undefined;

  function save(): void {
    if (target === null || !canSave) return;
    const handlers = {
      onSuccess: () => {
        setTarget(null);
        toast.success('Saved.');
      },
      onError: reportError,
    };

    if (target.kind === 'city') {
      saveCity.mutate(
        {
          ...(target.row === null ? {} : { id: target.row.id }),
          name: draft.name.trim(),
          sortOrder: draft.sortOrder,
          isActive: draft.isActive,
        },
        handlers,
      );
    } else if (target.kind === 'operator') {
      saveOperator.mutate(
        {
          ...(target.row === null ? {} : { id: target.row.id }),
          name: draft.name.trim(),
          notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
          isActive: draft.isActive,
        },
        handlers,
      );
    } else {
      saveSite.mutate(
        {
          ...(target.row === null ? {} : { id: target.row.id }),
          name: draft.name.trim(),
          url: draft.url.trim(),
          sortOrder: draft.sortOrder,
          isActive: draft.isActive,
        },
        handlers,
      );
    }
  }

  if (cities.isPending || operators.isPending || sites.isPending) {
    return <PageSpinner label="Loading reference data…" />;
  }

  const activeBadge = (isActive: boolean) => (
    <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );

  return (
    <>
      {(sites.data ?? []).length === 0 && (
        <Alert tone="warning" title="No booking sites yet" className="mb-6">
          Add Expedia, MG and TBO links so agents can search hotels.
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader
          title="Cities"
          actions={
            <Button
              size="sm"
              onClick={() => {
                open({ kind: 'city', row: null });
              }}
            >
              New city
            </Button>
          }
        />
        <DataTable
          caption="Cities"
          rows={cities.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Name', cell: (row) => row.name },
            { key: 'sort', header: 'Sort', align: 'right', cell: (row) => row.sortOrder },
            { key: 'active', header: 'Active', cell: (row) => activeBadge(row.isActive) },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cell: (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    open({ kind: 'city', row });
                  }}
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Operators"
          actions={
            <Button
              size="sm"
              onClick={() => {
                open({ kind: 'operator', row: null });
              }}
            >
              New operator
            </Button>
          }
        />
        <DataTable
          caption="Operators"
          rows={operators.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Name', cell: (row) => row.name },
            { key: 'notes', header: 'Notes', cell: (row) => row.notes ?? '—' },
            { key: 'active', header: 'Active', cell: (row) => activeBadge(row.isActive) },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cell: (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    open({ kind: 'operator', row });
                  }}
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="Booking sites"
          description="Where agents check hotel availability."
          actions={
            <Button
              size="sm"
              onClick={() => {
                open({ kind: 'site', row: null });
              }}
            >
              New site
            </Button>
          }
        />
        <DataTable
          caption="Booking sites"
          rows={sites.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Name', cell: (row) => row.name },
            {
              key: 'url',
              header: 'Link',
              cell: (row) => (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 inline-flex items-center gap-1 hover:underline"
                >
                  Open
                  <ExternalLink aria-hidden="true" className="h-3 w-3" />
                </a>
              ),
            },
            { key: 'sort', header: 'Sort', align: 'right', cell: (row) => row.sortOrder },
            { key: 'active', header: 'Active', cell: (row) => activeBadge(row.isActive) },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cell: (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    open({ kind: 'site', row });
                  }}
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Dialog
        open={target !== null}
        onOpenChange={(open_) => {
          if (!open_ && !busy) setTarget(null);
        }}
        title={target === null ? '' : `${target.row === null ? 'New' : 'Edit'} ${target.kind}`}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button loading={busy} disabled={!canSave} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={nameError}>
            <Input
              value={draft.name}
              onChange={(event) => {
                setDraft({ ...draft, name: event.target.value });
              }}
            />
          </Field>

          {target?.kind === 'operator' && (
            <Field label="Notes">
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(event) => {
                  setDraft({ ...draft, notes: event.target.value });
                }}
              />
            </Field>
          )}

          {target?.kind === 'site' && (
            <Field label="URL" required error={urlError} hint="Must start with https://">
              <Input
                value={draft.url}
                placeholder="https://www.expedia.com"
                onChange={(event) => {
                  setDraft({ ...draft, url: event.target.value });
                }}
              />
            </Field>
          )}

          {target?.kind !== 'operator' && (
            <Field label="Sort order">
              <Input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => {
                  setDraft({ ...draft, sortOrder: Number(event.target.value) });
                }}
                className="w-28"
              />
            </Field>
          )}

          <Checkbox
            label="Active"
            checked={draft.isActive}
            onChange={(event) => {
              setDraft({ ...draft, isActive: event.target.checked });
            }}
          />
        </div>
      </Dialog>
    </>
  );
}
