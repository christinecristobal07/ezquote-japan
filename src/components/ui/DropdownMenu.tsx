import type { ReactNode } from 'react';
import * as Radix from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <Radix.Root>{children}</Radix.Root>;
}

export function DropdownMenuTrigger({ children }: { children: ReactNode }) {
  return <Radix.Trigger asChild>{children}</Radix.Trigger>;
}

export function DropdownMenuContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <Radix.Portal>
      <Radix.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-56 rounded-md border border-slate-200 bg-white p-1 shadow-lg',
          className,
        )}
      >
        {children}
      </Radix.Content>
    </Radix.Portal>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <Radix.Label className="px-3 py-2 text-xs text-slate-500">{children}</Radix.Label>;
}

export function DropdownMenuSeparator() {
  return <Radix.Separator className="my-1 h-px bg-slate-200" />;
}

export function DropdownMenuItem({
  children,
  onSelect,
  danger = false,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
}) {
  return (
    <Radix.Item
      onSelect={onSelect}
      className={cn(
        'cursor-pointer rounded px-3 py-2 text-sm outline-none select-none',
        danger
          ? 'text-red-700 data-[highlighted]:bg-red-50'
          : 'text-slate-700 data-[highlighted]:bg-slate-100',
      )}
    >
      {children}
    </Radix.Item>
  );
}
