// EZQUOTE Japan · invite-agents
//
// Sends (or resends) Supabase invitations to agent profiles.
//
// Two different clients are used on purpose:
//   - the CALLER's token, to confirm they are an active manager. RLS and
//     app.is_manager() then do the authorising, so this function never has to
//     reimplement the permission rules.
//   - the service-role key, only afterwards, to reach auth.admin. That key is
//     read from the Edge runtime environment and never leaves it.
//
// Deno runtime. The decision logic lives in ./decide.ts so it can be unit
// tested from Vitest without Deno.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  decideInvite,
  describeAction,
  validateInviteRequest,
  type InviteCandidate,
  type InviteResult,
} from './decide.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Supabase injects this into the Edge runtime. It must never reach the browser.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';

/** A small gap between sends, so a bulk run does not trip the email rate limit. */
const DELAY_MS = 400;

const corsHeaders = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sign in first.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = validateInviteRequest(body);
  if (!parsed.ok) return json({ error: parsed.message }, 400);

  // ---------------------------------------------------------------------------
  // 1. Confirm the caller is an active manager, using THEIR token.
  // ---------------------------------------------------------------------------
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: auth } = await asCaller.auth.getUser();
  if (auth.user === null) return json({ error: 'Sign in first.' }, 401);

  const { data: me, error: meError } = await asCaller
    .from('profiles')
    .select('id, role, is_active')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (meError !== null) return json({ error: 'Could not read your profile.' }, 403);
  if (
    me === null ||
    me.is_active !== true ||
    !['super_admin', 'product_development', 'admin'].includes(me.role as string)
  ) {
    return json({ error: 'Only managers can invite agents.' }, 403);
  }

  // ---------------------------------------------------------------------------
  // 2. Only now reach for the service-role key.
  // ---------------------------------------------------------------------------
  if (SERVICE_ROLE_KEY === '') {
    return json({ error: 'The function is missing its service-role key.' }, 500);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, full_name, email, is_active, user_id')
    .in('id', parsed.profileIds);

  if (profilesError !== null) {
    return json({ error: 'Could not load the selected profiles.' }, 500);
  }

  const results: InviteResult[] = [];

  for (const profile of profiles ?? []) {
    let authUserExists = false;
    let emailConfirmed = false;

    if (typeof profile.email === 'string' && profile.email !== '') {
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      // listUsers has no email filter, so fall back to the linked user_id.
      void existing;
      if (profile.user_id !== null) {
        const { data: linked } = await admin.auth.admin.getUserById(profile.user_id as string);
        if (linked.user !== null) {
          authUserExists = true;
          emailConfirmed = linked.user.email_confirmed_at !== null;
        }
      }
    }

    const candidate: InviteCandidate = {
      profileId: profile.id as string,
      fullName: profile.full_name as string,
      email: (profile.email as string | null) ?? null,
      isActive: profile.is_active === true,
      authUserExists,
      emailConfirmed,
    };

    const action = decideInvite(candidate);

    if (action.kind === 'skip') {
      results.push({ profileId: candidate.profileId, status: 'skipped', message: action.reason });
      continue;
    }

    try {
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        candidate.email as string,
        {
          redirectTo: `${SITE_URL}/auth/set-password`,
          data: { full_name: candidate.fullName },
        },
      );

      if (inviteError !== null) throw new Error(inviteError.message);

      await admin
        .from('profiles')
        .update({ invited_at: new Date().toISOString(), invited_by: me.id })
        .eq('id', candidate.profileId);

      results.push({
        profileId: candidate.profileId,
        status: action.kind === 'resend' ? 'resent' : 'invited',
        message: describeAction(action, candidate.fullName),
      });
    } catch (error) {
      results.push({
        profileId: candidate.profileId,
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not send the invitation.',
      });
    }

    await sleep(DELAY_MS);
  }

  // Profiles the caller asked for but could not be read at all.
  for (const id of parsed.profileIds) {
    if (!results.some((result) => result.profileId === id)) {
      results.push({ profileId: id, status: 'error', message: 'Profile not found.' });
    }
  }

  return json({ results });
});
