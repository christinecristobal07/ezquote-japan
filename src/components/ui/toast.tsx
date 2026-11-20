import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';
import {
  MAX_TOASTS,
  TOAST_DURATION_MS,
  ToastContext,
  type Toast,
  type ToastApi,
  type ToastTone,
} from './toastContext';

const TONES: Record<ToastTone, { box: string; Icon: typeof Info }> = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  error: { box: 'border-red-200 bg-red-50 text-red-900', Icon: XCircle },
  info: { box: 'border-brand-100 bg-brand-50 text-brand-900', Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
      // Keep only the newest few; a wall of toasts helps nobody.
      setToasts((current) => [...current, { id, tone, message }].slice(-MAX_TOASTS));
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => {
        push('success', message);
      },
      error: (message) => {
        push('error', message);
      },
      info: (message) => {
        push('info', message);
      },
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const { box, Icon } = TONES[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-md',
                box,
              )}
            >
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1">{toast.message}</p>
              <IconButton
                aria-label="Dismiss notification"
                className="h-5 w-5 hover:bg-black/5"
                onClick={() => {
                  dismiss(toast.id);
                }}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
