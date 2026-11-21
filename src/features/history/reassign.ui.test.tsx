import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReassignDialog, type ReassignTarget } from './ReassignDialog';

const AGENTS = [
  { id: 'a1', name: 'Aira Cruz' },
  { id: 'a2', name: 'Ben Santos' },
  { id: 'sup', name: 'Supervisor' },
];

const TARGET: ReassignTarget = {
  id: 'q1',
  referenceNo: 'JPN-2026-000123',
  agentId: 'sup',
  agentName: 'Supervisor',
};

describe('ReassignDialog', () => {
  it('stays shut until a quotation is chosen', () => {
    render(
      <ReassignDialog
        quotation={null}
        agents={AGENTS}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the quotation and its current owner', () => {
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText(/JPN-2026-000123 currently belongs to Supervisor/)).toBeVisible();
  });

  it('leaves the current owner out of the list', () => {
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('option', { name: 'Aira Cruz' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Supervisor' })).not.toBeInTheDocument();
  });

  it('will not reassign until an agent is picked', () => {
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reassign' })).toBeDisabled();
  });

  it('reports the chosen agent', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/New owner/), 'a1');
    await user.click(screen.getByRole('button', { name: 'Reassign' }));
    expect(onConfirm).toHaveBeenCalledWith('a1');
  });

  it('says what survives the handover, so nobody fears losing the rates', () => {
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/rates, the reference number and the Change Rate entries/),
    ).toBeVisible();
    expect(screen.getByText(/audit log/)).toBeVisible();
  });

  it('can be dismissed', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('cannot be dismissed or resubmitted while it is saving', () => {
    render(
      <ReassignDialog
        quotation={TARGET}
        agents={AGENTS}
        busy
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
