-- =============================================================================
-- EZQUOTE Japan · 1/3 · Core schema
-- Extensions, private helper schema, enums, tables, indexes, pax categories.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- Private schema for helper functions. Not exposed through the Data API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin', 'product_development', 'admin', 'sales_supervisor', 'sales_agent'
);
create type public.pax_category as enum ('quad', 'triple', 'twin', 'solo', 'child', 'sneak_in');
create type public.service_type as enum ('tour', 'transfer');
create type public.markup_type as enum ('fixed', 'percent');
create type public.currency_code as enum ('JPY', 'USD', 'PHP');
create type public.pricing_basis as enum ('per_pax', 'private_total');
create type public.transfer_direction as enum ('one_way', 'round_trip');
create type public.rate_status as enum ('draft', 'published', 'inactive');
create type public.content_type as enum (
  'inclusion', 'exclusion', 'note', 'requirement', 'remark', 'announcement',
  'availability_reminder', 'booking_disclaimer', 'personal_transactions'
);
create type public.booking_status as enum ('not_booked', 'booked', 'confirmed');
create type public.duration_mode as enum ('agent_selected', 'derived');
create type public.quotation_status as enum ('draft', 'sent', 'archived');
create type public.adjustment_kind as enum (
  'hotel', 'operator_charge', 'rate_difference', 'special_arrangement',
  'extra_transfer', 'child_adjustment', 'surcharge', 'other'
);
create type public.data_issue as enum (
  'needs_email', 'invalid_bad_link', 'invalid_great_link', 'placeholder_link'
);

