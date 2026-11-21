# EZQUOTE Japan — handover

**Version:** 1.0.0-pilot · **Date:** 21 November 2026

What is being handed over, what is outstanding, and who owns each open item. Sign
at the bottom when you are satisfied.

---

## 1. What is delivered

### The system

- [x] React single-page app, deployed on Cloudflare Pages from the GitHub
      repository
- [x] Supabase Postgres with Row Level Security on all 24 tables, Auth, and one
      Edge Function for invitations
- [x] All migrations applied to the production project, `odiihjpbzarrxvoftnvd`
- [x] `npm run check` — **707 tests across 38 files**, typecheck, lint and format
      all clean
- [x] `npm run db:test` — **81 database, RLS and function checks**, 0 failed
- [x] `npm run e2e` — security-header and CSP checks pass against the real
      production build; 31 browser specs written and waiting on the UAT project
- [x] `npm audit --omit=dev` — **0 vulnerabilities**
- [x] `npm run check:build-secrets` — no secret key or stray env value reaches
      `dist/`
- [x] CI on every push and pull request

### Documentation

| Document                                                    | For                                            | Delivered |
| ----------------------------------------------------------- | ---------------------------------------------- | --------- |
| [README.md](../README.md)                                   | Developers — setup and workflow                | [x]       |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md)                     | Developers — the design and why                | [x]       |
| [docs/RUNBOOK.md](RUNBOOK.md)                               | Operations — deploy, migrate, back up, recover | [x]       |
| [docs/USER-GUIDE-SALES.md](USER-GUIDE-SALES.md)             | Sales agents                                   | [x]       |
| [docs/USER-GUIDE-PRODUCT-DEV.md](USER-GUIDE-PRODUCT-DEV.md) | Product Development and Admin                  | [x]       |
| [docs/PILOT-BRIEF.md](PILOT-BRIEF.md)                       | Management — one page                          | [x]       |
| [docs/uat/UAT-report.md](uat/UAT-report.md)                 | UAT results against BRD 14.1                   | [x]       |
| [docs/MIGRATION-TO-COMPANY.md](MIGRATION-TO-COMPANY.md)     | The plan for company accounts                  | [x]       |
| [CHANGELOG.md](../CHANGELOG.md)                             | What is in v1.0.0-pilot                        | [x]       |

### Test results against the BRD

**15 of 17 UAT scenarios pass automatically. Nothing fails.** Two need the UAT
environment rather than code. **19 of 20 functional requirements are met**;
FR-017 (in-app rate upload) is deferred to Phase 2 and needs sign-off.

---

## 2. Go-live checklist

Tick these off as they are done. Each links to the exact instructions.

