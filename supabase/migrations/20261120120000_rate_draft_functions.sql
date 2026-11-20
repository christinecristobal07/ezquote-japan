-- =============================================================================
-- EZQUOTE Japan · Draft helpers for rate management
--
-- SECURITY INVOKER on purpose: these run with the caller's privileges, so RLS
-- still decides who may write. An agent calling them is refused by the same
-- policies that guard the tables.
-- =============================================================================

-- One draft per service keeps "create new version" unambiguous.
create unique index if not exists service_rate_versions_one_draft
  on public.service_rate_versions (service_id)
  where status = 'draft';

-- -----------------------------------------------------------------------------
-- create_rate_draft: start a new draft, optionally copied from an existing
-- version so a price change begins from the current numbers.
-- -----------------------------------------------------------------------------
create function public.create_rate_draft(p_service_id uuid, p_from_version_id uuid default null)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_src public.service_rate_versions%rowtype;
  v_new_id uuid;
begin
  if not exists (select 1 from public.services s where s.id = p_service_id) then
    raise exception 'That service does not exist, or you cannot see it.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.service_rate_versions v
    where v.service_id = p_service_id and v.status = 'draft'
  ) then
    raise exception 'This service already has a draft. Finish or discard it first.'
      using errcode = 'P0001';
  end if;

  if p_from_version_id is not null then
    select * into v_src
    from public.service_rate_versions v
    where v.id = p_from_version_id and v.service_id = p_service_id;
    if not found then
      raise exception 'The version to copy from was not found for this service.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.service_rate_versions (
    service_id, currency, pricing_basis, status, valid_until, child_min_age, child_max_age, notes
  )
  values (
    p_service_id,
    coalesce(v_src.currency, 'JPY'),
    coalesce(v_src.pricing_basis, 'per_pax'),
    'draft',
    v_src.valid_until,
    v_src.child_min_age,
    v_src.child_max_age,
    v_src.notes
  )
  returning id into v_new_id;

  if p_from_version_id is not null then
    insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)
    select v_new_id, t.pax_type, t.min_pax, t.max_pax, t.amount
    from public.service_rate_tiers t
    where t.rate_version_id = p_from_version_id;

    insert into public.service_rate_addons (rate_version_id, name, amount, default_selected, sort_order)
    select v_new_id, a.name, a.amount, a.default_selected, a.sort_order
    from public.service_rate_addons a
    where a.rate_version_id = p_from_version_id;
  end if;

  return v_new_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- save_rate_draft: replace a draft's fields, tiers and add-ons in one go.
-- A function body is a single transaction, so a rejected tier (an overlap, say)
-- rolls the whole save back and the previous tiers survive intact.
-- -----------------------------------------------------------------------------
create function public.save_rate_draft(
  p_version_id uuid,
  p_fields jsonb default '{}'::jsonb,
  p_tiers jsonb default '[]'::jsonb,
  p_addons jsonb default '[]'::jsonb
)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_status public.rate_status;
begin
  select v.status into v_status
  from public.service_rate_versions v
  where v.id = p_version_id;

  if v_status is null then
    raise exception 'That rate version was not found, or you cannot see it.' using errcode = 'P0001';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be edited. This version is %.', v_status using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
    raise exception 'Add at least one group-size tier before saving.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tiers)
      as t(pax_type text, min_pax integer, max_pax integer, amount numeric)
    where t.min_pax is null
       or t.max_pax is null
       or t.amount is null
       or t.min_pax < 1
       or t.max_pax > 60
       or t.min_pax > t.max_pax
       or t.amount < 0
       or coalesce(t.pax_type, 'adult') not in ('adult', 'child')
  ) then
    raise exception
      'Every tier needs a whole group size from 1 to 60, min no greater than max, and an amount of 0 or more.'
      using errcode = 'P0001';
  end if;

  update public.service_rate_versions v
     set effective_from = coalesce((p_fields ->> 'effective_from')::timestamptz, v.effective_from),
         currency       = coalesce((p_fields ->> 'currency')::public.currency_code, v.currency),
         valid_until    = case when p_fields ? 'valid_until'
                               then (p_fields ->> 'valid_until')::date else v.valid_until end,
         child_min_age  = case when p_fields ? 'child_min_age'
                               then (p_fields ->> 'child_min_age')::smallint else v.child_min_age end,
         child_max_age  = case when p_fields ? 'child_max_age'
                               then (p_fields ->> 'child_max_age')::smallint else v.child_max_age end,
         notes          = case when p_fields ? 'notes'
                               then p_fields ->> 'notes' else v.notes end
   where v.id = p_version_id;

  delete from public.service_rate_tiers t where t.rate_version_id = p_version_id;
  insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)
  select p_version_id, coalesce(t.pax_type, 'adult'), t.min_pax, t.max_pax, t.amount
  from jsonb_to_recordset(p_tiers)
    as t(pax_type text, min_pax integer, max_pax integer, amount numeric);

  delete from public.service_rate_addons a where a.rate_version_id = p_version_id;
  if jsonb_typeof(p_addons) = 'array' and jsonb_array_length(p_addons) > 0 then
    insert into public.service_rate_addons (rate_version_id, name, amount, default_selected, sort_order)
    select
      p_version_id,
      a.name,
      a.amount,
      coalesce(a.default_selected, false),
      coalesce(a.sort_order, a.ordinality::integer)
    from jsonb_to_recordset(p_addons)
      with ordinality
      as a(name text, amount numeric, default_selected boolean, sort_order integer, ordinality bigint);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Signed-in users only; RLS decides whether the write itself is allowed.
-- -----------------------------------------------------------------------------
revoke all on function public.create_rate_draft(uuid, uuid) from public, anon;
revoke all on function public.save_rate_draft(uuid, jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.create_rate_draft(uuid, uuid) to authenticated;
grant execute on function public.save_rate_draft(uuid, jsonb, jsonb, jsonb) to authenticated;
