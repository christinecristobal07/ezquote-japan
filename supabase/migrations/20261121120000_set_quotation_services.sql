-- =============================================================================
-- EZQUOTE Japan · Replace a quotation's selected services in one step
--
-- SECURITY INVOKER, so RLS still decides who may write. The existing
-- quotation_service_check and quotation_addon_check triggers continue to
-- enforce that only services present in the quotation's own frozen snapshot
-- can be selected.
-- =============================================================================

create function public.set_quotation_services(
  p_quotation_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Services must be given as a list.' using errcode = 'P0001';
  end if;

  -- An empty list would otherwise delete nothing and look like success to a
  -- caller who is not allowed to touch this quotation at all.
  if not app.can_edit_quotation(p_quotation_id) then
    raise exception 'You cannot change this quotation.' using errcode = '42501';
  end if;

  delete from public.quotation_service_addons a
   where a.quotation_service_id in (
     select qs.id from public.quotation_services qs where qs.quotation_id = p_quotation_id
   );

  delete from public.quotation_services qs where qs.quotation_id = p_quotation_id;

  -- WITH ORDINALITY cannot be combined with a column definition list, so the
  -- fallback position comes from row_number(); jsonb_to_recordset keeps the
  -- array order.
  insert into public.quotation_services (quotation_id, service_id, day_number, sort_order)
  select
    p_quotation_id,
    (i."serviceId")::uuid,
    i."dayNumber",
    coalesce(i."sortOrder", (row_number() over ())::integer)
  from jsonb_to_recordset(p_items)
    as i("serviceId" text, "dayNumber" smallint, "sortOrder" integer);

  insert into public.quotation_service_addons (quotation_service_id, addon_id)
  select qs.id, (a.value #>> '{}')::uuid
  from jsonb_to_recordset(p_items) as i("serviceId" text, "addonIds" jsonb)
  join public.quotation_services qs
    on qs.quotation_id = p_quotation_id
   and qs.service_id = (i."serviceId")::uuid
  cross join lateral jsonb_array_elements(coalesce(i."addonIds", '[]'::jsonb)) as a(value);
end;
$$;

revoke all on function public.set_quotation_services(uuid, jsonb) from public, anon;
grant execute on function public.set_quotation_services(uuid, jsonb) to authenticated;