| #   | Task                                                                                                                                       | Owner | Done |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---- |
| 1   | [Cloudflare Pages project created, production variables set](RUNBOOK.md#11-cloudflare-pages--create-the-project)                           |       | [ ]  |
| 2   | [Preview variables set to the UAT project, and verified in the browser](RUNBOOK.md#12-cloudflare-pages--preview-environment-variables)     |       | [ ]  |
| 3   | [The pages.dev URL written into RUNBOOK.md and PILOT-BRIEF.md](RUNBOOK.md#11-cloudflare-pages--create-the-project)                         |       | [ ]  |
| 4   | [Supabase Auth: Site URL, redirect URLs, sign-ups off, password policy](RUNBOOK.md#13-supabase-auth--url-configuration-production-project) |       | [ ]  |
| 5   | [Invite and recovery email templates use Gladex wording](RUNBOOK.md#14-supabase-auth--email-templates)                                     |       | [ ]  |
| 6   | [Edge Function: SITE_URL set and invite-agents redeployed](RUNBOOK.md#16-edge-function--invite-agents)                                     |       | [ ]  |
| 7   | [Security Advisor shows zero errors; accepted warnings recorded](RUNBOOK.md#17-supabase-advisors)                                          |       | [ ]  |
| 8   | [Two people have Supabase and Cloudflare access; 2FA everywhere; credentials in the password manager](RUNBOOK.md#18-access-and-accounts)   |       | [ ]  |
| 9   | [First pilot data load, and the 45-row fix list worked through](RUNBOOK.md#9-first-pilot-data-load)                                        |       | [ ]  |
| 10  | [Super Admin bootstrapped and signed in](RUNBOOK.md#10-bootstrap-the-super-admin)                                                          |       | [ ]  |
| 11  | [Pilot users invited, one at a time, and confirmed received](RUNBOOK.md#11-invite-the-pilot-users)                                         |       | [ ]  |
| 12  | [First manual backup taken](RUNBOOK.md#6-manual-backup-weekly)                                                                             |       | [ ]  |
| 13  | [That backup test-restored into the UAT project, with counts matching](RUNBOOK.md#7-restore-from-a-manual-backup)                          |       | [ ]  |
| 14  | Weekly backup booked as a recurring calendar task, with a named owner                                                                      |       | [ ]  |
| 15  | UAT report shared with management                                                                                                          |       | [ ]  |
| 16  | Pilot brief sent to management, with the pilot URL                                                                                         |       | [ ]  |
| 17  | User guides sent to the pilot agents and to Product Development                                                                            |       | [ ]  |

**Record the dates here when they happen:**

| Event                             | Date | By whom |
| --------------------------------- | ---- | ------- |
| First deployment to the pilot URL |      |         |
| First pilot data load             |      |         |
| First manual backup               |      |         |
| **Backup test-restore verified**  |      |         |
| First pilot user signed in        |      |         |

> Item 13 matters more than it looks. A backup that has never been restored is a
> guess, and on the free plan it is the only copy of the data that exists.

---

## 3. Open items and owners

### Needs a decision from management

| #   | Item                                                                                                                                             | Owner      | Resolved |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------- |
| 1   | **Approve the move to a Gladex company Supabase project** (Pro, ~USD 25/month). Plan ready in [MIGRATION-TO-COMPANY.md](MIGRATION-TO-COMPANY.md) | Management | [ ]      |
| 2   | **FR-017 in-app rate upload** — deferred to Phase 2. Approve scheduling it                                                                       | Management | [ ]      |

### Needs a decision from Operations

| #   | Item                                                                                                                                                      | Owner      | Resolved |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 3   | **Should a supervisor be able to enter a Change Rate amount on a team member's quotation?** Today they can view it but not adjust it. Small change if yes | Operations | [ ]      |
| 4   | **Transfer direction** — defaults to round trip. Confirm, or set per service                                                                              | Operations | [ ]      |

### Needs values from Product Development

| #   | Item                                                                                                             | Owner               | Resolved |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------- | -------- |
| 5   | **Sneak-in markup** is PHP 0. Supply the real value                                                              | Product Development | [ ]      |
| 6   | **Japan-specific remarks** have not been provided                                                                | Product Development | [ ]      |
| 7   | **Booking-site URLs** are seeded from the workbook and unreviewed                                                | Product Development | [ ]      |
| 8   | **The Sapporo tour has no published rate**, so it cannot be quoted                                               | Product Development | [ ]      |
| 9   | **JUSTINE's Rate My Service links** were truncated in the workbook and rejected on import. Re-enter them by hand | Product Development | [ ]      |
| 10  | **The 45-row agent fix list** — missing emails and broken survey links                                           | Product Development | [ ]      |
| 11  | **Run PD's own test cases** through `docs/uat/pd-test-cases.csv` and report any mismatch                         | Product Development | [ ]      |

### Needs doing before all 156 agents are invited

| #   | Item                                                                                                           | Owner | Resolved |
| --- | -------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| 12  | **Custom SMTP configured.** A hard prerequisite — see [RUNBOOK 1.5](RUNBOOK.md#15-email-sending-for-the-pilot) | Admin | [ ]      |

### Needs doing to finish UAT

| #   | Item                                                                                                                                                        | Owner | Resolved |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| 13  | **A separate UAT Supabase project and five test users**, so the 31 browser specs can run. See [UAT report §7](uat/UAT-report.md#7-what-is-not-yet-executed) | Admin | [ ]      |
| 14  | **Manual paste checks** into Messenger, Viber, Gmail and Outlook, on Windows and a phone. See [UAT report §9](uat/UAT-report.md#9-manual-checklist-for-you) | Sales | [ ]      |
| 15  | **A real invitation email end to end**, to an address you control                                                                                           | Admin | [ ]      |

---

## 4. Things to know before you touch anything

The four that will cost you time if nobody tells you:

1. **Migrations are applied by a person, never automatically.** Take a manual
   backup first, dry-run, then push. **Fix forward** — never edit a migration
   that has already been applied.
   [RUNBOOK §5](RUNBOOK.md#5-apply-a-database-migration)
2. **Preview deployments must point at the UAT project.** A preview with
   production credentials lets anyone with a pull-request link write to live
   data. Verify it in the browser, not just in the settings page.
   [RUNBOOK §1.2](RUNBOOK.md#12-cloudflare-pages--preview-environment-variables)
3. **Rates are frozen per quotation; text is live.** Changing FX or a rate
   affects new quotations only. Changing inclusions changes every quotation,
   including old ones. This is the design, not a bug.
   [ARCHITECTURE §3](ARCHITECTURE.md#3-the-snapshot-design)
4. **Changing `SITE_URL` needs the Edge Function redeployed.** It is read at
   startup, so setting the secret alone does nothing.
   [RUNBOOK §8](RUNBOOK.md#8-rotate-keys)

And one that is easy to get wrong in the app: **for Solo you enter the per-person
twin rate, and the system doubles it.** Agents who type the room cost will quote
double. It is called out in [the sales guide](USER-GUIDE-SALES.md#5-hotel-cost-and-change-rate).

---

## 5. Sign-off

By signing, you confirm you have received the documents in section 1, understand
the open items in section 3, and accept the pilot as fit for management review.

**Product Development**

Confirms: the rate engine's figures match our pricing, the rates and content
screens do what we need without a developer, and the outstanding values in
section 3 are ours to supply.

| Name | Signature | Date |
| ---- | --------- | ---- |
|      |           |      |

---

**Sales Supervisor**

Confirms: an agent can build and send a quotation faster than with the workbook,
the quotation text pastes correctly into the apps we actually use, and the
team-visibility rules match how we work.

| Name | Signature | Date |
| ---- | --------- | ---- |
|      |           |      |

---

**Admin**

Confirms: we can deploy, restore and roll back using the runbook; at least two
people hold access with 2FA; the weekly backup has an owner and a calendar slot;
and the first test-restore has been verified.

| Name | Signature | Date |
| ---- | --------- | ---- |
|      |           |      |

---

**Notes and conditions**

<br>
<br>
<br>
