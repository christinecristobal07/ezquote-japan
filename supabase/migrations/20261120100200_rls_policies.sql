-- =============================================================================
-- EZQUOTE Japan · 3/3 · Privileges and Row Level Security
--   Managers           = Super Admin, Product Development, Admin
--   Sales Supervisor   = own quotes + read their team's quotes
--   Sales Agent        = own quotes only; read-only reference data
--   anon (signed out)  = nothing
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table privileges. RLS does not cover TRUNCATE, so it is revoked explicitly.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Append-only tables: no UPDATE/DELETE for app users at the privilege level too.
revoke update, delete on
  public.fx_rates, public.category_markups, public.service_markups,
  public.quotation_adjustments, public.quotation_outputs, public.audit_log, public.pax_categories
from authenticated;
revoke insert on public.audit_log, public.pax_categories from authenticated;

-- The reference sequence is only used by the SECURITY DEFINER insert trigger.
revoke all on sequence public.quotation_ref_seq from authenticated;

-- Future tables must opt in explicitly.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table
-- -----------------------------------------------------------------------------
alter table public.profiles                  enable row level security;
alter table public.agent_survey_links        enable row level security;
alter table public.cities                    enable row level security;
alter table public.operators                 enable row level security;
alter table public.pax_categories            enable row level security;
alter table public.hotels                    enable row level security;
alter table public.booking_sites             enable row level security;
alter table public.services                  enable row level security;
alter table public.service_rate_versions     enable row level security;
alter table public.service_rate_tiers        enable row level security;
alter table public.service_rate_addons       enable row level security;
alter table public.fx_rates                  enable row level security;
alter table public.category_markups          enable row level security;
alter table public.service_markups           enable row level security;
alter table public.content_items             enable row level security;
alter table public.app_settings              enable row level security;
alter table public.quotations                enable row level security;
alter table public.quotation_services        enable row level security;
alter table public.quotation_service_addons  enable row level security;
alter table public.quotation_hotels          enable row level security;
alter table public.quotation_adjustments     enable row level security;
alter table public.quotation_outputs         enable row level security;
alter table public.audit_log                 enable row level security;

