# Changelog

All notable changes to EZQUOTE Japan. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-pilot] — 2026-11-21

First release. A pilot for management review, on Cloudflare Pages against the
existing free Supabase project.

### Quotations

- Build a quotation from cities, tours, transfers and hotels, with a live
  per-person rate for Quad, Triple, Twin, Solo, Child and Sneak-in.
- **Cities covered** on every quotation, which filters the tours, transfers and
  hotels on offer. Services with no city — an airport transfer serving several —
  are always offered. A selection that falls outside the chosen cities is
  flagged, never removed.
- Group-size tiers chosen by the **total** travellers, children included.
- Hotel cost entered per category, divided by that category's rule. **Solo takes
  the per-person twin rate and doubles it.**
- **Change Rate ledger**, append-only. A correction is an exact reversing entry;
  both rows stay on the record.
- Airfare and a package markup, per quotation.
- Final rate **rounded up to the next number ending in 99**, shown as its own
  breakdown line so the lines always sum to the total.
- Itinerary derived from the duration and the services, or set by the agent, from
  3D2N to 7D6N.
- Inclusions, exclusions, notes, requirements and remarks assembled from content
  that can be seasonal or conditional on a selected service.
- Copy-ready quotation text, whole or by section, with the agent's own name and
  Rate My Service links. Saved versions are kept.
- The availability and booking disclaimer until the rooms are confirmed.

### Pricing integrity

- **Every quotation freezes its own rates.** A database trigger builds
  `quotations.snapshot` on insert from the FX table, the markups and every
  published, unexpired rate. The browser cannot influence pricing.
- Rate, FX and markup changes reach **new quotations only**. Reopening,
  regenerating or recopying an old quotation reproduces its original figures
  exactly.
- A quotation may only use services present in its own snapshot.
- **Requote with current rates** copies a quotation and prices the copy today,
  leaving the original untouched, and reports anything no longer on sale.
- A **Rates snapshot** panel on each quotation compares its frozen rates against
  today's.

### Rates and content administration

- Rate versions with `draft → published → inactive`. Drafts are invisible to
  agents; a published version is immutable; a price change is a new version.
- Group-size tier editor that refuses to publish overlapping bands, gaps or a
  version with no tiers.
- Optional add-ons such as entrance tickets, off by default.
- **FX rates and markups are append-only**, with `UPDATE` and `DELETE` revoked at
  the privilege level rather than only policy-denied.
- Services, hotels, cities, operators, booking sites and all package text
  editable in the app, with date windows and service-conditional content.
- Settings for the default services on a new quotation and the itinerary wording.

### People and access

- Profiles separate from logins, so agents exist before they have an account;
  matched by email on first sign-in, with an unrecognised email creating an
  inactive profile for a manager to approve.
- Five roles — Super Admin, Product Development, Admin, Sales Supervisor, Sales
  Agent — with Row Level Security on all 24 tables. An agent sees their own
  quotations, a supervisor their team's read-only, managers everything.
- Agent invitations through an Edge Function that authorises with the caller's
  own token before using the service-role key, which never leaves the Edge
  runtime.
- Per-agent Rate My Service links, visible only to that agent and appearing only
  in their own quotations.

### History and audit

- Quotation history at `/quotations` and `/team/quotations`, paginated on the
  server, with filters held in the URL so a filtered list is a shareable link.
- Archive and restore. **Nothing is ever deleted.**
- `/audit` for managers: every rate, FX, markup, agent and Change Rate change,
  with preset tabs, expandable before/after diffs, a deep link to one record's
  history, and a CSV export that neutralises formula injection.

### Deployment

- Cloudflare Pages from the GitHub repository; production and preview
  environments pointed at separate Supabase projects.
- `_headers` **generated at build time** from `VITE_SUPABASE_URL`, so the
  Content-Security-Policy always names the project the bundle actually talks to.
- SPA routing via `_redirects`, immutable caching for fingerprinted assets, and
  no-cache for `index.html`.
- A build stamp in the footer — version and commit — so pilot feedback can name
  the build.
- CI on every push and pull request: typecheck, lint, format, 707 tests, 81
  database checks, build, and a scan that fails if a secret key reaches `dist/`.
- A manually triggered `uat-e2e` workflow that runs Playwright against the UAT
  project and refuses to run against production.

### Documentation

- [README](README.md) for developers, [RUNBOOK](docs/RUNBOOK.md) for operations,
  [ARCHITECTURE](docs/ARCHITECTURE.md) for the design, user guides for
  [sales](docs/USER-GUIDE-SALES.md) and
  [Product Development](docs/USER-GUIDE-PRODUCT-DEV.md), a
  [PILOT-BRIEF](docs/PILOT-BRIEF.md) for management, the
  [UAT report](docs/uat/UAT-report.md), and
  [MIGRATION-TO-COMPANY](docs/MIGRATION-TO-COMPANY.md).

### Known limitations

Carried from the [UAT report](docs/uat/UAT-report.md) and
[the runbook](docs/RUNBOOK.md#14-known-issues-and-deviations):

- **FR-017 in-app rate upload is deferred to Phase 2.** Rates load through a
  one-time seed script; every rate is editable in the app.
- **Private-vehicle (`private_total`) pricing is Phase 2.** The schema supports
  it; the engine raises a clear issue rather than guessing.
- A supervisor can view a team member's quotation but not adjust it.
- The Sneak-in markup is PHP 0, pending a value.
- Booking-site URLs are unreviewed; transfer direction defaults to round trip;
  one Sapporo tour has no published rate; Japan-specific remarks are outstanding.
- The free Supabase plan **pauses the project after about 7 days of inactivity**,
  has **no automatic backups** (a weekly manual backup is mandatory), and limits
  email to a few per hour — so **custom SMTP is required before inviting all 156
  agents**.
- 31 end-to-end specs are written and skip until a UAT Supabase project and its
  test users exist.

[1.0.0-pilot]: https://github.com/<org>/ezquote-japan/releases/tag/v1.0.0-pilot
