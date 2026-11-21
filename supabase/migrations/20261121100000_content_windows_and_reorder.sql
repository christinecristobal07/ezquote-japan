-- =============================================================================
-- EZQUOTE Japan · Time-boxed content and atomic reordering
--
-- Announcements and advisories need a start and an end, and managers need to
-- move lines up and down without the list drifting out of order.
-- =============================================================================

alter table public.content_items
  add column starts_on date,
  add column ends_on date,
  add constraint content_items_window check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  );

comment on column public.content_items.starts_on is
  'First day this line may appear. Null means no start limit.';
comment on column public.content_items.ends_on is
  'Last day this line may appear. Null means no end limit.';

-- -----------------------------------------------------------------------------
-- reorder_content: renumber one content type in a single statement.
--
-- SECURITY INVOKER, so RLS still decides who may write. An agent's UPDATE
-- matches no rows, which the row-count check turns into a clear refusal
-- instead of a silent no-op.
-- -----------------------------------------------------------------------------
create function public.reorder_content(p_type public.content_type, p_ids uuid[])
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_given    integer := coalesce(array_length(p_ids, 1), 0);
  v_distinct integer;
  v_matching integer;
  v_total    integer;
  v_updated  integer;
begin
  if v_given = 0 then
    raise exception 'Give the full list of items to reorder.' using errcode = 'P0001';
  end if;

  select count(distinct u.id) into v_distinct from unnest(p_ids) as u(id);
  if v_distinct <> v_given then
    raise exception 'The list names the same item more than once.' using errcode = 'P0001';
  end if;

  select count(*) into v_total
  from public.content_items c
  where c.content_type = p_type;

  select count(*) into v_matching
  from public.content_items c
  where c.content_type = p_type and c.id = any (p_ids);

  if v_matching <> v_given then
    raise exception 'One or more of those items are not % content.', p_type
      using errcode = 'P0001';
  end if;

  if v_total <> v_given then
    raise exception 'Reorder needs every % item: there are %, but % were given.',
      p_type, v_total, v_given using errcode = 'P0001';
  end if;

  update public.content_items c
     set sort_order = (u.ord * 10)::integer
    from unnest(p_ids) with ordinality as u(id, ord)
   where c.id = u.id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_given then
    raise exception 'You do not have permission to reorder content.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.reorder_content(public.content_type, uuid[]) from public, anon;
grant execute on function public.reorder_content(public.content_type, uuid[]) to authenticated;
