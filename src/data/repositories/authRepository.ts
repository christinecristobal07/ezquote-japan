import type { AuthError, Session, Subscription } from '@supabase/supabase-js';
import { supabase } from '@/data/supabaseClient';

/**
 * Every auth failure the UI can meaningfully react to. Supabase messages are
 * mapped here so pages never show raw API text.
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'RATE_LIMITED'
  | 'WEAK_PASSWORD'
  | 'SAME_PASSWORD'
  | 'LINK_EXPIRED'
  | 'NO_SESSION'
  | 'NETWORK'
  | 'UNKNOWN';

export class AppAuthError extends Error {
  override readonly name = 'AppAuthError';
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Readonly<Record<AuthErrorCode, string>> = {
  INVALID_CREDENTIALS: 'That email or password is not right. Please try again.',
  EMAIL_NOT_CONFIRMED: 'Please confirm your email address first, then sign in.',
  RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
  WEAK_PASSWORD:
    'That password is too weak. Use at least 10 characters with a lowercase letter, an uppercase letter and a digit.',
  SAME_PASSWORD: 'Please choose a password you have not used here before.',
  LINK_EXPIRED: 'That link has expired. Ask for a new one and try again.',
  NO_SESSION: 'Your session has ended. Please sign in again.',
  NETWORK: 'Could not reach the server. Check your connection and try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

function classify(error: AuthError): AuthErrorCode {
  const status = error.status ?? 0;
  const text = `${error.code ?? ''} ${error.message}`.toLowerCase();

  if (status === 429 || text.includes('rate limit') || text.includes('too many')) {
    return 'RATE_LIMITED';
  }
  if (text.includes('email not confirmed')) return 'EMAIL_NOT_CONFIRMED';
  if (text.includes('invalid login credentials') || status === 400) {
    if (text.includes('weak password') || text.includes('password should be')) {
      return 'WEAK_PASSWORD';
    }
    if (text.includes('should be different')) return 'SAME_PASSWORD';
    if (text.includes('expired') || text.includes('invalid or has expired')) return 'LINK_EXPIRED';
    return 'INVALID_CREDENTIALS';
  }
  if (text.includes('weak password') || text.includes('password should be')) return 'WEAK_PASSWORD';
  if (text.includes('expired')) return 'LINK_EXPIRED';
  if (status === 401 || status === 403) return 'NO_SESSION';
  if (text.includes('fetch') || text.includes('network')) return 'NETWORK';
  return 'UNKNOWN';
}

function toAppError(error: AuthError): AppAuthError {
  const code = classify(error);
  return new AppAuthError(code, MESSAGES[code]);
}

export function messageFor(code: AuthErrorCode): string {
  return MESSAGES[code];
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw toAppError(error);
  // Supabase guarantees a session whenever there is no error.
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error);
}

/**
 * Sends a reset link. The caller never learns whether the address exists —
 * the page shows the same message either way.
 */
export async function sendPasswordReset(
  email: string,
  redirectTo = `${globalThis.location.origin}/auth/set-password`,
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });
  if (error) throw toAppError(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error);
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toAppError(error);
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void): Subscription {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}
