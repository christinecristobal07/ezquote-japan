import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AppAuthError, updatePassword } from '@/data/repositories/authRepository';
import { AuthCard, Field, FormError, SubmitButton } from '@/components/ui/Form';
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, validatePassword } from './password';
import { useAuth } from './useAuth';

/**
 * Serves both the invite link and the reset link. Supabase has already put a
 * session in place by the time this page renders; without one the link was
 * stale, so we say so rather than failing on submit.
 */
export function SetPasswordPage() {
  const navigate = useNavigate();
  const { status, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkIsStale = status !== 'loading' && session === null;

  async function handleSubmit(): Promise<void> {
    const ruleError = validatePassword(password);
    if (ruleError !== null) {
      setError(ruleError);
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      await navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof AppAuthError ? caught.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (linkIsStale) {
    return (
      <AuthCard title="This link has expired">
        <p className="text-sm text-slate-600">
          Password links can only be used once and expire after a while. Ask for a new one.
        </p>
        <p className="mt-4 text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">
            Send me a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" subtitle="Choose a password you have not used elsewhere.">
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
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={busy}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint={
            <ul className="list-inside list-disc">
              {PASSWORD_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          }
        />
        <Field
          label="Confirm password"
          type="password"
          name="confirmation"
          autoComplete="new-password"
          required
          disabled={busy}
          value={confirmation}
          onChange={(e) => {
            setConfirmation(e.target.value);
          }}
        />
        <SubmitButton busy={busy}>Save password</SubmitButton>
      </form>
    </AuthCard>
  );
}
