-- =============================================================================
-- EZQUOTE Japan · Stamp the author's name on Change Rate entries
--
-- An agent may read their own quotation's adjustments but not other profiles,
-- so "who made this entry" has to travel with the row. The name is written by
-- a trigger, never by the client.
-- =============================================================================

alter table public.quotation_adjustments add column created_by_name text;

comment on column public.quotation_adjustments.created_by_name is
  'Author full name, stamped by trigger so agents can see it without reading profiles.';

-- -----------------------------------------------------------------------------
-- Fires after stamp_actor (triggers run in name order, and "stamp_ac" sorts
-- before "stamp_au"), so new.created_by is already set when this reads it.
-- -----------------------------------------------------------------------------
create function app.stamp_adjustment_author()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile_id uuid := coalesce(app.current_profile_id(), new.created_by);
  v_name text;
begin
  if v_profile_id is null then
    new.created_by_name := null;
    return new;
  end if;

  select p.full_name into v_name from public.profiles p where p.id = v_profile_id;

  -- Assigned unconditionally: anything the client sent is discarded.
  new.created_by_name := v_name;
  return new;
end;
$$;

create trigger stamp_author_name before insert on public.quotation_adjustments
  for each row execute function app.stamp_adjustment_author();

revoke all on function app.stamp_adjustment_author() from public, anon;

-- -----------------------------------------------------------------------------
-- A reversal may not itself be reversed.
--
-- Reversing a reversal would re-apply the original amount while reading, in the
-- ledger, as another correction. The way back is a fresh entry with its own
-- reason, which leaves an honest trail.
-- -----------------------------------------------------------------------------
create or replace function app.adjustment_reversal_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.quotation_adjustments%rowtype;
begin
  if new.reverses_id is null then
    return new;
  end if;

  select * into v_target from public.quotation_adjustments where id = new.reverses_id;

  if not found then
    raise exception 'The entry being reversed was not found.' using errcode = 'P0001';
  end if;

  if v_target.reverses_id is not null then
    raise exception 'A reversal cannot itself be reversed. Add a new entry instead.'
      using errcode = 'P0001';
  end if;

  if v_target.quotation_id <> new.quotation_id
     or v_target.pax_category <> new.pax_category
     or v_target.kind <> new.kind
     or v_target.currency <> new.currency
     or v_target.amount <> -new.amount then
    raise exception 'A reversal must exactly negate the original entry.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.quotation_adjustments where reverses_id = new.reverses_id) then
    raise exception 'This entry has already been reversed.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
