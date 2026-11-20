import { formatPhp, type Centavos } from '@/domain';
import { cn } from '@/lib/cn';

/** Tabular numbers so columns of prices line up. */
export function MoneyText({
  centavos,
  className,
}: {
  centavos: Centavos | null;
  className?: string;
}) {
  return (
    <span className={cn('font-medium tabular-nums', className)}>
      {centavos === null ? '—' : formatPhp(centavos)}
    </span>
  );
}
