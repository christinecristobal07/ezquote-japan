/**
 * Who gets an invitation, and what kind.
 *
 * Kept free of Deno and Supabase imports so the Edge Function and the browser
 * share one definition, and so it can be unit tested without a runtime.
 */

export const MAX_INVITES_PER_CALL = 50;

export type InviteStatus = 'invited' | 'resent' | 'skipped' | 'error';

export interface InviteResult {
  readonly profileId: string;
  readonly status: InviteStatus;
  readonly message: string;
}

export interface InviteRequest {
  readonly profileIds: readonly string[];
}

export interface InviteResponse {
  readonly results: readonly InviteResult[];
}

/** What the function knows about one profile before deciding. */
export interface InviteCandidate {
  readonly profileId: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly isActive: boolean;
  /** An auth user already exists for this address. */
  readonly authUserExists: boolean;
  /** That user has confirmed their email, so they can already sign in. */
  readonly emailConfirmed: boolean;
}

export type InviteAction =
  | { readonly kind: 'invite' }
  | { readonly kind: 'resend' }
  | { readonly kind: 'skip'; readonly reason: string };

/**
 * Decides what to do with one candidate.
 *
 * Someone who has already confirmed is skipped rather than re-invited: a fresh
 * invitation would send them a set-password link they did not ask for, which
 * reads like an account takeover attempt.
 */
export function decideInvite(candidate: InviteCandidate): InviteAction {
  if (!candidate.isActive) {
    return { kind: 'skip', reason: 'The profile is inactive.' };
  }
  if (candidate.email === null || candidate.email.trim() === '') {
    return { kind: 'skip', reason: 'No email address on this profile.' };
  }
  if (candidate.emailConfirmed) {
    return { kind: 'skip', reason: 'This person already has a working login.' };
  }
  if (candidate.authUserExists) {
    return { kind: 'resend', reason: '' } as InviteAction;
  }
  return { kind: 'invite' };
}

export function describeAction(action: InviteAction, fullName: string): string {
  switch (action.kind) {
    case 'invite':
      return `Invitation sent to ${fullName}.`;
    case 'resend':
      return `Invitation resent to ${fullName}.`;
    case 'skip':
      return action.reason;
  }
}

export type InviteValidation =
  | { readonly ok: true; readonly profileIds: readonly string[] }
  | { readonly ok: false; readonly message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the request body before any email is sent. */
export function validateInviteRequest(body: unknown): InviteValidation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Expected a JSON object.' };
  }
  const ids = (body as { profileIds?: unknown }).profileIds;
  if (!Array.isArray(ids)) {
    return { ok: false, message: 'profileIds must be an array.' };
  }
  if (ids.length === 0) {
    return { ok: false, message: 'Select at least one agent.' };
  }
  if (ids.length > MAX_INVITES_PER_CALL) {
    return {
      ok: false,
      message: `Invite at most ${String(MAX_INVITES_PER_CALL)} agents at a time.`,
    };
  }
  const profileIds: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID.test(id)) {
      return { ok: false, message: 'Every profileId must be a UUID.' };
    }
    profileIds.push(id);
  }
  return { ok: true, profileIds: [...new Set(profileIds)] };
}

export interface InviteSummary {
  readonly invited: number;
  readonly resent: number;
  readonly skipped: number;
  readonly errors: number;
}

export function summariseInvites(results: readonly InviteResult[]): InviteSummary {
  return {
    invited: results.filter((result) => result.status === 'invited').length,
    resent: results.filter((result) => result.status === 'resent').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    errors: results.filter((result) => result.status === 'error').length,
  };
}
