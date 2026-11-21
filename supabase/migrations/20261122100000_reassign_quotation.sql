-- =============================================================================
-- EZQUOTE Japan · Hand a quotation over to the agent who owns the client
--
-- A supervisor building a quotation for a team member ends up owning it, and
-- `agent_id` is immutable, so the agent could not edit the quote that is
-- theirs to sell. The supervisor had to rebuild it under the agent's login,
-- or the agent worked from a quote they could not touch.
--
-- Reassigning also covers the case nobody plans for: an agent leaves, and
-- their live quotations need a new owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The guard trigger keeps agent_id immutable for ordinary writes, which is what
-- stops the browser reassigning a quotation to itself. This function is the one
-- sanctioned way through, so it sets a flag the guard recognises.
-- -----------------------------------------------------------------------------
create or replace function app.quotation_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.agent_id <> old.agent_id
     and coalesce(current_setting('app.reassigning', true), '') <> 'on' then
    raise exception 'A quotation can only be reassigned with reassign_quotation().'
      using errcode = 'P0001';
  end if;

  if new.reference_no <> old.reference_no
     or new.rates_as_of <> old.rates_as_of
     or new.snapshot <> old.snapshot
     or new.created_at <> old.created_at then
    raise exception 'Reference number and rate snapshot of a quotation cannot be changed.'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- reassign_quotation
--
-- SECURITY DEFINER, and not by preference. The UPDATE policy on quotations has
-- a WITH CHECK, so the moment agent_id stops being the caller's the new row
-- fails the policy and the update is refused -- a SECURITY INVOKER version
-- cannot hand a quotation to anybody. So this function does the whole job of
-- authorising, the same way preview_current_snapshot does:
--
--   1. an active account, or nothing;
--   2. can_view_quotation, so "cannot see it" is still enforced now that RLS
--      is not doing the filtering;
--   3. may they hand THIS one over -- a supervisor of either the old or the
--      new owner, or a manager. A plain agent cannot push their work onto
--      someone else, nor help themselves to another agent's.
--
-- The new owner must be an active profile, or the quotation lands on somebody
-- who cannot sign in.
-- -----------------------------------------------------------------------------
create function public.reassign_quotation(p_quotation_id uuid, p_agent_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me       uuid := app.current_profile_id();
  v_owner    uuid;
  v_target   public.profiles%rowtype;
  v_allowed  boolean;
begin
  if not app.is_active_user() then
    raise exception 'Sign in to reassign a quotation.' using errcode = '42501';
  end if;

  if not app.can_view_quotation(p_quotation_id) then
    raise exception 'That quotation was not found, or you cannot see it.' using errcode = 'P0001';
  end if;

  select agent_id into v_owner
  from public.quotations q
  where q.id = p_quotation_id;

  if not found then
    raise exception 'That quotation was not found, or you cannot see it.' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles p where p.id = p_agent_id;
  if not found then
    raise exception 'That agent does not exist.' using errcode = 'P0001';
  end if;
  if not v_target.is_active then
    raise exception 'That agent is deactivated, so a quotation cannot be assigned to them.'
      using errcode = 'P0001';
  end if;

  if v_owner = p_agent_id then
    -- Nothing to do, and saying so beats a silent no-op.
    raise exception 'That quotation already belongs to %.', v_target.full_name
      using errcode = 'P0001';
  end if;

  -- Deliberately NOT "or v_owner = v_me". Ownership decides whose name is on
  -- the quotation and whose figures the team reads, so moving a quote off one
  -- agent and onto another is a supervisor's call, not something an agent does
  -- quietly. A supervisor reassigning their own quote is covered by the
  -- supervisor_id branch, since the new owner reports to them.
  v_allowed :=
    app.is_manager()
    or exists (
      select 1 from public.profiles p
      where p.id in (v_owner, p_agent_id) and p.supervisor_id = v_me
    );

  if not v_allowed then
    raise exception 'You cannot reassign this quotation.' using errcode = '42501';
  end if;

  perform set_config('app.reassigning', 'on', true);
  update public.quotations set agent_id = p_agent_id where id = p_quotation_id;
  perform set_config('app.reassigning', 'off', true);

  return p_quotation_id;
end;
$$;

revoke all on function public.reassign_quotation(uuid, uuid) from public, anon;
grant execute on function public.reassign_quotation(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- The owner changing is exactly the kind of thing someone will later ask about,
-- so quotations join the audited tables.
-- -----------------------------------------------------------------------------
drop trigger if exists audit on public.quotations;
create trigger audit after insert or update or delete on public.quotations
  for each row execute function app.audit_row('id');
