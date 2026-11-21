import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Button, Card, CardBody, CardHeader, Spinner, useToast } from '@/components/ui';
import { FX_SCALE, diffSnapshots, type RateSnapshot } from '@/domain';
import { ContentError } from '@/data/repositories/contentRepository';
import { RequoteDialog } from '@/features/history/RequoteDialog';
import { SnapshotDiffList } from './SnapshotDiffList';
import { useCurrentSnapshot, useDuplicateQuotation } from '@/features/history/queries';
import type { DuplicateResult } from '@/data/repositories/quotationRepository';

function manila(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

/**
 * What rates this quotation is priced with, and whether they have moved since.
 *
 * The snapshot is frozen on purpose — a quote already sent to a client must not
 * change under them — so the only way to adopt new rates is a requote, which
 * makes a separate quotation and leaves this one intact.
 */
export function SnapshotPanel({
  quotationId,
  snapshot,
  ratesAsOf,
  canRequote,
}: {
  quotationId: string;
  snapshot: RateSnapshot;
  ratesAsOf: string;
  canRequote: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [comparing, setComparing] = useState(false);
  const [requoted, setRequoted] = useState<DuplicateResult | null>(null);

  const current = useCurrentSnapshot(comparing);
  const duplicate = useDuplicateQuotation();

  const diff = current.data === undefined ? null : diffSnapshots(snapshot, current.data);

  return (
    <Card>
      <CardHeader
        title="Rates snapshot"
        description={`Frozen ${manila(ratesAsOf)}. Rate changes after that do not touch this quotation.`}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setComparing(true);
            }}
          >
            Compare with current rates
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-600">Exchange rate</dt>
            <dd className="text-slate-900">
              JPY 1 = {String((snapshot.fx.JPY ?? 0) / FX_SCALE)} PHP
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-slate-600">Services in this snapshot</dt>
            <dd className="text-slate-900">{String(snapshot.services.length)}</dd>
          </div>
        </dl>

        {comparing && current.isPending && <Spinner label="Reading today's rates…" />}

        {current.error !== null && comparing && (
          <Alert tone="danger" title="Could not read today's rates">
            {current.error.message}
          </Alert>
        )}

        {diff !== null && !diff.hasChanges && (
          <Alert tone="success" title="Nothing has changed">
            Today&apos;s rates match this quotation&apos;s snapshot.
          </Alert>
        )}

        {diff !== null && diff.hasChanges && (
          <>
            <Alert tone="warning" title="Rates have changed since this quotation">
              This quotation keeps the rates above. A requote creates a new quotation priced with
              today&apos;s rates and leaves this one as it is.
            </Alert>
            <SnapshotDiffList diff={diff} />
          </>
        )}

        {canRequote && (
          <Button
            variant="secondary"
            loading={duplicate.isPending}
            onClick={() => {
              duplicate.mutate(quotationId, {
                onSuccess: (result) => {
                  setRequoted(result);
                },
                onError: (caught: unknown) => {
                  toast.error(
                    caught instanceof ContentError ? caught.message : 'Could not requote.',
                  );
                },
              });
            }}
          >
            Requote with current rates
          </Button>
        )}
      </CardBody>

      <RequoteDialog
        result={requoted}
        onClose={() => {
          setRequoted(null);
        }}
        onOpen={(id) => {
          setRequoted(null);
          void navigate(`/quotations/${id}`);
        }}
      />
    </Card>
  );
}
