-- =============================================================================
-- EZQUOTE Japan · Cities covered by a quotation (FR-001)
--
-- A Japan package is sold by the cities it covers: "Tokyo + Osaka" is a
-- different product from "Tokyo only", and it decides which tours, transfers
-- and hotels are even relevant. The quotation had no record of that, so the
-- builder could offer an Osaka hotel on a Tokyo-only trip.
-- =============================================================================

create table public.quotation_cities (
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  city_id      uuid not null references public.cities (id) on delete restrict,
  created_at   timestamptz not null default now(),
  primary key (quotation_id, city_id)
);

-- The primary key already indexes quotation_id first; this is for the other
-- direction, so "is this city still used?" does not scan the table.
create index quotation_cities_city_idx on public.quotation_cities (city_id);

-- -----------------------------------------------------------------------------
-- Privileges and RLS, matching quotation_hotels exactly.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.quotation_cities to authenticated;
revoke all on public.quotation_cities from anon;
revoke truncate, references, trigger on public.quotation_cities from authenticated;

alter table public.quotation_cities enable row level security;

create policy "Read quotation_cities" on public.quotation_cities
  for select to authenticated
  using (app.can_view_quotation(quotation_id));

create policy "Editors insert quotation_cities" on public.quotation_cities
  for insert to authenticated
  with check (app.can_edit_quotation(quotation_id));

create policy "Editors update quotation_cities" on public.quotation_cities
  for update to authenticated
  using (app.can_edit_quotation(quotation_id))
  with check (app.can_edit_quotation(quotation_id));

create policy "Editors delete quotation_cities" on public.quotation_cities
  for delete to authenticated
  using (app.can_edit_quotation(quotation_id));

-- -----------------------------------------------------------------------------
-- duplicate_quotation: carry the cities across.
--
-- Unchanged from 20261121140000 apart from the quotation_cities insert. Cities
-- are reference data, not rates, so every one of them copies: there is no
-- "no longer on sale" case to report.
-- -----------------------------------------------------------------------------
create or replace function public.duplicate_quotation(p_quotation_id uuid)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_src      public.quotations%rowtype;
  v_new_id   uuid;
  v_new_ref  text;
  v_snapshot jsonb;
  v_skipped_services text[];
  v_skipped_addons   text[];
