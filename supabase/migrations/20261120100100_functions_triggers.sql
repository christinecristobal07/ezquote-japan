-- =============================================================================
-- EZQUOTE Japan · 2/3 · Functions and triggers
-- Role helpers, rate snapshot, immutability guards, auth linking, audit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- -----------------------------------------------------------------------------
create function app.current_profile_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p where p.user_id = auth.uid() and p.is_active;
$$;

create function app.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.is_active;
$$;

create function app.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(app.current_app_role() = any (roles), false);
$$;

create function app.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.current_profile_id() is not null;
$$;

-- Super Admin, Product Development and Admin manage rates, content and agents.
create function app.is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.has_role('super_admin', 'product_development', 'admin');
$$;

create function app.can_view_agent_quotes(p_agent_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    app.is_manager()
    or p_agent_id = app.current_profile_id()
    or (
      app.has_role('sales_supervisor')
      and exists (
        select 1 from public.profiles p
        where p.id = p_agent_id and p.supervisor_id = app.current_profile_id()
      )
    );
$$;

create function app.can_view_quotation(p_quotation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quotations q
    where q.id = p_quotation_id and app.can_view_agent_quotes(q.agent_id)
  );
$$;

-- Owners edit their own quotations; managers may edit any.
create function app.can_edit_quotation(p_quotation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quotations q
    where q.id = p_quotation_id
      and (q.agent_id = app.current_profile_id() or app.is_manager())
  );
$$;

-- -----------------------------------------------------------------------------
-- Rate snapshot: everything the rate engine needs, frozen at one instant.
-- Only published, unexpired rate versions are included (FR-018).
-- -----------------------------------------------------------------------------
create function app.build_rate_snapshot(p_at timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today_ph          date := (p_at at time zone 'Asia/Manila')::date;
  v_fx                jsonb;
  v_category_markups  jsonb;
  v_service_markups   jsonb;
  v_categories        jsonb;
  v_services          jsonb;
begin
  select jsonb_object_agg(f.currency, f.php_per_unit)
    into v_fx
  from (
    select distinct on (currency) currency, php_per_unit
    from public.fx_rates
    where effective_from <= p_at
    order by currency, effective_from desc, created_at desc
  ) f;

  if v_fx is null or not v_fx ? 'JPY' then
    raise exception 'No JPY exchange rate is effective. Ask Product Development to set one.'
      using errcode = 'P0001';
  end if;
  v_fx := v_fx || '{"PHP": 1}'::jsonb;

  select jsonb_object_agg(m.pax_category, jsonb_build_object('type', m.markup_type, 'value', m.value))
    into v_category_markups
  from (
    select distinct on (pax_category) pax_category, markup_type, value
    from public.category_markups
    where effective_from <= p_at
    order by pax_category, effective_from desc, created_at desc
  ) m;

  if coalesce((select count(*) from jsonb_object_keys(v_category_markups)), 0)
     < (select count(*) from public.pax_categories) then
    raise exception 'A markup is missing for one or more pax categories.'
      using errcode = 'P0001';
  end if;

  select jsonb_object_agg(m.service_type, jsonb_build_object('type', m.markup_type, 'value', m.value))
    into v_service_markups
  from (
    select distinct on (service_type) service_type, markup_type, value
    from public.service_markups
    where effective_from <= p_at
    order by service_type, effective_from desc, created_at desc
  ) m;

  if v_service_markups is null or not (v_service_markups ? 'tour' and v_service_markups ? 'transfer') then
    raise exception 'Tour and transfer markups must both be set.'
      using errcode = 'P0001';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'code', c.code, 'label', c.label, 'outputLabel', c.output_label,
             'hotelDivisor', c.hotel_divisor, 'hotelMultiplier', c.hotel_multiplier,
             'hasBed', c.has_bed
           ) order by c.sort_order)
    into v_categories
  from public.pax_categories c;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'serviceId', s.id,
             'code', s.code,
             'serviceType', s.service_type,
             'name', s.name,
             'consumesDay', s.consumes_day,
             'addsNight', s.adds_night,
             'transferDirection', s.transfer_direction,
             'rateVersionId', v.id,
             'currency', v.currency,
             'pricingBasis', v.pricing_basis,
             'validUntil', v.valid_until,
             'childMinAge', v.child_min_age,
             'childMaxAge', v.child_max_age,
             'tiers', (
               select coalesce(jsonb_agg(
                        jsonb_build_object('paxType', t.pax_type, 'minPax', t.min_pax,
                                           'maxPax', t.max_pax, 'amount', t.amount)
                        order by t.pax_type, t.min_pax), '[]'::jsonb)
               from public.service_rate_tiers t
               where t.rate_version_id = v.id
             ),
             'addons', (
               select coalesce(jsonb_agg(
                        jsonb_build_object('id', a.id, 'name', a.name, 'amount', a.amount,
                                           'defaultSelected', a.default_selected)
                        order by a.sort_order, a.name), '[]'::jsonb)
               from public.service_rate_addons a
               where a.rate_version_id = v.id
             )
           ) order by s.service_type, s.sort_order, s.name), '[]'::jsonb)
    into v_services
  from public.services s
  join lateral (
    select rv.*
    from public.service_rate_versions rv
    where rv.service_id = s.id
      and rv.status = 'published'
      and rv.effective_from <= p_at
      and (rv.valid_until is null or rv.valid_until >= v_today_ph)
    order by rv.effective_from desc, rv.published_at desc nulls last
    limit 1
  ) v on true
  where s.is_active;

  return jsonb_build_object(
    'asOf', p_at,
    'fx', v_fx,
    'categoryMarkups', v_category_markups,
    'serviceMarkups', v_service_markups,
    'categories', v_categories,
    'services', v_services
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
create function app.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function app.prevent_change()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed.', tg_table_name, lower(tg_op)
    using errcode = 'P0001';
end;
$$;

-- Stamps the acting user on a column named by TG_ARGV[0]. Service-role/seed
-- inserts (no auth.uid()) keep the value they supply.
create function app.stamp_actor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile_id uuid := app.current_profile_id();
begin
  if auth.uid() is not null then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], v_profile_id));
  end if;
  return new;
