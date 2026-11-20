-- =============================================================================
-- EZQUOTE Japan · Grants for the API roles
--
-- RLS only filters rows a role may already touch. Without a GRANT, PostgREST
-- answers 403 before any policy runs. Supabase's default privileges did not
-- reach the tables created by 20261120100000, so they are granted explicitly
-- here and the lockdowns from 20261120100200 are re-applied on top.
-- =============================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Anything added later must be reachable too, without another migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- -----------------------------------------------------------------------------
-- Re-apply the restrictions. Signed-out callers still get nothing.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- RLS does not cover TRUNCATE, so it stays revoked.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Append-only tables: no UPDATE/DELETE at the privilege level either.
revoke update, delete on
  public.fx_rates, public.category_markups, public.service_markups,
  public.quotation_adjustments, public.quotation_outputs, public.audit_log, public.pax_categories
from authenticated;
revoke insert on public.audit_log, public.pax_categories from authenticated;

-- Only the SECURITY DEFINER insert trigger may draw a reference number.
revoke all on sequence public.quotation_ref_seq from authenticated;