-- -----------------------------------------------------------------------------
-- Reference data: every active user reads; managers write.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'cities', 'operators', 'hotels', 'booking_sites', 'services', 'content_items', 'app_settings'
  ] loop
    execute format(
      'create policy "Active users read %1$s" on public.%1$I for select to authenticated
         using ((select app.is_active_user()))', t);
    execute format(
      'create policy "Managers insert %1$s" on public.%1$I for insert to authenticated
         with check ((select app.is_manager()))', t);
    execute format(
      'create policy "Managers update %1$s" on public.%1$I for update to authenticated
         using ((select app.is_manager())) with check ((select app.is_manager()))', t);
    execute format(
      'create policy "Managers delete %1$s" on public.%1$I for delete to authenticated
         using ((select app.is_manager()))', t);
  end loop;
end;
$$;

create policy "Active users read pax_categories" on public.pax_categories
  for select to authenticated using ((select app.is_active_user()));

-- FX and markups: append-only (new row = new rate).
do $$
declare
  t text;
begin
  foreach t in array array['fx_rates', 'category_markups', 'service_markups'] loop
    execute format(
      'create policy "Active users read %1$s" on public.%1$I for select to authenticated
         using ((select app.is_active_user()))', t);
    execute format(
      'create policy "Managers add %1$s" on public.%1$I for insert to authenticated
         with check ((select app.is_manager()))', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rates: agents only ever see published/inactive versions (never drafts).
-- -----------------------------------------------------------------------------
create policy "Read rate versions" on public.service_rate_versions
  for select to authenticated
  using ((select app.is_manager()) or (status <> 'draft' and (select app.is_active_user())));
create policy "Managers insert rate versions" on public.service_rate_versions
  for insert to authenticated with check ((select app.is_manager()));
create policy "Managers update rate versions" on public.service_rate_versions
  for update to authenticated
  using ((select app.is_manager())) with check ((select app.is_manager()));
create policy "Managers delete rate versions" on public.service_rate_versions
  for delete to authenticated using ((select app.is_manager()));

do $$
declare
  t text;
begin
  foreach t in array array['service_rate_tiers', 'service_rate_addons'] loop
    execute format(
      'create policy "Read %1$s" on public.%1$I for select to authenticated
         using (exists (select 1 from public.service_rate_versions v where v.id = rate_version_id))', t);
    execute format(
      'create policy "Managers insert %1$s" on public.%1$I for insert to authenticated
         with check ((select app.is_manager()))', t);
    execute format(
      'create policy "Managers update %1$s" on public.%1$I for update to authenticated
         using ((select app.is_manager())) with check ((select app.is_manager()))', t);
    execute format(
      'create policy "Managers delete %1$s" on public.%1$I for delete to authenticated
         using ((select app.is_manager()))', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles and survey links
-- -----------------------------------------------------------------------------
create policy "Read own, team or all profiles" on public.profiles
  for select to authenticated
  using (
    id = (select app.current_profile_id())
    or (select app.is_manager())
    or ((select app.has_role('sales_supervisor')) and supervisor_id = (select app.current_profile_id()))
  );
create policy "Managers insert profiles" on public.profiles
  for insert to authenticated with check ((select app.is_manager()));
create policy "Managers update profiles" on public.profiles
  for update to authenticated
  using ((select app.is_manager())) with check ((select app.is_manager()));
-- No delete policy: profiles are deactivated, never deleted.

-- An agent can read only their own links; no one but managers can see others'.
create policy "Read own survey links" on public.agent_survey_links
  for select to authenticated
  using (profile_id = (select app.current_profile_id()) or (select app.is_manager()));
create policy "Managers insert survey links" on public.agent_survey_links
  for insert to authenticated with check ((select app.is_manager()));
create policy "Managers update survey links" on public.agent_survey_links
  for update to authenticated
  using ((select app.is_manager())) with check ((select app.is_manager()));
create policy "Managers delete survey links" on public.agent_survey_links
  for delete to authenticated using ((select app.is_manager()));

-- -----------------------------------------------------------------------------
-- Quotations
-- -----------------------------------------------------------------------------
create policy "Read visible quotations" on public.quotations
  for select to authenticated using ((select app.can_view_agent_quotes(agent_id)));
create policy "Active users create own quotations" on public.quotations
  for insert to authenticated
  with check ((select app.is_active_user()) and agent_id = (select app.current_profile_id()));
create policy "Owners and managers update quotations" on public.quotations
  for update to authenticated
  using (agent_id = (select app.current_profile_id()) or (select app.is_manager()))
  with check (agent_id = (select app.current_profile_id()) or (select app.is_manager()));
-- No delete policy: quotations are archived (status = 'archived').

do $$
declare
  t text;
begin
  foreach t in array array['quotation_services', 'quotation_hotels'] loop
    execute format(
      'create policy "Read %1$s" on public.%1$I for select to authenticated
         using (app.can_view_quotation(quotation_id))', t);
    execute format(
      'create policy "Editors insert %1$s" on public.%1$I for insert to authenticated
         with check (app.can_edit_quotation(quotation_id))', t);
    execute format(
      'create policy "Editors update %1$s" on public.%1$I for update to authenticated
         using (app.can_edit_quotation(quotation_id)) with check (app.can_edit_quotation(quotation_id))', t);
    execute format(
      'create policy "Editors delete %1$s" on public.%1$I for delete to authenticated
         using (app.can_edit_quotation(quotation_id))', t);
  end loop;
end;
$$;

create policy "Read quotation service add-ons" on public.quotation_service_addons
  for select to authenticated
  using (exists (
    select 1 from public.quotation_services qs
    where qs.id = quotation_service_id and app.can_view_quotation(qs.quotation_id)
  ));
create policy "Editors insert quotation service add-ons" on public.quotation_service_addons
  for insert to authenticated
  with check (exists (
    select 1 from public.quotation_services qs
    where qs.id = quotation_service_id and app.can_edit_quotation(qs.quotation_id)
  ));
create policy "Editors delete quotation service add-ons" on public.quotation_service_addons
  for delete to authenticated
  using (exists (
    select 1 from public.quotation_services qs
    where qs.id = quotation_service_id and app.can_edit_quotation(qs.quotation_id)
  ));

-- Change Rate entries and generated outputs: append-only.
do $$
declare
  t text;
begin
  foreach t in array array['quotation_adjustments', 'quotation_outputs'] loop
    execute format(
      'create policy "Read %1$s" on public.%1$I for select to authenticated
         using (app.can_view_quotation(quotation_id))', t);
    execute format(
      'create policy "Editors add %1$s" on public.%1$I for insert to authenticated
         with check (app.can_edit_quotation(quotation_id))', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Audit log: managers read; rows are written only by triggers.
-- -----------------------------------------------------------------------------
create policy "Managers read audit log" on public.audit_log
  for select to authenticated using ((select app.is_manager()));