-- -----------------------------------------------------------------------------
-- People
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  full_name     text not null check (full_name = btrim(full_name) and full_name <> ''),
  email         text check (
                  email is null
                  or (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
                ),
  role          public.app_role not null default 'sales_agent',
  supervisor_id uuid references public.profiles (id) on delete set null,
  is_active     boolean not null default true,
  data_issues   public.data_issue[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_not_own_supervisor check (supervisor_id is null or supervisor_id <> id)
);
create unique index profiles_email_key on public.profiles (email) where email is not null;
create index profiles_supervisor_id_idx on public.profiles (supervisor_id);

create table public.agent_survey_links (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  bad_url     text check (bad_url is null or bad_url ~ '^https://[^[:space:]]+$'),
  great_url   text check (great_url is null or great_url ~ '^https://[^[:space:]]+$'),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------
create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (btrim(name) <> ''),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.operators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (btrim(name) <> ''),
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.pax_categories (
  code              public.pax_category primary key,
  label             text not null,
  output_label      text not null,
  hotel_divisor     smallint not null check (hotel_divisor > 0),
  hotel_multiplier  smallint not null check (hotel_multiplier > 0),
  has_bed           boolean not null,
  sort_order        smallint not null
);

create table public.hotels (
  id               uuid primary key default gen_random_uuid(),
  city_id          uuid not null references public.cities (id) on delete restrict,
  name             text not null check (btrim(name) <> ''),
  star_rating      smallint not null check (star_rating between 3 and 5),
  walk_to_station  text,
  room_types       text,
  notes            text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (city_id, name)
);
create index hotels_city_star_idx on public.hotels (city_id, star_rating);

create table public.booking_sites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (btrim(name) <> ''),
  url         text not null check (url ~ '^https://[^[:space:]]+$'),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Services and versioned rates
-- -----------------------------------------------------------------------------
create table public.services (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[a-z0-9_]+$'),
  service_type        public.service_type not null,
  name                text not null check (btrim(name) <> ''),
  city_id             uuid references public.cities (id) on delete restrict,
  operator_id         uuid references public.operators (id) on delete restrict,
  description         text,
  itinerary_title     text,
  itinerary_text      text,
  inclusion_text      text,
  consumes_day        boolean not null default true,
  adds_night          boolean not null default false,
  transfer_direction  public.transfer_direction,
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint services_transfer_direction check (
    (service_type = 'transfer') = (transfer_direction is not null)
  )
);
create index services_city_id_idx on public.services (city_id);
create index services_operator_id_idx on public.services (operator_id);

create table public.service_rate_versions (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services (id) on delete restrict,
  currency        public.currency_code not null default 'JPY',
  pricing_basis   public.pricing_basis not null default 'per_pax',
  status          public.rate_status not null default 'draft',
  effective_from  timestamptz not null default now(),
  valid_until     date,
  child_min_age   smallint check (child_min_age between 0 and 17),
  child_max_age   smallint check (child_max_age between 0 and 17),
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  published_by    uuid references public.profiles (id),
  published_at    timestamptz,
  constraint service_rate_versions_child_ages check (
    child_min_age is null or child_max_age is null or child_min_age <= child_max_age
  )
);
create index service_rate_versions_lookup_idx
  on public.service_rate_versions (service_id, status, effective_from desc);

create table public.service_rate_tiers (
  id               uuid primary key default gen_random_uuid(),
  rate_version_id  uuid not null references public.service_rate_versions (id) on delete cascade,
  pax_type         text not null default 'adult' check (pax_type in ('adult', 'child')),
  min_pax          smallint not null check (min_pax between 1 and 60),
  max_pax          smallint not null check (max_pax between 1 and 60),
  amount           numeric(12, 2) not null check (amount >= 0),
  constraint service_rate_tiers_range check (min_pax <= max_pax),
  constraint service_rate_tiers_no_overlap exclude using gist (
    rate_version_id with =,
    pax_type with =,
    int4range(min_pax, max_pax, '[]') with &&
  )
);

create table public.service_rate_addons (
  id                uuid primary key default gen_random_uuid(),
  rate_version_id   uuid not null references public.service_rate_versions (id) on delete cascade,
  name              text not null check (btrim(name) <> ''),
  amount            numeric(12, 2) not null check (amount >= 0),
  default_selected  boolean not null default false,
  sort_order        integer not null default 0
);
create index service_rate_addons_version_idx on public.service_rate_addons (rate_version_id);

-- -----------------------------------------------------------------------------
-- FX and markups (append-only; the latest effective row wins)
-- -----------------------------------------------------------------------------
create table public.fx_rates (
  id              uuid primary key default gen_random_uuid(),
  currency        public.currency_code not null check (currency <> 'PHP'),
  php_per_unit    numeric(12, 6) not null check (php_per_unit > 0),
  effective_from  timestamptz not null default now(),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index fx_rates_lookup_idx on public.fx_rates (currency, effective_from desc);

create table public.category_markups (
  id              uuid primary key default gen_random_uuid(),
  pax_category    public.pax_category not null references public.pax_categories (code),
  markup_type     public.markup_type not null,
  value           numeric(12, 2) not null check (value >= 0),
  effective_from  timestamptz not null default now(),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  constraint category_markups_percent_range check (markup_type = 'fixed' or value <= 100)
);
create index category_markups_lookup_idx on public.category_markups (pax_category, effective_from desc);

create table public.service_markups (
  id              uuid primary key default gen_random_uuid(),
  service_type    public.service_type not null,
  markup_type     public.markup_type not null,
  value           numeric(12, 2) not null check (value >= 0),
  effective_from  timestamptz not null default now(),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  constraint service_markups_percent_range check (markup_type = 'fixed' or value <= 100)
);
create index service_markups_lookup_idx on public.service_markups (service_type, effective_from desc);

-- -----------------------------------------------------------------------------
-- Content and settings
-- -----------------------------------------------------------------------------
create table public.content_items (
  id                    uuid primary key default gen_random_uuid(),
  content_type          public.content_type not null,
  body                  text not null check (btrim(body) <> ''),
  condition_service_id  uuid references public.services (id) on delete cascade,
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index content_items_type_idx on public.content_items (content_type, sort_order);
create index content_items_condition_idx on public.content_items (condition_service_id);

create table public.app_settings (
  key          text primary key check (key ~ '^[a-z0-9_.]+$'),
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Quotations
-- -----------------------------------------------------------------------------
create sequence public.quotation_ref_seq;

create table public.quotations (
  id                    uuid primary key default gen_random_uuid(),
  reference_no          text not null unique,
  agent_id              uuid not null references public.profiles (id) on delete restrict,
  package_title         text,
  season_label          text,
  client_name           text,
  travel_date           date,
  hotel_category        smallint check (hotel_category between 3 and 5),
  duration_mode         public.duration_mode not null default 'derived',
  duration_days         smallint not null default 3 check (duration_days between 3 and 7),
  pax_adults            smallint not null default 2 check (pax_adults >= 0),
  pax_children          smallint not null default 0 check (pax_children >= 0),
  pax_total             smallint generated always as (pax_adults + pax_children) stored,
  output_categories     public.pax_category[] not null
                          default '{quad,triple,twin,solo,child,sneak_in}',
  booking_status        public.booking_status not null default 'not_booked',
  airfare_php           numeric(12, 2) not null default 0 check (airfare_php >= 0),
  package_markup_type   public.markup_type,
  package_markup_value  numeric(12, 2) check (package_markup_value >= 0),
  status                public.quotation_status not null default 'draft',
  rates_as_of           timestamptz not null default now(),
  snapshot              jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint quotations_pax_range check (pax_adults + pax_children between 1 and 60),
  constraint quotations_package_markup check (
    (package_markup_type is null) = (package_markup_value is null)
    and (package_markup_type is distinct from 'percent' or package_markup_value <= 100)
  )
);
create index quotations_agent_idx on public.quotations (agent_id, created_at desc);

create table public.quotation_services (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations (id) on delete cascade,
  service_id    uuid not null references public.services (id) on delete restrict,
  day_number    smallint check (day_number between 1 and 7),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (quotation_id, service_id)
);
create index quotation_services_service_idx on public.quotation_services (service_id);

create table public.quotation_service_addons (
  quotation_service_id  uuid not null references public.quotation_services (id) on delete cascade,
  addon_id              uuid not null references public.service_rate_addons (id) on delete restrict,
  primary key (quotation_service_id, addon_id)
);
create index quotation_service_addons_addon_idx on public.quotation_service_addons (addon_id);

create table public.quotation_hotels (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations (id) on delete cascade,
  hotel_id      uuid references public.hotels (id) on delete restrict,
  custom_name   text check (custom_name is null or btrim(custom_name) <> ''),
  sort_order    integer not null default 0,
  constraint quotation_hotels_one_source check ((hotel_id is null) <> (custom_name is null))
);
create index quotation_hotels_quotation_idx on public.quotation_hotels (quotation_id);
create index quotation_hotels_hotel_idx on public.quotation_hotels (hotel_id);

create table public.quotation_adjustments (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations (id) on delete cascade,
  pax_category  public.pax_category not null references public.pax_categories (code),
  kind          public.adjustment_kind not null,
  amount        numeric(12, 2) not null check (amount <> 0),
  currency      public.currency_code not null default 'PHP',
  reason        text not null check (btrim(reason) <> ''),
  reverses_id   uuid references public.quotation_adjustments (id) on delete restrict,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now()
);
create index quotation_adjustments_quotation_idx
  on public.quotation_adjustments (quotation_id, pax_category, created_at);

create table public.quotation_outputs (
  id              uuid primary key default gen_random_uuid(),
  quotation_id    uuid not null references public.quotations (id) on delete cascade,
  output_text     text not null,
  computed_rates  jsonb not null,
  generated_by    uuid references public.profiles (id),
  generated_at    timestamptz not null default now()
);
create index quotation_outputs_quotation_idx on public.quotation_outputs (quotation_id, generated_at desc);

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id             bigint generated always as identity primary key,
  table_name     text not null,
  record_id      text,
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data       jsonb,
  new_data       jsonb,
  changed_by     uuid references public.profiles (id),
  actor_user_id  uuid,
  changed_at     timestamptz not null default now()
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

-- -----------------------------------------------------------------------------
-- Pax categories (structural lookup; the rate engine depends on these rules)
--   hotel per person = room cost / hotel_divisor * hotel_multiplier
--   Solo: the entered cost is the per-person twin rate, so divisor 1, multiplier 2.
-- -----------------------------------------------------------------------------
insert into public.pax_categories
  (code, label, output_label, hotel_divisor, hotel_multiplier, has_bed, sort_order)
values
  ('quad',     'Quad sharing',   'QUAD SHARE',   4, 1, true,  1),
  ('triple',   'Triple sharing', 'TRIPLE SHARE', 3, 1, true,  2),
  ('twin',     'Twin sharing',   'TWIN SHARE',   2, 1, true,  3),
  ('solo',     'Solo',           'SOLO',         1, 2, true,  4),
  ('child',    'Child',          'CHILD',        1, 1, true,  5),
  ('sneak_in', 'Sneak-in (no bed, with breakfast)', 'SNEAK-IN (NO BED, WITH BREAKFAST)', 1, 1, false, 6);
