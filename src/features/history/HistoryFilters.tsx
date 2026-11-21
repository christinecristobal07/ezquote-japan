import { Button, Field, Input, Select } from '@/components/ui';
import {
  QUOTATION_STATUSES,
  hasActiveQuotationFilters,
  type QuotationFilters,
  type QuotationStatusFilter,
} from '@/domain';
import { STATUS_LABELS } from './statusLabels';

export interface AgentOption {
  readonly id: string;
  readonly name: string;
}

export function HistoryFilters({
  filters,
  agents,
  onChange,
}: {
  filters: QuotationFilters;
  /** Undefined for an agent looking at their own list. */
  agents: readonly AgentOption[] | undefined;
  onChange: (next: QuotationFilters) => void;
}) {
  const status = filters.statuses[0] ?? '';

  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
      }}
      role="search"
    >
      <Field label="Search" className="min-w-56 flex-1">
        <Input
          type="search"
          value={filters.search}
          placeholder="Reference, client or package"
          onChange={(event) => {
            onChange({ ...filters, search: event.target.value, page: 1 });
          }}
        />
      </Field>

      <Field label="Status">
        <Select
          value={status}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...filters,
              statuses: value === '' ? [] : [value as QuotationStatusFilter],
              page: 1,
            });
          }}
        >
          <option value="">Any status</option>
          {QUOTATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      {agents !== undefined && (
        <Field label="Agent">
          <Select
            value={filters.agentId}
            onChange={(event) => {
              onChange({ ...filters, agentId: event.target.value, page: 1 });
            }}
          >
            <option value="">Everyone</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Travel from">
        <Input
          type="date"
          value={filters.from}
          onChange={(event) => {
            onChange({ ...filters, from: event.target.value, page: 1 });
          }}
        />
      </Field>

      <Field label="Travel to">
        <Input
          type="date"
          value={filters.to}
          onChange={(event) => {
            onChange({ ...filters, to: event.target.value, page: 1 });
          }}
        />
      </Field>

      {hasActiveQuotationFilters(filters) && (
        <Button
          variant="ghost"
          onClick={() => {
            onChange({
              ...filters,
              search: '',
              statuses: [],
              agentId: '',
              from: '',
              to: '',
              page: 1,
            });
          }}
        >
          Clear filters
        </Button>
      )}
    </form>
  );
}