end;
$$;

create function app.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pk_column text := coalesce(tg_argv[0], 'id');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by, actor_user_id)
  values (
    tg_table_name,
    coalesce(v_new, v_old) ->> v_pk_column,
    tg_op,
    v_old,
    v_new,
    app.current_profile_id(),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles: role guard
-- -----------------------------------------------------------------------------
create function app.guard_profile_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Seed/service-role operations are not restricted.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Profiles cannot be deleted; deactivate them instead.' using errcode = 'P0001';
  end if;

  if (tg_op = 'INSERT' and new.role = 'super_admin')
     or (tg_op = 'UPDATE' and (new.role = 'super_admin') <> (old.role = 'super_admin')) then
    if not app.has_role('super_admin') then
      raise exception 'Only a Super Admin can grant or remove the Super Admin role.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.id = app.current_profile_id()
     and (new.role <> old.role or new.is_active <> old.is_active) then
    raise exception 'You cannot change your own role or deactivate yourself.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'The login link of a profile cannot be changed from the app.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate versions: published rates are immutable (snapshot integrity)
-- -----------------------------------------------------------------------------
create function app.guard_rate_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft rate versions can be deleted.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(app.current_profile_id(), new.created_by);
    if new.status = 'published' then
      new.published_at := now();
      new.published_by := coalesce(app.current_profile_id(), new.published_by);
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status = 'inactive' then
    raise exception 'Inactive rate versions cannot be changed.' using errcode = 'P0001';
  end if;

  if old.status = 'published' then
    if new.status <> 'inactive'
       or (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
      raise exception 'Published rates are locked. Create a new version, or set this one inactive.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- old.status = 'draft'
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if new.status = 'published' then
    if not exists (select 1 from public.service_rate_tiers t where t.rate_version_id = new.id) then
      raise exception 'Add at least one group-size tier before publishing.' using errcode = 'P0001';
    end if;
    new.published_at := now();
    new.published_by := coalesce(app.current_profile_id(), new.published_by);
  end if;
  return new;
end;
$$;

-- Tiers and add-ons may only change while their version is a draft.
create function app.guard_rate_version_child()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_version_id uuid := coalesce(new.rate_version_id, old.rate_version_id);
  v_status public.rate_status;
begin
  select status into v_status from public.service_rate_versions where id = v_version_id;
  if v_status is distinct from 'draft' then
    raise exception 'This rate version is % and cannot be edited. Create a new version.', v_status
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.rate_version_id <> old.rate_version_id then
    raise exception 'Rows cannot move between rate versions.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Quotations: server-built snapshot, immutable once created
-- -----------------------------------------------------------------------------
create function app.quotation_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.agent_id := app.current_profile_id();
  end if;
  new.rates_as_of := now();
  new.snapshot := app.build_rate_snapshot(new.rates_as_of);
  new.reference_no := 'JPN-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-'
                      || lpad(nextval('public.quotation_ref_seq')::text, 6, '0');
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create function app.quotation_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.agent_id <> old.agent_id
     or new.reference_no <> old.reference_no
     or new.rates_as_of <> old.rates_as_of
     or new.snapshot <> old.snapshot
     or new.created_at <> old.created_at then
    raise exception 'Agent, reference number and rate snapshot of a quotation cannot be changed.'
      using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- A quotation can only use services and add-ons that exist in its own snapshot.
create function app.quotation_service_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.quotations q, jsonb_array_elements(q.snapshot -> 'services') s
    where q.id = new.quotation_id and (s ->> 'serviceId')::uuid = new.service_id
  ) then
    raise exception 'This service was not available when the quotation was created.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function app.quotation_addon_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.quotation_services qs
    join public.quotations q on q.id = qs.quotation_id
    cross join lateral jsonb_array_elements(q.snapshot -> 'services') s
    cross join lateral jsonb_array_elements(s -> 'addons') a
    where qs.id = new.quotation_service_id
      and (s ->> 'serviceId')::uuid = qs.service_id
      and (a ->> 'id')::uuid = new.addon_id
  ) then
    raise exception 'This add-on does not belong to the selected service rate.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function app.adjustment_reversal_check()
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

