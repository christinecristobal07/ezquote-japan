import { Alert, Button, Dialog } from '@/components/ui';
import type { DuplicateResult } from '@/data/repositories/quotationRepository';

/**
 * What a requote produced: the new reference, and anything that could not come
 * across because it is no longer on sale. Saying so here is the point — a
 * silently thinner copy would be quoted to a client as if complete.
 */
export function RequoteDialog({
  result,
  onClose,
  onOpen,
}: {
  result: DuplicateResult | null;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const skipped = [...(result?.skippedServices ?? []), ...(result?.skippedAddons ?? [])];

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Requoted at today's rates"
      description={
        result === null
          ? undefined
          : `${result.referenceNo} is a copy priced with the rates in force now.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Stay here
          </Button>
          <Button
            onClick={() => {
              if (result !== null) onOpen(result.id);
            }}
          >
            Open the copy
          </Button>
        </>
      }
    >
      {skipped.length > 0 ? (
        <Alert tone="warning" title="Some items could not be carried over">
          <p>These are no longer on sale, so the copy does not include them:</p>
          <ul className="mt-2 list-disc pl-5">
            {skipped.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <p className="text-sm text-slate-600">
          Everything carried over. Change Rate entries were copied as one netted figure per
          category.
        </p>
      )}
    </Dialog>
  );
}