begin
  select * into v_src from public.quotations q where q.id = p_quotation_id;
  if not found then
    raise exception 'That quotation was not found, or you cannot see it.' using errcode = 'P0001';
  end if;

  insert into public.quotations (
    reference_no, agent_id, package_title, season_label, client_name, travel_date,
    hotel_category, duration_mode, duration_days, pax_adults, pax_children,
    output_categories, airfare_php, package_markup_type, package_markup_value
  )
  values (
    '',               -- replaced by the trigger with JPN-YYYY-NNNNNN
    v_src.agent_id,   -- replaced by the trigger with the caller's profile
    v_src.package_title, v_src.season_label, v_src.client_name, v_src.travel_date,
    v_src.hotel_category, v_src.duration_mode, v_src.duration_days,
    v_src.pax_adults, v_src.pax_children, v_src.output_categories,
    v_src.airfare_php, v_src.package_markup_type, v_src.package_markup_value
  )
  returning id, reference_no, snapshot into v_new_id, v_new_ref, v_snapshot;

  -- -- cities -----------------------------------------------------------------
  insert into public.quotation_cities (quotation_id, city_id)
  select v_new_id, c.city_id
  from public.quotation_cities c
  where c.quotation_id = p_quotation_id;

  -- -- services ---------------------------------------------------------------
  insert into public.quotation_services (quotation_id, service_id, day_number, sort_order)
  select v_new_id, qs.service_id, qs.day_number, qs.sort_order
  from public.quotation_services qs
  where qs.quotation_id = p_quotation_id
    and exists (
      select 1 from jsonb_array_elements(v_snapshot -> 'services') s
      where (s ->> 'serviceId')::uuid = qs.service_id
    );

  select coalesce(array_agg(sv.name order by sv.name), '{}')
    into v_skipped_services
  from public.quotation_services qs
  join public.services sv on sv.id = qs.service_id
  where qs.quotation_id = p_quotation_id
    and not exists (
      select 1 from jsonb_array_elements(v_snapshot -> 'services') s
      where (s ->> 'serviceId')::uuid = qs.service_id
    );

  -- -- add-ons ---------------------------------------------------------------
  insert into public.quotation_service_addons (quotation_service_id, addon_id)
  select nqs.id, osa.addon_id
  from public.quotation_service_addons osa
  join public.quotation_services oqs on oqs.id = osa.quotation_service_id
  join public.quotation_services nqs
    on nqs.quotation_id = v_new_id and nqs.service_id = oqs.service_id
  where oqs.quotation_id = p_quotation_id
    and exists (
      select 1
      from jsonb_array_elements(v_snapshot -> 'services') s,
           jsonb_array_elements(s -> 'addons') a
      where (s ->> 'serviceId')::uuid = oqs.service_id
        and (a ->> 'id')::uuid = osa.addon_id
    );

  select coalesce(array_agg(distinct ra.name), '{}')
    into v_skipped_addons
  from public.quotation_service_addons osa
  join public.quotation_services oqs on oqs.id = osa.quotation_service_id
  join public.service_rate_addons ra on ra.id = osa.addon_id
  where oqs.quotation_id = p_quotation_id
    and not exists (
      select 1
      from jsonb_array_elements(v_snapshot -> 'services') s,
           jsonb_array_elements(s -> 'addons') a
      where (s ->> 'serviceId')::uuid = oqs.service_id
        and (a ->> 'id')::uuid = osa.addon_id
    );

  -- -- hotels ----------------------------------------------------------------
  insert into public.quotation_hotels (quotation_id, hotel_id, custom_name, sort_order)
  select v_new_id, h.hotel_id, h.custom_name, h.sort_order
  from public.quotation_hotels h
  where h.quotation_id = p_quotation_id;

  -- -- Change Rate entries ---------------------------------------------------
  -- Only what still stands: a reversal and the entry it cancelled both drop
  -- out, and what remains is netted so the copy starts from one clean figure
  -- per category, kind and currency rather than replaying the whole history.
  insert into public.quotation_adjustments
    (quotation_id, pax_category, kind, amount, currency, reason)
  select
    v_new_id,
    a.pax_category,
    a.kind,
    sum(a.amount),
    a.currency,
    'Copied from ' || v_src.reference_no || ': ' || string_agg(distinct a.reason, '; ')
  from public.quotation_adjustments a
  where a.quotation_id = p_quotation_id
    and a.reverses_id is null
    and not exists (
      select 1 from public.quotation_adjustments r where r.reverses_id = a.id
    )
  group by a.pax_category, a.kind, a.currency
  having sum(a.amount) <> 0;

  return jsonb_build_object(
    'id', v_new_id,
    'referenceNo', v_new_ref,
    'skippedServices', to_jsonb(v_skipped_services),
    'skippedAddons', to_jsonb(v_skipped_addons)
  );
end;
$$;

revoke all on function public.duplicate_quotation(uuid) from public, anon;
grant execute on function public.duplicate_quotation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- set_quotation_cities
--
-- SECURITY INVOKER, so RLS decides. As with set_quotation_services, the
-- permission check is explicit: under RLS a delete the caller may not perform
-- removes nothing and reports success, which would look like a saved change.
-- -----------------------------------------------------------------------------
create function public.set_quotation_cities(p_quotation_id uuid, p_city_ids uuid[])
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if not app.can_edit_quotation(p_quotation_id) then
    raise exception 'You cannot change this quotation.' using errcode = '42501';
  end if;

  delete from public.quotation_cities c
  where c.quotation_id = p_quotation_id
    and not (c.city_id = any(p_city_ids));

  insert into public.quotation_cities (quotation_id, city_id)
  select p_quotation_id, unnest(p_city_ids)
  on conflict (quotation_id, city_id) do nothing;
end;
$$;

revoke all on function public.set_quotation_cities(uuid, uuid[]) from public, anon;
grant execute on function public.set_quotation_cities(uuid, uuid[]) to authenticated;
