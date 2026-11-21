import { cn } from '@/lib/cn';

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;

export function Spinner({
  size = 'md',
  className,
  label,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** Give a label when the spinner stands alone; omit it inside a button. */
  label?: string;
}) {
  return (
    <span
      role={label === undefined ? 'presentation' : 'status'}
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        SIZES[size],
        className,
      )}
    />
  );
}

/**
 * Loading state for a page that has not rendered yet.
 *
 * A bare <Spinner> sits in the top-left corner against a wide empty page,
 * which reads as a broken layout rather than as waiting.
 */
export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-64 w-full flex-col items-center justify-center gap-3 py-16">
      <Spinner size="lg" label={label} className="text-brand-600" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size="lg" label={label} className="text-brand-600" />
    </div>
  );
}
