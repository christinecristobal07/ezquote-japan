# EZQUOTE JAPAN – project rules

Web portal replacing Gladex Travel & Tours' Excel quotation workbook for Japan land arrangements.
Stack: React 19 + TypeScript 6.0 (pinned: typescript-eslint needs <6.1), Vite, Tailwind v4, Supabase (Postgres, Auth, RLS), Vitest.
Source of truth: the BRD. Where the workbook and the BRD disagree, follow the BRD.

## Working rules

- One step at a time. Do only the step asked. Summarise design decisions, list commands/manual setup, give complete files (never partial), end with how to verify.
- Production quality: strict types, small components, no business logic in UI components.
- src/domain/ is pure TypeScript (no React/Supabase imports; ESLint enforces it).
- Secrets only in env vars. Browser gets the publishable key only. Never commit .env\*, the workbook, or seed output.
- Run `npm run check` (typecheck + lint + prettier) before declaring a step done. LF line endings.
- Never write to the remote database without asking me first.

## Business decisions (final)

- Japan only. Operator rates in JPY. Default FX PHP 0.50/JPY; USD 67 kept for USD charges. FX editable by Product Development/Admin only.
- Tours/transfers priced per person by group-size tier. Tier is chosen by TOTAL travellers in the quote, children included. Tiers differ per service.
- Phase 1 is join-in (per-pax) only. Private-vehicle totals are Phase 2 (schema supports pricing_basis = 'private_total').
- Pax categories: quad, triple, twin, solo, child, sneak_in (Child and Sneak-in are separate output lines).
- Hotel per person = room cost ÷ divisor × multiplier (quad 4/1, triple 3/1, twin 2/1, solo 1/2 [entered value is per-person twin rate], child 1/1, sneak_in 1/1). Hotel cost is entered per category in Change Rate (kind = 'hotel').
- Selling rate per person = hotel pp + Σ tours + Σ transfers + category markup + package markup + airfare + non-hotel Change Rate amounts.
- Markups: fixed PHP or percent. Percent base = hotel + tours + transfers (excludes airfare and Change Rate). Tour markup +1,000, transfer +2,000 (editable). Category markups: quad 2,500, triple 2,600, twin 2,700, solo 3,500, child 2,000, sneak_in 0.
- Percent markup base = hotel pp + converted operator tour/transfer rates + add-ons; excludes tour/transfer markups, airfare and non-hotel Change Rate.
- Final rate rounds UP to the next number ending in 99 (13,957 → 13,999; 13,050 → 13,099; already ending in 99 stays).
- Snapshot: the DB builds quotations.snapshot on insert (FX, markups, all published unexpired rates). Rate/FX changes affect only new quotations. Quotes can only use services in their own snapshot.
- Change Rate entries are append-only; corrections are exact reversing entries. Every entry audited.
- Transfers have a one_way/round_trip flag (default round_trip, pending Ops). Entrance tickets are optional add-ons, off by default.
- Duration 3D2N–7D6N: agent-selected or derived (arrival + 1 day per day-consuming service + departure, min 3D2N, warn above 7D6N). Airport transfer does not consume a day.
- Hotels are reference only. Booking status not_booked/booked/confirmed; until confirmed the output carries the availability/booking disclaimer.
- Each agent sees only their own Rate My Service links. Output uses the logged-in agent's name and links only.
- Roles: super_admin, product_development, admin (= "managers"), sales_supervisor (own quotes + read team's), sales_agent (own quotes). Supervisor team = profiles.supervisor_id.
- Drop the Hong Kong remarks from the workbook; use the BRD remarks. Japan remarks will be provided later.
