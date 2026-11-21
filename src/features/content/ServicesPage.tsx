import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';
import { ContentError } from '@/data/repositories/contentRepository';
import type { ServiceMeta } from '@/data/repositories/contentRepository';
import { useServiceRates } from '@/features/rates/queries';
import { useCities, useOperators, useSaveService, useServiceMeta } from './queries';
import { UnsavedChangesPrompt } from '@/app/guards/UnsavedChangesPrompt';
import { ServiceForm } from './ServiceForm';
import { emptyService, fromService, type ServiceFormValues } from './serviceFormValues';

type Editing = { mode: 'create' } | { mode: 'edit'; service: ServiceMeta } | null;

export function ServicesPage() {
  const toast = useToast();
  const services = useServiceMeta();
  const cities = useCities();
  const operators = useOperators();
  const rates = useServiceRates();
  const save = useSaveService();

  const [editing, setEditing] = useState<Editing>(null);
  const [dirty, setDirty] = useState(false);
  const [deactivating, setDeactivating] = useState<ServiceMeta | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'tour' | 'transfer'>('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  const cityName = useMemo(() => {
    const map = new Map((cities.data ?? []).map((city) => [city.id, city.name]));
    return (id: string | null): string => (id === null ? '—' : (map.get(id) ?? '—'));
  }, [cities.data]);

  const hasRate = useMemo(() => {
    const map = new Map((rates.data ?? []).map((row) => [row.serviceId, row.published !== null]));
    return (id: string): boolean => map.get(id) ?? false;
  }, [rates.data]);

  const rows = (services.data ?? []).filter((service) => {
    if (typeFilter !== 'all' && service.serviceType !== typeFilter) return false;
    if (!showInactive && !service.isActive) return false;
    const needle = search.trim().toLowerCase();
    if (needle !== '' && !`${service.name} ${service.code}`.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });

  function reportError(caught: unknown): void {
    toast.error(caught instanceof ContentError ? caught.message : 'Something went wrong.');
  }

  function submit(values: ServiceFormValues): void {
    if (editing === null) return;
    const payload = {
      name: values.name,
      cityId: values.cityId,
      operatorId: values.operatorId,
      description: values.description,
      itineraryTitle: values.itineraryTitle,
      itineraryText: values.itineraryText,
      inclusionText: values.inclusionText,
      consumesDay: values.consumesDay,
      addsNight: values.addsNight,
      transferDirection: values.transferDirection,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    };

    const input =
      editing.mode === 'create'
        ? {
            mode: 'create' as const,
            values: { ...payload, code: values.code, serviceType: values.serviceType },
          }
        : {
            mode: 'update' as const,
            id: editing.service.id,
            updatedAt: editing.service.updatedAt,
            values: payload,
          };

    save.mutate(input, {
      onSuccess: () => {
        setDirty(false);
        setEditing(null);
        toast.success('Service saved.');
      },
      onError: reportError,
    });
  }

  if (services.isPending || cities.isPending || operators.isPending) {
    return <Spinner label="Loading services…" />;
  }

  if (editing !== null) {
    const initial = editing.mode === 'create' ? emptyService() : fromService(editing.service);
    return (
      <>
        <UnsavedChangesPrompt when={dirty} />
        <ServiceForm
          mode={editing.mode}
          initial={initial}
          cities={cities.data ?? []}
          operators={operators.data ?? []}
          serviceId={editing.mode === 'edit' ? editing.service.id : undefined}
          hasPublishedRate={editing.mode === 'edit' ? hasRate(editing.service.id) : undefined}
          busy={save.isPending}
          onSubmit={submit}
          onDirtyChange={setDirty}
          onCancel={() => {
            setDirty(false);
            setEditing(null);
          }}
        />
      </>
    );
  }

  const tours = rows.filter((row) => row.serviceType === 'tour');
  const transfers = rows.filter((row) => row.serviceType === 'transfer');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" className="w-56">
          <Input
            value={search}
            placeholder="Name or code"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </Field>
        <Field label="Type" className="w-40">
          <Select
            value={typeFilter}
            onChange={(event) => {
              const next = event.target.value;
              setTypeFilter(next === 'tour' || next === 'transfer' ? next : 'all');
            }}
          >
            <option value="all">All</option>
            <option value="tour">Tours</option>
            <option value="transfer">Transfers</option>
          </Select>
        </Field>
        <Field label="Inactive" className="w-40">
          <Select
            value={showInactive ? 'show' : 'hide'}
            onChange={(event) => {
              setShowInactive(event.target.value === 'show');
            }}
          >
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </Select>
        </Field>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing({ mode: 'create' });
          }}
        >
          New service
        </Button>
      </div>

      {[
        { title: 'Tours', data: tours },
        { title: 'Transfers', data: transfers },
      ].map((group) => (
        <Card key={group.title} className="mb-6">
          <CardHeader title={group.title} description={`${String(group.data.length)} services`} />
          <DataTable
            caption={`${group.title} and their settings`}
            rows={group.data}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Name', cell: (row) => row.name },
              {
                key: 'code',
                header: 'Code',
                cell: (row) => <code className="text-xs">{row.code}</code>,
              },
              { key: 'city', header: 'City', cell: (row) => cityName(row.cityId) },
              {
                key: 'rules',
                header: 'Day rules',
                cell: (row) => (
                  <span className="flex flex-wrap gap-1">
                    {row.consumesDay && <Badge tone="info">Consumes day</Badge>}
                    {row.addsNight && <Badge tone="info">Adds night</Badge>}
                    {row.serviceType === 'transfer' && (
                      <Badge tone="neutral">
                        {row.transferDirection === 'one_way' ? 'One way' : 'Round trip'}
                      </Badge>
                    )}
                  </span>
                ),
              },
              {
                key: 'rate',
                header: 'Rate',
                cell: (row) =>
                  hasRate(row.id) ? (
                    <Badge tone="success">Published</Badge>
                  ) : (
                    <Link to={`/admin/rates/${row.id}`} className="text-brand-700 hover:underline">
                      <Badge tone="warning">No published rate</Badge>
                    </Link>
                  ),
              },
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
                        setEditing({ mode: 'edit', service: row });
                      }}
                    >
                      Edit
                    </Button>
                    {row.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeactivating(row);
                        }}
                      >
                        Deactivate
                      </Button>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </Card>
      ))}

      {rows.length === 0 && <Alert tone="info">No services match those filters.</Alert>}

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={`Deactivate ${deactivating?.name ?? ''}?`}
        message="Inactive services are not offered on new quotations; existing quotations are unaffected."
        confirmLabel="Deactivate"
        danger
        onConfirm={async () => {
          if (deactivating === null) return;
          await save
            .mutateAsync({
              mode: 'update',
              id: deactivating.id,
              updatedAt: deactivating.updatedAt,
              values: { ...fromService(deactivating), isActive: false },
            })
            .then(() => {
              toast.success('Service deactivated.');
            })
            .catch(reportError);
          setDeactivating(null);
        }}
      />
    </>
  );
}
