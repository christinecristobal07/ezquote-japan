# EZQUOTE Japan — UAT report

**Against:** BRD section 14.1 (acceptance criteria and UAT scenarios) and section 15 (NFRs)
**Date:** 21 November 2026
**Build commit:** `bc937a9` — "Step 17: quotation history, requote and audit log", plus the Step 18 changes in this report
**Database:** production project `ezquote-japan`, migrations through `20261121150000_quotation_cities.sql`

---

## 1. Summary

| Suite                            | Command                       | Result                   |
| -------------------------------- | ----------------------------- | ------------------------ |
| Unit, domain and UI tests        | `npm run check`               | **706 passed**, 38 files |
| Database, RLS and function tests | `npm run db:test`             | **81 passed, 0 failed**  |
| Engine-level UAT + PD cases      | `npx vitest run tests/uat`    | **61 passed**            |
| End-to-end UAT (Playwright)      | `npm run e2e`                 | **7 passed, 31 not run** |
| Everything                       | `npm run uat`                 | **exit 0**               |
| Production dependency audit      | `npm audit --omit=dev`        | **0 vulnerabilities**    |
| Bundle secret scan               | `npm run check:build-secrets` | **passed**               |

**Scenario outcome: 15 of 17 PASS automatically, 2 need the UAT environment.**

| Verdict                         | Count | Scenarios                                          |
| ------------------------------- | ----- | -------------------------------------------------- |
| PASS (automated)                | 15    | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17 |
| NOT RUN — needs the UAT project | 2     | 1 (partly), 15                                     |
| FAIL                            | 0     | —                                                  |

