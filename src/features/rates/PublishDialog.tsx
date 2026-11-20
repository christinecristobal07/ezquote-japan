import { Badge, Button, Dialog } from '@/components/ui';
import { diffTiers, type DraftTier } from '@/domain';

const CHANGE_TONE = {
  added: 'success',
  removed: 'danger',
  changed: 'warning',
  unchanged: 'neutral',
} as const;

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTiers: readonly DraftTier[];
  draftTiers: readonly DraftTier[];
  currency: string;
  busy: boolean;
  onConfirm: () => void;
}

/**
 * Publishing is irreversible, so the dialog shows exactly which bands move and
 * by how much before the manager commits.
 */
export function PublishDialog({
  open,
  onOpenChange,
  currentTiers,
  draftTiers,
  currency,
  busy,
  onConfirm,
}: PublishDialogProps) {
  const rows = diffTiers(currentTiers, draftTiers);
  const changed = rows.filter((row) => row.change !== 'unchanged');

  return (
    <Dialog
      open={open}
      onOpenChange={busy ? () => undefined : onOpenChange}
      title="Publish this rate version?"
      description="Publishing locks these rates permanently. Existing quotations are not affected."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button loading={busy} onClick={onConfirm}>
            Publish
          </Button>
        </>
      }
    >
      <div className="max-h-72 overflow-y-auto">
        {changed.length === 0 ? (
          <p className="text-sm text-slate-600">
            No tier amounts change. Publishing only records a new effective date.
          </p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Tier changes in this version</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th scope="col" className="py-1 text-xs font-semibold text-slate-600 uppercase">
                  Band
                </th>
                <th scope="col" className="py-1 text-xs font-semibold text-slate-600 uppercase">
                  Change
                </th>
                <th
                  scope="col"
                  className="py-1 text-right text-xs font-semibold text-slate-600 uppercase"
                >
                  Old
                </th>
                <th
                  scope="col"
                  className="py-1 text-right text-xs font-semibold text-slate-600 uppercase"
                >
                  New
                </th>
              </tr>
            </thead>
            <tbody>
              {changed.map((row) => (
                <tr
                  key={`${row.paxType}-${String(row.minPax)}-${String(row.maxPax)}`}
                  className="border-b border-slate-100"
                >
                  <td className="py-1.5">
                    {row.minPax}–{row.maxPax} pax
                    {row.paxType === 'child' && <span className="text-slate-500"> (child)</span>}
                  </td>
                  <td className="py-1.5">
                    <Badge tone={CHANGE_TONE[row.change]}>{row.change}</Badge>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.oldAmount === null ? '—' : `${currency} ${row.oldAmount.toLocaleString()}`}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums">
                    {row.newAmount === null ? '—' : `${currency} ${row.newAmount.toLocaleString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
}
