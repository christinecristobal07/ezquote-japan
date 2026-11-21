import { useState } from 'react';
import { Alert, Button, Dialog, Field, Select } from '@/components/ui';

export interface ReassignTarget {
  readonly id: string;
  readonly referenceNo: string;
  readonly agentId: string;
  readonly agentName: string | null;
}

export interface ReassignAgent {
  readonly id: string;
  readonly name: string;
}

/**
 * Hands a quotation to the agent who owns the client.
 *
 * The database decides who may: supervisors of either side, and managers. The
 * agent list is whatever the viewer can already see, so a supervisor sees
 * their team and a manager sees everyone.
 */
export function ReassignDialog({
  quotation,
  agents,
  busy,
  onCancel,
  onConfirm,
}: {
  quotation: ReassignTarget | null;
  agents: readonly ReassignAgent[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (agentId: string) => void;
}) {
  const [agentId, setAgentId] = useState('');

  const choices = agents.filter((agent) => agent.id !== quotation?.agentId);
  const selected = agentId === '' ? '' : agentId;

  return (
    <Dialog
      open={quotation !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setAgentId('');
          onCancel();
        }
      }}
      title="Reassign this quotation"
      description={
        quotation === null
          ? undefined
          : `${quotation.referenceNo} currently belongs to ${quotation.agentName ?? 'another agent'}.`
      }
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setAgentId('');
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={selected === ''}
            onClick={() => {
              onConfirm(selected);
              setAgentId('');
            }}
          >
            Reassign
          </Button>
        </>
      }
    >
      <Field label="New owner" required>
        <Select
          value={selected}
          onChange={(event) => {
            setAgentId(event.target.value);
          }}
        >
          <option value="">Choose an agent…</option>
          {choices.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
      </Field>

      <Alert tone="info" className="mt-3">
        The new owner can edit it; you keep read access if they report to you. The rates, the
        reference number and the Change Rate entries are untouched, and the handover is recorded in
        the audit log.
      </Alert>
    </Dialog>
  );
}
