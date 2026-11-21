import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '@/components/ui';

export interface UnsavedChangesPromptProps {
  /** True while the form holds edits that have not been saved. */
  readonly when: boolean;
  readonly title?: string;
  readonly message?: string;
}

/**
 * Stops an in-app navigation while a form is dirty, and asks first.
 *
 * Two different escapes need covering: react-router handles links and the back
 * button, while `beforeunload` covers a tab close or a reload, which the
 * router never sees. The browser shows its own wording for the second, which
 * is why only the first gets a dialog of ours.
 *
 * Requires a data router (createBrowserRouter), so tests that mount a plain
 * MemoryRouter should not render this.
 */
export function UnsavedChangesPrompt({
  when,
  title = 'Leave without saving?',
  message = 'Your changes to this form have not been saved. Leaving now discards them.',
}: UnsavedChangesPromptProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }
    globalThis.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      globalThis.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      title={title}
      message={message}
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      danger
      onConfirm={() => {
        blocker.proceed?.();
      }}
    />
  );
}
