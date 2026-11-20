import { useState } from 'react';
import { Link } from 'react-router';
import { sendPasswordReset } from '@/data/repositories/authRepository';
import { Button, Field, Input } from '@/components/ui';
import { AuthCard, FormNotice } from './AuthCard';

/**
 * The confirmation is identical whether or not the address exists, so this page
 * cannot be used to find out who has an account.
 */
const SENT_MESSAGE = 'If that email exists, a link was sent. Please check your inbox.';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(): Promise<void> {
    setBusy(true);
    try {
      await sendPasswordReset(email);
    } catch {
      // Deliberately ignored: revealing the failure would reveal the account.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <AuthCard title="Reset your password" subtitle="We will email you a link to set a new one.">
      {sent ? (
        <FormNotice>{SENT_MESSAGE}</FormNotice>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
          <Field label="Email">
            <Input
              type="email"
              name="email"
              autoComplete="username"
              required
              disabled={busy}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-slate-600">
        <Link to="/login" className="text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