-- -----------------------------------------------------------------------------
-- Auth: link a new login to its imported profile by email
-- Unknown emails get an inactive Sales Agent profile for a manager to approve.
-- -----------------------------------------------------------------------------
create function app.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
begin
  if v_email is null or v_email = '' then
    return new;
  end if;

  update public.profiles
     set user_id = new.id,
         data_issues = array_remove(data_issues, 'needs_email'::public.data_issue)
   where email = v_email and user_id is null;

  if not found and not exists (select 1 from public.profiles where user_id = new.id) then
    insert into public.profiles (user_id, full_name, email, role, is_active)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(v_email, '@', 1)),
      v_email,
      'sales_agent',
      false
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Attach triggers
-- -----------------------------------------------------------------------------
-- updated_at
create trigger set_updated_at before update on public.profiles            for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.agent_survey_links  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.cities              for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.operators           for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.hotels              for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.booking_sites       for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.services            for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.content_items       for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.app_settings        for each row execute function app.set_updated_at();

-- append-only tables
create trigger prevent_change before update or delete on public.fx_rates              for each row execute function app.prevent_change();
create trigger prevent_change before update or delete on public.category_markups      for each row execute function app.prevent_change();
create trigger prevent_change before update or delete on public.service_markups       for each row execute function app.prevent_change();
create trigger prevent_change before update or delete on public.quotation_adjustments for each row execute function app.prevent_change();
create trigger prevent_change before update or delete on public.quotation_outputs     for each row execute function app.prevent_change();
create trigger prevent_change before update or delete on public.audit_log             for each row execute function app.prevent_change();
create trigger prevent_change before update or delete on public.pax_categories        for each row execute function app.prevent_change();

-- actor stamps
create trigger stamp_actor before insert on public.fx_rates              for each row execute function app.stamp_actor('created_by');
create trigger stamp_actor before insert on public.category_markups      for each row execute function app.stamp_actor('created_by');
create trigger stamp_actor before insert on public.service_markups       for each row execute function app.stamp_actor('created_by');
create trigger stamp_actor before insert on public.quotation_adjustments for each row execute function app.stamp_actor('created_by');
create trigger stamp_actor before insert on public.quotation_outputs     for each row execute function app.stamp_actor('generated_by');

-- guards
create trigger guard_profile before insert or update or delete on public.profiles
  for each row execute function app.guard_profile_change();
create trigger guard_rate_version before insert or update or delete on public.service_rate_versions
  for each row execute function app.guard_rate_version();
create trigger guard_rate_version_child before insert or update or delete on public.service_rate_tiers
  for each row execute function app.guard_rate_version_child();
create trigger guard_rate_version_child before insert or update or delete on public.service_rate_addons
  for each row execute function app.guard_rate_version_child();
create trigger quotation_before_insert before insert on public.quotations
  for each row execute function app.quotation_before_insert();
create trigger quotation_before_update before update on public.quotations
  for each row execute function app.quotation_before_update();
create trigger quotation_service_check before insert or update on public.quotation_services
  for each row execute function app.quotation_service_check();
create trigger quotation_addon_check before insert or update on public.quotation_service_addons
  for each row execute function app.quotation_addon_check();
create trigger adjustment_reversal_check before insert on public.quotation_adjustments
  for each row execute function app.adjustment_reversal_check();

-- audit (BRD: every important change is logged)
create trigger audit after insert or update or delete on public.profiles              for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.agent_survey_links    for each row execute function app.audit_row('profile_id');
create trigger audit after insert or update or delete on public.cities                for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.operators             for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.hotels                for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.booking_sites         for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.services              for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.service_rate_versions for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.service_rate_tiers    for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.service_rate_addons   for each row execute function app.audit_row('id');
create trigger audit after insert on public.fx_rates                                  for each row execute function app.audit_row('id');
create trigger audit after insert on public.category_markups                          for each row execute function app.audit_row('id');
create trigger audit after insert on public.service_markups                           for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.content_items         for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.app_settings          for each row execute function app.audit_row('key');
create trigger audit after insert on public.quotation_adjustments                     for each row execute function app.audit_row('id');

-- Helper functions are callable by signed-in users only (used inside RLS policies).
revoke all on all functions in schema app from public;
grant execute on function
  app.current_profile_id(),
  app.current_app_role(),
  app.has_role(public.app_role[]),
  app.is_active_user(),
  app.is_manager(),
  app.can_view_agent_quotes(uuid),
  app.can_view_quotation(uuid),
  app.can_edit_quotation(uuid)
to authenticated;
