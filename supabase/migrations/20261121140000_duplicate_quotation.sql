-- =============================================================================
-- EZQUOTE Japan · Requote with current rates, and a current-rates preview
-- =============================================================================

-- The history list is always sorted newest first, often filtered by status.
create index if not exists quotations_created_at_idx on public.quotations (created_at desc);
create index if not exists quotations_status_created_idx
  on public.quotations (status, created_at desc);

-- -----------------------------------------------------------------------------
-- preview_current_snapshot
--
-- The "compare with current rates" panel needs a snapshot built the same way a
-- real quotation's is. Rebuilding that in TypeScript would duplicate the rules
-- about published-only, unexpired and latest-effective rows, and the two copies
-- would drift. Calling the same SQL keeps one definition.
--
-- SECURITY DEFINER on purpose: app.build_rate_snapshot stays unreachable to the
-- API roles, and this wrapper does the authorising itself. Making it INVOKER
-- would mean granting execute on the snapshot builder to every signed-in user,
-- which is a wider door than this one read needs.
-- -----------------------------------------------------------------------------
create function public.preview_current_snapshot()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_active_user() then
    raise exception 'Sign in to preview current rates.' using errcode = '42501';
  end if;
  return app.build_rate_snapshot(now());
end;
$$;

revoke all on function public.preview_current_snapshot() from public, anon;
grant execute on function public.preview_current_snapshot() to authenticated;

-- -----------------------------------------------------------------------------
-- duplicate_quotation
--
-- SECURITY INVOKER, so the caller must already be able to see the source under
-- RLS. The new row belongs to whoever called it — a supervisor requoting a team
-- member's quote owns the copy — because the insert trigger stamps agent_id
-- from the caller's profile.
--
-- The insert also builds a FRESH snapshot, which is the whole point: a requote
-- is priced at today's rates while the original keeps its own.
-- -----------------------------------------------------------------------------
create function public.duplicate_quotation(p_quotation_id uuid)
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

  -- -- services -------------------------------------------------------------
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
