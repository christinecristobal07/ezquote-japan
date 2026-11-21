-- =============================================================================
-- EZQUOTE Japan · Hotel cost entered per night, so it follows the duration
--
-- The Excel asks the agent for a RATE PER NIGHT and multiplies it by the
-- number of nights, which it takes from the DURATION cell:
--
--   JAPAN QUOTATION!I23  =350*NUM_OF_NYTS
--   PROCESS sheet        "enter ... nights, rate per night" ->
--                        "the sheet auto-calculates the hotel total"
--
-- So changing 3D2N to 5D4N re-prices the hotel by itself. The portal asked for
-- the finished stay total instead, so lengthening a trip moved the itinerary
-- and the label but left the money alone — the quotation said 5D4N and charged
-- for two nights.
--
-- A hotel entry can now record the nightly rate it was built from. The amount
-- column still holds the stay total, so nothing that reads the ledger changes
-- its meaning; what is new is that the engine can recompute the total when the
-- nights change, and the UI can show the agent the rate they actually typed.
-- =============================================================================

-- Nightly rate in the entry's own currency, as the agent typed it. Null means
-- the entry was given as a flat stay total, which stays supported: a supplier
-- who quotes one figure for the whole stay should not be re-typed per night.
alter table public.quotation_adjustments
  -- Signed, like amount: a reversal carries the negated nightly rate, and the
  -- reversal guard below is what keeps the pair honest.
  add column amount_per_night numeric(12, 2);

-- The nights the stay total was computed from, so a later duration change can
-- be recognised as a change rather than guessed at.
alter table public.quotation_adjustments
  add column nights smallint
    check (nights is null or (nights >= 1 and nights <= 30));

-- Both or neither: a nightly rate with no night count cannot be re-multiplied,
-- and a night count with no rate says nothing.
alter table public.quotation_adjustments
  add constraint quotation_adjustments_per_night_pair
    check ((amount_per_night is null) = (nights is null));

-- Only a hotel entry is priced per night. A surcharge or a rate difference is
-- a one-off figure, and letting it carry nights would invite the engine to
-- multiply something that must not be multiplied.
alter table public.quotation_adjustments
  add constraint quotation_adjustments_per_night_hotel_only
    check (amount_per_night is null or kind = 'hotel');

comment on column public.quotation_adjustments.amount_per_night is
  'Nightly rate the stay total was built from, in this row''s currency. Null for a flat stay total.';
comment on column public.quotation_adjustments.nights is
  'Nights the stay total was computed from, so a duration change is detectable.';

-- -----------------------------------------------------------------------------
-- The reversal guard compares the original and its reversal field by field, so
-- it has to know about the two new columns: a reversal of a per-night entry
-- carries the negated nightly rate and the same night count.
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

  -- New: a per-night entry carries the negated nightly rate and the same night
  -- count, so the pair still nets to nothing however it is re-multiplied.
  if v_target.amount_per_night is not null
     and (new.amount_per_night is distinct from -v_target.amount_per_night
          or new.nights is distinct from v_target.nights) then
    raise exception 'A reversal must exactly negate the original entry.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.quotation_adjustments where reverses_id = new.reverses_id) then
    raise exception 'This entry has already been reversed.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
