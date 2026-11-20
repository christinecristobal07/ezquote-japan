import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export function Field({
  label,
  error,
  hint,
  ...input
}: {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? (hint === undefined ? undefined : hintId) : errorId}
        className="focus:border-brand-600 focus:ring-brand-600/30 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:outline-none disabled:bg-slate-100"
        {...input}
      />
      {hint !== undefined && error === undefined && (
        <div id={hintId} className="text-xs text-slate-500">
          {hint}
        </div>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {children}
    </p>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="bg-brand-600 hover:bg-brand-700 w-full rounded-md px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-brand-600 text-sm font-medium tracking-wide uppercase">
          Gladex Travel &amp; Tours
        </p>
        <h1 className="text-brand-900 mt-1 text-2xl font-semibold">{title}</h1>
        {subtitle !== undefined && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
      <span className="sr-only">{label}</span>
      <div className="border-brand-600 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  );
}
