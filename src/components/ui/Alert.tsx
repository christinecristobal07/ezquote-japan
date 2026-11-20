import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

const TONES = {
  info: { box: 'bg-brand-50 text-brand-900 border-brand-100', Icon: Info },
  success: { box: 'bg-emerald-50 text-emerald-900 border-emerald-100', Icon: CheckCircle2 },
  warning: { box: 'bg-amber-50 text-amber-900 border-amber-100', Icon: AlertTriangle },
  danger: { box: 'bg-red-50 text-red-900 border-red-100', Icon: XCircle },
} as const;

export type AlertTone = keyof typeof TONES;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border px-4 py-3 text-sm', box, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title !== undefined && <p className="font-medium">{title}</p>}
        {children !== undefined && (
          <div className={title === undefined ? '' : 'mt-0.5'}>{children}</div>
        )}
      </div>
    </div>
  );
}
