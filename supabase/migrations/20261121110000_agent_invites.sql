-- =============================================================================
-- EZQUOTE Japan · Agent invitations and login status
--
-- data_issues stay computed in the app, not here. The rules (link ownership
-- across agents, shortener slug heuristics, URL parsing) already live in
-- src/domain/agents/validation.ts and are shared with the seed generator.
-- Re-implementing them in PL/pgSQL would recreate exactly the divergence that
-- shared module exists to prevent, so there is no refresh_data_issues().
-- =============================================================================

alter table public.profiles
  add column invited_at timestamptz,
  add column invited_by uuid references public.profiles (id) on delete set null;

comment on column public.profiles.invited_at is
  'When an invitation email was last sent to this profile.';

create index profiles_invited_at_idx on public.profiles (invited_at);

-- -----------------------------------------------------------------------------
-- agent_login_status: joins profiles to auth.users so managers can see who has
-- actually signed in.
--
-- SECURITY DEFINER because auth.users is not readable by app roles, so the
-- manager check is made explicitly rather than left to RLS.
-- -----------------------------------------------------------------------------
create function public.agent_login_status()
returns table (
  profile_id uuid,
  invited_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_manager() then
    raise exception 'Only managers can read agent login status.' using errcode = '42501';
  end if;

  return query
  select p.id, p.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.user_id;
end;
$$;

revoke all on function public.agent_login_status() from public, anon;
grant execute on function public.agent_login_status() to authenticated;
