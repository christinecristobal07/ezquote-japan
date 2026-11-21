import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export interface AutosaveApi<T> {
  readonly state: SaveState;
  /** Queue a save. Repeated calls within the delay collapse into one. */
  readonly push: (value: T) => void;
  /** Run the pending save now, for the "retry" button. */
  readonly retry: () => void;
}

export const AUTOSAVE_DELAY_MS = 800;

/**
 * Debounced saving for one section of the builder.
 *
 * The pending value is kept in a ref and only cleared once the save resolves,
 * so a failure never loses what the agent typed — "Retry" sends exactly the
 * same value again.
 */
export function useAutosave<T>(
  save: (value: T) => Promise<unknown>,
  delayMs = AUTOSAVE_DELAY_MS,
): AutosaveApi<T> {
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const run = useCallback(() => {
    const queued = pending.current;
    if (queued === null) return;
    setState('saving');
    void saveRef.current(queued.value).then(
      () => {
        pending.current = null;
        setState('saved');
      },
      () => {
        // Keep the value queued so Retry resends it unchanged.
        setState('failed');
      },
    );
  }, []);

  const push = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(run, delayMs);
    },
    [delayMs, run],
  );

  const retry = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    run();
  }, [run]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { state, push, retry };
}

export function saveStateLabel(state: SaveState): string {
  switch (state) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'failed':
      return 'Not saved, retry';
    case 'idle':
      return '';
  }
}
