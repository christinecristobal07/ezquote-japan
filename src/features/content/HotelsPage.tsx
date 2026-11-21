import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  Input,
  Select,
  PageSpinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { groupHotelsForOutput } from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import type { Hotel } from '@/data/repositories/referenceRepository';
import { useCities, useDeleteHotel, useHotels, useSaveHotel } from './queries';

interface HotelDraft {
  cityId: string;
  name: string;
  starRating: number;
  walkToStation: string;
  roomTypes: string;
  notes: string;
  sortOrder: number;
  isActive: boolean;
}

function toDraft(hotel: Hotel | null, defaultCityId: string): HotelDraft {
  return {
    cityId: hotel?.cityId ?? defaultCityId,
    name: hotel?.name ?? '',
    starRating: hotel?.starRating ?? 3,
    walkToStation: hotel?.walkToStation ?? '',
    roomTypes: hotel?.roomTypes ?? '',
    notes: hotel?.notes ?? '',
    sortOrder: hotel?.sortOrder ?? 0,
    isActive: hotel?.isActive ?? true,
  };
}

export function HotelsPage() {
  const toast = useToast();
  const hotels = useHotels();
  const cities = useCities();
  const save = useSaveHotel();
  const remove = useDeleteHotel();

  const [editing, setEditing] = useState<{ hotel: Hotel | null } | null>(null);
  const [draft, setDraft] = useState<HotelDraft | null>(null);
  const [deleting, setDeleting] = useState<Hotel | null>(null);
  const [cityFilter, setCityFilter] = useState('all');
  const [starFilter, setStarFilter] = useState('all');
  const [search, setSearch] = useState('');

  const cityName = useMemo(() => {
    const map = new Map((cities.data ?? []).map((city) => [city.id, city.name]));
    return (id: string): string => map.get(id) ?? '—';
  }, [cities.data]);

  const rows = (hotels.data ?? []).filter((hotel) => {
    if (cityFilter !== 'all' && hotel.cityId !== cityFilter) return false;
    if (starFilter !== 'all' && String(hotel.starRating) !== starFilter) return false;
    const needle = search.trim().toLowerCase();
    return needle === '' || hotel.name.toLowerCase().includes(needle);
  });

  const groups = groupHotelsForOutput(
    rows.map((hotel) => ({
      name: hotel.name,
      starRating: hotel.starRating,
      isActive: hotel.isActive,
    })),
  );

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  function open(hotel: Hotel | null): void {
    const fallback = cities.data?.[0]?.id ?? '';
    setDraft(toDraft(hotel, fallback));
    setEditing({ hotel });
  }

  if (hotels.isPending || cities.isPending) return <PageSpinner label="Loading hotels…" />;

  const nameError = draft !== null && draft.name.trim() === '' ? 'A name is required.' : undefined;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" className="w-56">
          <Input
            value={search}
            placeholder="Hotel name"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </Field>
        <Field label="City" className="w-44">
          <Select
            value={cityFilter}
            onChange={(event) => {
              setCityFilter(event.target.value);
            }}
          >
            <option value="all">All cities</option>
            {(cities.data ?? []).map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Star rating" className="w-36">
          <Select
            value={starFilter}
            onChange={(event) => {
              setStarFilter(event.target.value);
            }}
          >
            <option value="all">All</option>
            <option value="3">3 star</option>
            <option value="4">4 star</option>
            <option value="5">5 star</option>
          </Select>
        </Field>
        <Button
          className="ml-auto"
          onClick={() => {
            open(null);
          }}
        >
          New hotel
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader title="Hotels" description={`${String(rows.length)} shown`} />
        <DataTable
          caption="Hotels with their city and rating"
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Name', cell: (row) => row.name },
            { key: 'city', header: 'City', cell: (row) => cityName(row.cityId) },
            {
              key: 'star',
              header: 'Rating',
              cell: (row) => <Badge tone="info">{row.starRating} star</Badge>,
            },
            { key: 'walk', header: 'Walk to station', cell: (row) => row.walkToStation ?? '—' },
            {
              key: 'active',
              header: 'Active',
              cell: (row) => (
                <Badge tone={row.isActive ? 'success' : 'neutral'}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      open(row);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleting(row);
                    }}
                  >
                    Delete
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="Quotation preview"
          description="How the hotel section reads, grouped by category."
        />
        <CardBody>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-600">No active hotels match those filters.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {groups.map((group) => (
                <p key={group.starRating} className="whitespace-pre-wrap">
                  {group.line}
                </p>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open_) => {
          if (!open_ && !save.isPending) setEditing(null);
        }}
        title={editing?.hotel === null ? 'New hotel' : 'Edit hotel'}
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
              disabled={nameError !== undefined}
              onClick={() => {
                if (draft === null || editing === null) return;
                const values = {
                  cityId: draft.cityId,
                  name: draft.name.trim(),
                  starRating: draft.starRating,
                  walkToStation:
                    draft.walkToStation.trim() === '' ? null : draft.walkToStation.trim(),
                  roomTypes: draft.roomTypes.trim() === '' ? null : draft.roomTypes.trim(),
                  notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
                  sortOrder: draft.sortOrder,
                  isActive: draft.isActive,
                };
                const input =
                  editing.hotel === null
                    ? { mode: 'create' as const, values, cityName: cityName(draft.cityId) }
                    : {
                        mode: 'update' as const,
                        id: editing.hotel.id,
                        updatedAt: editing.hotel.updatedAt,
                        values,
                        cityName: cityName(draft.cityId),
                      };
                save.mutate(input, {
                  onSuccess: () => {
                    setEditing(null);
                    toast.success('Hotel saved.');
                  },
                  onError: reportError,
                });
              }}
            >
              Save hotel
            </Button>
          </>
        }
      >
        {draft !== null && (
          <div className="space-y-4">
            <Field label="City" required>
              <Select
                value={draft.cityId}
                onChange={(event) => {
                  setDraft({ ...draft, cityId: event.target.value });
                }}
              >
                {(cities.data ?? []).map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" required error={nameError}>
              <Input
                value={draft.name}
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Star rating" required>
                <Select
                  value={String(draft.starRating)}
                  onChange={(event) => {
                    setDraft({ ...draft, starRating: Number(event.target.value) });
                  }}
                >
                  <option value="3">3 star</option>
                  <option value="4">4 star</option>
                  <option value="5">5 star</option>
                </Select>
              </Field>
              <Field label="Sort order">
                <Input
                  type="number"
                  value={draft.sortOrder}
                  onChange={(event) => {
                    setDraft({ ...draft, sortOrder: Number(event.target.value) });
                  }}
                />
              </Field>
            </div>
            <Field label="Walk to station">
              <Input
                value={draft.walkToStation}
                placeholder="~5 min walk to Namba Station"
                onChange={(event) => {
                  setDraft({ ...draft, walkToStation: event.target.value });
                }}
              />
            </Field>
            <Field label="Room types">
              <Input
                value={draft.roomTypes}
                onChange={(event) => {
                  setDraft({ ...draft, roomTypes: event.target.value });
                }}
              />
            </Field>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(event) => {
                  setDraft({ ...draft, notes: event.target.value });
                }}
              />
            </Field>
            <Checkbox
              label="Active"
              checked={draft.isActive}
              onChange={(event) => {
                setDraft({ ...draft, isActive: event.target.checked });
              }}
            />
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open_) => {
          if (!open_) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? ''}?`}
        message="If this hotel appears in any quotation it cannot be deleted; deactivate it instead."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleting === null) return;
          await remove
            .mutateAsync(deleting.id)
            .then(() => {
              toast.success('Hotel deleted.');
            })
            .catch(reportError);
          setDeleting(null);
        }}
      />

      {(hotels.data ?? []).length === 0 && (
        <Alert tone="info" className="mt-6">
          No hotels yet. Add the properties agents offer per star category.
        </Alert>
      )}
    </>
  );
}
