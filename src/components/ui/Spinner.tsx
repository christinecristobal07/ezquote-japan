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

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size="lg" label={label} className="text-brand-600" />
    </div>
  );
}
