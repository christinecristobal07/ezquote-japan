import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AppAuthError, signInWithPassword } from '@/data/repositories/authRepository';
import { AuthCard, Field, FormError, SubmitButton } from '@/components/ui/Form';
import { safeRedirectTo } from '@/app/guards/redirectTo';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await signInWithPassword(email, password);
      await navigate(safeRedirectTo(params.get('redirectTo')), { replace: true });
    } catch (caught) {
      setError(
        caught instanceof AppAuthError ? caught.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="EZQUOTE Japan" subtitle="Sign in to build and manage quotations.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="space-y-4"
        noValidate
      >
        {error !== null && <FormError>{error}</FormError>}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          required
          disabled={busy}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={busy}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        <Link to="/forgot-password" className="text-brand-600 hover:underline">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-6 text-xs text-slate-500">
        Accounts are created by your administrator. There is no public sign-up.
      </p>
    </AuthCard>
  );
}