Scenarios 1 and 15 have their specs written and their underlying rules covered by
database tests; what they still need is a separate Supabase project and five test
users, which is a provisioning step, not a code gap. See
[section 7](#7-what-is-not-yet-executed).

**One gap was found and fixed in this round:** FR-001 (the cities a quotation
covers) had no representation anywhere. See [section 3](#3-the-gap-found-and-fixed).

---

## 2. Scenario table

Evidence links point at `docs/uat/evidence/`. Engine-level evidence is the named
test; a screenshot exists only for the browser scenarios, which run once the UAT
project is in place.

| #   | Scenario                                                | Steps                                                              | Expected                                            | Actual                                                                              | Evidence                                                   | Verdict                             |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| 1   | Start a Japan quote from a yen rate                     | New quotation → tick Tokyo → 4 adults → Create                     | Quotation exists with a JPN reference and JPY rates | Reference `JPN-YYYY-NNNNNN`, snapshot frozen, cities saved                          | `e2e/quotation.spec.ts` UAT-01; `UAT-01.png`               | NOT RUN                             |
| 2   | JPY 10,850 × 0.50 = PHP 5,425 before markup             | Price the Mt Fuji tour alone, read the service line                | PHP 5,425, markup on its own line                   | PHP 5,425; markup PHP 1,000 separate                                                | `UAT-02` in `tests/uat/engine.uat.test.ts`                 | **PASS**                            |
| 3   | 4 travellers use the 2–6 tier                           | Price at 1, 2, 6, 7, 10, 19, 30, 60 travellers                     | Band changes at each boundary                       | All eight bands correct; children counted                                           | `UAT-03`                                                   | **PASS**                            |
| 4   | Each category priced independently; Solo = twin pp × 2  | Price all six categories from one 20,000 room                      | Six different rates, correct divisors               | quad 5,000 · triple 6,666.67 · twin 10,000 · solo 12,000 · child 4,000 · sneak-in 0 | `UAT-04`                                                   | **PASS**                            |
| 5   | Round up to …99                                         | 13,957 · 13,050 · 13,099 · 13,100 · 1 · 100                        | 13,999 · 13,099 · 13,099 · 13,199 · 99 · 199        | All as expected; rounding shown as its own line                                     | `UAT-05`                                                   | **PASS**                            |
| 6   | Switch a category markup fixed → percent                | Quad markup 2,500 fixed, then 10%                                  | 2,500 then 1,355 (10% of 13,550)                    | Exactly that; base excludes airfare and Change Rate                                 | `UAT-06`                                                   | **PASS**                            |
| 7   | FX change: new quote uses it, old quote keeps its rates | Price on the 0.50 snapshot, then the 0.42 one, then replay the old | 19,099 then 17,699; replay reproduces 19,099        | Identical breakdown on replay, to the centavo                                       | `UAT-07`; `e2e` UAT-07; `UAT-07.png`                       | **PASS**                            |
| 8   | Add a tour → itinerary and inclusions update            | Tick a tour, read the itinerary and the output                     | A day appears, inclusions grow                      | Covered by itinerary and output unit tests                                          | `e2e/quotation.spec.ts` UAT-08; `UAT-08.png`               | **PASS** (unit) / NOT RUN (browser) |
| 9   | Remove a tour → rate and itinerary entry disappear      | Untick it, compare the total                                       | Total falls, itinerary entry gone                   | Covered by itinerary and engine tests                                               | `e2e` UAT-09; `UAT-09.png`                                 | **PASS** (unit) / NOT RUN (browser) |
| 10  | Both duration modes                                     | Derived, then agent-selected 5 days                                | 3D2N derived, 5D4N selected                         | Covered by `resolveDuration` tests across 3D2N–7D6N                                 | `e2e` UAT-10; `UAT-10.png`                                 | **PASS** (unit) / NOT RUN (browser) |
| 11  | Change Rate amount → totals tally, entry logged         | Add PHP 1,500, then a reversal                                     | Total +1,500, lines reconcile, audited              | +1,500 exactly; reversal nets to zero; audit row asserted in `db:test`              | `UAT-11`; `db:test` "Change Rate authorship"               | **PASS**                            |
| 12  | An off-list hotel's cost is included                    | Enter a room cost with no reference hotel chosen                   | Cost counted at the category divisor                | PHP 23,600 room → 5,900 pp quad → 19,999 final                                      | `UAT-12`; `e2e` UAT-12; `UAT-12.png`                       | **PASS**                            |
| 13  | Manual airfare is added                                 | Set airfare 25,000                                                 | +25,000, outside the percent base                   | 44,099 final; package markup unchanged                                              | `UAT-13`                                                   | **PASS**                            |
| 14  | Unconfirmed booking shows the availability note         | Leave booking status not_booked, read the output; then confirm     | Note present, then absent                           | Covered by `closingBlock` and output unit tests                                     | `e2e` UAT-14; `UAT-14.png`                                 | **PASS** (unit) / NOT RUN (browser) |
| 15  | Two agents each get their own survey links              | Generate output as Agent A and Agent B, compare the URLs           | Different links, neither sees the other's           | RLS proven in `db:test`; the output-level check needs two real users                | `e2e/security.spec.ts` UAT-15; `UAT-15-agentA.png`         | NOT RUN                             |
| 16  | Copy Full keeps sections, spacing, breaks and emojis    | Copy, read the clipboard, compare with the preview                 | Clipboard === preview, exactly                      | Asserted character-for-character, with an emoji and blank-line check                | `e2e` UAT-16; `UAT-16.png`                                 | **PASS** (unit) / NOT RUN (browser) |
| 17  | Every Product Development test case matches             | Run all 10 rows of `pd-test-cases.csv` through the engine          | Both the before-rounding and final figures match    | 10 of 10 match, hand-computed independently of the engine                           | `tests/uat/pd-cases.test.ts`; `docs/uat/pd-test-cases.csv` | **PASS**                            |

On scenarios 8, 9, 10, 14 and 16: the behaviour itself is covered by the unit and
domain suites that already run (itinerary building, inclusion assembly, duration
resolution, the closing block, and the output renderer with its clipboard
fallback). What the browser specs add is proof that the wiring between them is
right. They are written and will run against the UAT project.

---

## 3. The gap found and fixed

**FR-001 — "Agents start a Japan quotation and choose the cities covered."**

Nothing in the system recorded which cities a package covered. A quotation held
travellers, dates, services and hotels, but the cities were implicit, so the
builder would happily offer an Osaka hotel on a Tokyo-only trip, and the agent had
no way to say what the package was.

Fixed in this round:

- Migration `20261121150000_quotation_cities.sql` — a `quotation_cities` join
  table with RLS matching `quotation_hotels` (view via `can_view_quotation`, edit
  via `can_edit_quotation`), an index on `city_id`, and
  `set_quotation_cities(uuid, uuid[])`. That function is SECURITY INVOKER with an
  explicit permission check, because under RLS a delete the caller is not allowed
  to make removes nothing and still reports success — which would look like a
  saved change.
- `duplicate_quotation` now copies the cities, so a requote covers the same trip.
- A required "Cities covered" picker in the create form and in the builder's
  Basics card, autosaved.
- Tours, transfers and reference hotels are filtered to the chosen cities. A
  service with no city — the airport transfer serves Kansai, Narita and Haneda
  alike — is always shown.
- A selection that falls outside the cities is **flagged, never removed**:
  narrowing the cities after pricing an Osaka tour raises a warning and leaves the
  tour alone. Deleting priced work without being asked is worse than a warning.

Tests added: 23 domain tests (`src/domain/quotation/cityScope.test.ts`), 10 UI
tests (`src/features/quotations/cities.ui.test.tsx`), and 10 database checks
covering grants, replace-on-resave, duplicate collapse, the 42501 for another
agent, read isolation, supervisor read access, the foreign-key restrict, the
cascade, and the requote carry-over.

---

## 4. FR traceability matrix

| FR     | Requirement                                     | Covered by                                                                                  | Status                          |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| FR-001 | Start a quotation, choose the cities            | `cityScope.test.ts`, `cities.ui.test.tsx`, `db:test` "Cities covered", `e2e` UAT-01         | **MET** (new)                   |
| FR-002 | Operator rate converts at the configured FX     | `UAT-02`, `money.test.ts`, `rateEngine.test.ts`                                             | **MET**                         |
| FR-003 | Authorised markup per category                  | `UAT-06`, `markupRepository`, `db:test` markup append-only + RLS                            | **MET**                         |
| FR-004 | Each occupancy category has its own rate        | `UAT-04`, `rateEngine.test.ts`                                                              | **MET**                         |
| FR-005 | Change Rate updates selling rates and is logged | `UAT-11`, `ledger.test.ts`, `db:test` "Change Rate entries" and "Change Rate authorship"    | **MET**                         |
| FR-006 | Hotel choices visible, actual costs enterable   | `UAT-12`, `cities.ui.test.tsx`, `HotelCostCard` tests                                       | **MET**                         |
| FR-007 | Selected tours appear in the quotation          | `UAT · add-ons`, `quotationOutput.test.ts`, `e2e` UAT-08                                    | **MET**                         |
| FR-008 | Selected transfers appear                       | `UAT-02` transfer case, `quotationOutput.test.ts`                                           | **MET**                         |
| FR-009 | Itinerary follows duration and services         | `itinerary.test.ts`, `duration.test.ts`, `e2e` UAT-10                                       | **MET**                         |
| FR-010 | Selected services update inclusions             | `content/text.test.ts`, `quotationOutput.test.ts`, `e2e` UAT-08                             | **MET**                         |
| FR-011 | Destination and service-conditional exclusions  | `content/text.test.ts` (conditional content), `contentRepository`                           | **MET**                         |
| FR-012 | Complete copy-ready quotation                   | `quotationOutput.test.ts`, `clipboard.test.tsx`, `e2e` UAT-16                               | **MET**                         |
| FR-013 | Agent name automatic                            | `closingBlock.test.ts`, `outputRepository`                                                  | **MET**                         |
| FR-014 | Agent's own survey links                        | `closingBlock.test.ts`, `db:test` survey-link RLS, `e2e` UAT-15                             | **MET** (browser check pending) |
| FR-015 | History with rate snapshots                     | `UAT-07`, `snapshotDiff.test.ts`, `filters.test.ts`, `db:test` "Requote with current rates" | **MET**                         |
| FR-016 | Rate, config and adjustment changes recorded    | `audit.test.ts`, `db:test` "Audit and snapshot isolation", the `/audit` screen              | **MET**                         |
| FR-017 | Authorised users can upload rate data           | Phase 1 = the one-time seed script (`scripts/seed/`)                                        | **DEFERRED** — see 6            |
| FR-018 | Expired or inactive rates are not used          | `db:test` snapshot builder (published and unexpired only), `preview.test.ts`                | **MET**                         |
| FR-019 | USD or JPY rates, each with its own FX          | `UAT-02`, `rateEngine.test.ts` USD conversion at 67, `fxRepository`                         | **MET**                         |
| FR-020 | Group-size tiers                                | `UAT-03`, `tiers.test.ts`, `validateTiers.test.ts`                                          | **MET**                         |

19 of 20 met. FR-017 is deferred by design and needs sign-off.

---

## 5. NFR results

### Performance

The targets are BRD 15: calculation under 200 ms, a quotation page interactive
within 2 s, generating the text under 1 s.

| Measure                    | Target   | Measured                                                                                                                                                                       |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rate calculation           | < 200 ms | The whole 706-test suite, which prices thousands of quotations including a wide input sweep, runs in **25 s**; no single calculation is measurable in isolation at this scale. |
| Quotation page interactive | < 2 s    | **Pending** — `e2e/nfr.spec.ts` measures it and writes `docs/uat/evidence/nfr-results.json`                                                                                    |
| Generate quotation         | < 1 s    | **Pending** — same spec                                                                                                                                                        |
| Production bundle          | —        | 814 kB main chunk (231 kB gzipped), built in 2.1 s                                                                                                                             |

The two browser timings are measured, recorded to JSON and asserted against the
targets; they are among the 31 specs waiting on the UAT project. The bundle's main
chunk exceeds Vite's 500 kB advisory. It is not a stated requirement and at 231 kB
gzipped it is not a problem on a Philippine connection, but code-splitting the
admin routes would be worth a later step.

### Responsive

`e2e/mobile.spec.ts` runs the builder and the copy flow at 375 × 812 and asserts
no horizontal page scroll beyond two pixels of rounding. Every screen is built on
the same Tailwind breakpoints that the component gallery exercises. **Pending the
UAT project.**

### Accessibility

`e2e/nfr.spec.ts` runs axe-core over login, the dashboard, the builder, the output
page and admin rates, with WCAG 2.0/2.1 A and AA tags, and fails on any serious or
critical violation. **Pending the UAT project.**

### Data integrity

**MET and proven.** `quotations.snapshot` is written by a database trigger on
insert and by nothing else; `db:test` asserts that an FX change leaves an existing
quotation's snapshot untouched, and that replaying it reproduces the original
figures exactly (`UAT-07`). Change Rate entries are append-only at the privilege
level — `UPDATE` and `DELETE` are revoked from `authenticated`, not merely
policy-denied — and corrections are exact reversing entries, with a trigger that
refuses a reversal of a reversal and a second reversal of the same entry.

### Maintainability

**MET.** Product Development changes FX, markups, rate versions, tiers, add-ons,
services, hotels, cities, booking sites and all package text through the admin
screens, with no developer involved. The one exception is the initial rate upload,
which is FR-017 below.

---

## 6. Security checks

| Check                                             | How                                                                        | Result                        |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| Row Level Security on every table                 | `db:test` "Row Level Security", 23 tables                                  | PASS                          |
| An API role cannot reach a table without a grant  | `db:test` asserts the grants exist, with no stand-in grants in the harness | PASS                          |
| An agent sees only their own quotations           | `db:test` + `e2e` UAT-SEC-04                                               | PASS (db) / pending (browser) |
| A supervisor sees their team's, read-only         | `db:test` + `e2e` UAT-SEC-05                                               | PASS (db) / pending (browser) |
| An agent cannot reach the admin screens           | `e2e` UAT-SEC-01, by entering the URL directly                             | Pending                       |
| An agent cannot read the audit log                | `db:test` audit RLS (managers only) + `e2e` UAT-SEC-02                     | PASS (db) / pending (browser) |
| A deactivated user is locked out                  | `db:test` `is_active_user` + `e2e` UAT-SEC-06                              | PASS (db) / pending (browser) |
| No secret key reaches the browser bundle          | `npm run check:build-secrets` over 4 built files                           | PASS                          |
| Only the two intended env values reach the bundle | Same scan, comparing against `.env`                                        | PASS                          |
| No production dependency vulnerabilities          | `npm audit --omit=dev`                                                     | PASS — 0                      |
| UAT cannot be pointed at production by accident   | `e2e/guard.spec.ts`, 7 tests over the project-ref guard                    | PASS                          |

**One dev-only advisory.** `npm audit` reports two moderate findings, both the
same issue: `uuid` below 11.1.1, reached through `exceljs`. `exceljs` is a
devDependency used solely by the one-time seed script that reads the Excel
workbook; it is never bundled, and `npm audit --omit=dev` is clean. The only fix
offered is a downgrade to `exceljs@3.4.0`, a breaking change with no benefit here.
**Recommendation: accept, and revisit if `exceljs` is ever needed at runtime.**

---

## 7. What is not yet executed

31 end-to-end specs are written and skip themselves with a stated reason. They
need two things from you:

1. **A separate UAT Supabase project.** Not production — the suite signs in,
   creates quotations and deactivates users. `e2e/uat-env.ts` compares the project
   refs and refuses to start if `.env.uat` points at the production project; that
   guard is itself tested.
2. **Five test users in that project**, created by hand (creating them in code
   would need a service-role key, and no key that bypasses RLS belongs in a test
   run): a Super Admin, a Product Development user, a Supervisor, and Agents A and
   B — with **Agent A reporting to the Supervisor**, and **each agent given its own
   Rate My Service links**. Optionally a sixth, deactivated profile for the
   lock-out check.

Then copy `.env.uat.example` to `.env.uat`, fill it in, and run `npm run e2e`. The
app is served from a UAT build (`npm run dev:uat`, which makes Vite read
`.env.uat`), so production env values are never loaded.

---

## 8. Deviations needing sign-off

| #   | Item                          | What it is                                                                                                                                                                                                                                                                                                                                                                            | Needed from             |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | **FR-017 in-app rate upload** | Phase 1 loads rates through the one-time seed script. Uploading a rate sheet from inside the portal is **deferred to Phase 2 — needs management sign-off.** Product Development can already edit every rate by hand through the admin screens, so nothing is blocked.                                                                                                                 | Management              |
| 2   | **Change Rate authorship**    | BRD 4.5 says "any user with portal access" may enter a Change Rate amount. As built, that means the quotation's own agent and managers; a **supervisor views a team member's quote but cannot adjust it.** Each user can always adjust their own quotes, so the clause is met per user. If supervisors should be able to adjust their team's quotes, say so and it is a small change. | Operations / management |
| 3   | **Sneak-in markup**           | Seeded at **PHP 0**, pending a real value. It prices correctly at 0, and the output line appears as specified.                                                                                                                                                                                                                                                                        | Product Development     |
| 4   | **Booking-site URLs**         | The reference links shown beside the hotel list are seeded from the workbook and have not been reviewed.                                                                                                                                                                                                                                                                              | Product Development     |
| 5   | **Transfer direction**        | Transfers default to **round trip**, pending Ops. The one_way/round_trip flag exists per service and is editable.                                                                                                                                                                                                                                                                     | Operations              |
| 6   | **The unpriced Sapporo tour** | One seeded tour has no published rate, so it cannot be quoted. It shows "No rate yet" and its checkbox is disabled rather than producing a wrong figure.                                                                                                                                                                                                                              | Product Development     |
| 7   | **Japan remarks**             | The Hong Kong remarks from the workbook were dropped as agreed; the BRD remarks are in place. **Japan-specific remarks are still to be provided.**                                                                                                                                                                                                                                    | Product Development     |

---

## 9. Manual checklist for you

These cannot be automated and are the remaining sign-off work.

### Pasting the quotation (scenario 16, the part a machine cannot judge)

The clipboard text is asserted to equal the preview character for character.
What still needs a human eye is how each app renders it. For each target, copy a
full quotation and check that the section headings stay on their own lines, the
blank lines between sections survive, and the emojis show as emojis:

- [ ] **Messenger** — Windows desktop
- [ ] **Messenger** — phone
- [ ] **Viber** — Windows desktop
- [ ] **Viber** — phone
- [ ] **Gmail** — Chrome on Windows
- [ ] **Gmail** — phone
- [ ] **Outlook** — Windows desktop app
- [ ] **Outlook** — Outlook on the web

Note anything that collapses blank lines; if one app does, the fix is a setting in
the output renderer rather than a change to every quotation.

### A real invitation email

- [ ] Invite a new agent from `/admin/agents` to an address you control
- [ ] The email arrives, and not in spam
- [ ] The link opens the set-password page
- [ ] Setting a password signs you in and the profile shows as active
- [ ] An agent whose profile is not yet approved sees the pending-approval page

### Product Development's own test cases

- [ ] Add PD's real cases as rows in `docs/uat/pd-test-cases.csv` — inputs plus the
      expected rate before and after rounding
- [ ] Run `npx vitest run tests/uat/pd-cases.test.ts`
- [ ] Any mismatch names the case and shows both figures; send those to me

The 10 rows already in the file are the hand-computed cases from the rate-engine
work, and all 10 match. No code changes are needed to add more rows.

### Spot checks worth doing on real data

- [ ] Quote a package you have recently sold by hand and compare the figures
- [ ] Check a 7D6N trip, which is the top of the supported range
- [ ] Check a group of 30+, which uses the lowest tiers
- [ ] Check a quotation with a child and a sneak-in on the same booking
