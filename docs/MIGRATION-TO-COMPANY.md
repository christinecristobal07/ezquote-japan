# Moving EZQUOTE Japan to company accounts

**Status: a plan. Nothing here has been done.** Execute it only after management
approves the pilot.

The pilot runs on personal accounts and free plans: the Supabase project sits in
Christine's personal organisation, the GitHub repository and the Cloudflare Pages
project are personal too. That is the right trade for a pilot and the wrong one
for a system the sales team depends on — if one person is unreachable, nobody can
restore a paused project, roll back a deployment or rotate a key.

This document moves all three to Gladex accounts, keeps every agent's existing
password, and tells you how long the app is down.

---

## Why move at all

| Today (free, personal)                 | After (Pro, company)                              |
| -------------------------------------- | ------------------------------------------------- |
| Pauses after ~7 days of inactivity     | Never pauses                                      |
| No automatic backups, no PITR          | Daily backups, point-in-time recovery available   |
| Owned by one person's account          | Owned by the company, with several administrators |
| Leaked-password protection unavailable | Available                                         |
| Logs kept ~1 day                       | Kept 7 days                                       |
| 500 MB database, 5 GB egress           | 8 GB database, 250 GB egress                      |

**Cost:** Supabase Pro is **USD 25 per month** per organisation, plus usage above
the included quota — which this app will not reach. **Region: Singapore
(`ap-southeast-1`)**, the closest to Manila; the pilot project's region should be
checked and matched or bettered.

---

## Before you start

- [ ] Management has approved the move in writing.
- [ ] A Gladex Google or Microsoft account exists for the company GitHub,
      Cloudflare and Supabase logins — not a personal address.
- [ ] A company payment card is available for Supabase Pro.
- [ ] **A fresh manual backup has been taken and test-restored** (RUNBOOK
      [section 6](RUNBOOK.md#6-manual-backup-weekly) and
      [section 7](RUNBOOK.md#7-restore-from-a-manual-backup)). Do not start
      without this.
- [ ] A maintenance window is agreed and the sales team told
      ([see the downtime estimate](#downtime-estimate)).
- [ ] Two named people will be present for the whole window.

---

## Downtime estimate

| Phase                                                               | Time          | App available?                |
| ------------------------------------------------------------------- | ------------- | ----------------------------- |
| 1–4 · Create the project, push migrations, dry-run the data restore | 1–2 hours     | **Yes** — nothing has changed |
| 5 · Freeze the old project, final dump, restore                     | **20–40 min** | **No**                        |
| 6–8 · Edge Function, Auth config, Cloudflare switch                 | **10–20 min** | **No**                        |
| 9 · Smoke test                                                      | **15 min**    | **No** (nobody but you)       |
| **Total unavailable**                                               | **45–75 min** |                               |

Plan a **two-hour window** and do it outside selling hours — a Sunday morning
Manila time. Most of the work happens beforehand with the app still running; only
phases 5 to 9 are the outage.

---

## Phase 1 — Create the company Supabase project

1. Sign in to <https://supabase.com> with the **Gladex** account.
2. **New organisation** → name it `Gladex Travel and Tours` → plan **Pro**.
3. **New project:**
   - Name: `ezquote-japan`
   - Region: **Southeast Asia (Singapore) · ap-southeast-1**
   - Database password: generate a strong one and put it in the company password
     manager immediately. You cannot read it again later.
4. Note the new project ref (the subdomain of its URL).
5. **Organisation → Team → Invite member** — add the second administrator now,
   before anything depends on this project.
6. Turn on 2FA for both accounts.

---

## Phase 2 — Schema

The migrations in this repository are the schema. Push them in order; do not
hand-copy anything.

```bash
cd /path/to/ezquote-japan
git checkout main && git pull
npm ci

npx supabase link --project-ref <new-company-ref>
npx supabase db push --linked --dry-run     # should list EVERY migration
npx supabase db push --linked
```

The dry run must list all of them, from `20261120100000_core_schema.sql` onward.
If it lists fewer, you are linked to the wrong project — stop and re-link.

Then confirm:

```bash
npx supabase migration list --linked
npm run db:types                            # should produce no diff
git diff --stat src/data/database.types.ts  # expect: no changes
```

No diff in the generated types means the new database matches the old one
exactly. **If there is a diff, stop and find out why before going further.**

---

## Phase 3 — Data (public schema)

Rehearse with a dump taken now, while the app is still live. The real run in
phase 5 repeats these commands with a fresh dump.

```bash
# From the OLD project.
npx supabase link --project-ref odiihjpbzarrxvoftnvd
npx supabase db dump --linked --data-only -f migrate/public-data.sql

# Into the NEW project. Get the connection string from
# the new project -> Connect -> Direct connection.
psql "$NEW_DB_URL" -f migrate/public-data.sql
```

Verify, comparing against the old project:

```sql
select
  (select count(*) from public.profiles)              as profiles,
  (select count(*) from public.quotations)            as quotations,
  (select count(*) from public.quotation_adjustments) as adjustments,
  (select count(*) from public.service_rate_versions) as rate_versions,
  (select count(*) from public.audit_log)             as audit_rows;
```

**Every number must match.** Also spot-check that a quotation's `snapshot` column
arrived intact — it is jsonb and it is the pricing record:

```sql
select reference_no, snapshot -> 'fx' ->> 'JPY' as jpy_rate,
       jsonb_array_length(snapshot -> 'services') as services
from public.quotations order by created_at desc limit 5;
```

> **Note on triggers.** The insert trigger on `quotations` builds a snapshot and
> draws a reference number. A data-only restore uses `COPY`, which does **not**
> fire `BEFORE INSERT` triggers for existing values, so the restored rows keep
> their original references and snapshots. Confirm with the query above rather
> than assuming — if references have been renumbered, stop immediately; that
> would break every link anyone has saved.

Afterwards, make sure the reference sequence is past the highest existing number,
or the next new quotation will collide:

```sql
select max(reference_no) from public.quotations;
select last_value from public.quotation_ref_seq;
-- If the sequence is behind, move it forward (adjust the number):
select setval('public.quotation_ref_seq', 1234);
```

---

## Phase 4 — Auth users, with their passwords

**This is the part that decides whether agents need new passwords.** Get it
right and nobody notices the move.

### The supported method

Supabase's documented path for moving auth users between projects is to copy the
`auth.users` rows, **including the `encrypted_password` column**. The hashes are
bcrypt and are not tied to the project, so a copied hash keeps working: the agent
signs in with the password they already have.

```bash
# Dump ONLY auth.users from the old project.
pg_dump "$OLD_DB_URL" \
  --data-only \
  --table=auth.users \
  --column-inserts \
  -f migrate/auth-users.sql

# And the identities rows, which link a user to the email provider.
pg_dump "$OLD_DB_URL" \
  --data-only \
  --table=auth.identities \
  --column-inserts \
  -f migrate/auth-identities.sql
```

Restore into the new project **in that order** (`identities` references `users`):

```bash
psql "$NEW_DB_URL" -f migrate/auth-users.sql
psql "$NEW_DB_URL" -f migrate/auth-identities.sql
```

Verify:

```sql
select count(*) as users,
       count(encrypted_password) as with_password,
       count(email_confirmed_at) as confirmed
from auth.users;
```

### The caveats, which are real

1. **`auth.users` is Supabase's own table, and its columns change between
   platform versions.** If the two projects are on different Postgres or
   platform versions, a column may exist in one and not the other and the
   restore will error. `--column-inserts` makes this a clear per-column error
   instead of a silent mismatch. Check both projects' Postgres versions under
   **Project Settings → Infrastructure** and, if they differ, upgrade the old one
   first or write out the column list explicitly.
2. **Profiles are matched to logins by email**, not by user id. So even if the
   ids changed, the app would still work — but copy the ids anyway, because
   `audit_log.actor_user_id` references them.
3. **Test with one user before doing all of them.** Copy a single row for a test
   account, sign in on the new project, and only then copy the rest.
4. **If the hash copy cannot be made to work**, the fallback is a password reset
   for everyone: use the app's invite flow, tell people in advance, and expect
   support calls. It is a worse outcome, not a disaster — which is why you test
   with one user first.
5. **Never put these dumps anywhere but the restricted company folder, and
   delete them when the move is done.** A file of bcrypt hashes and every agent's
   email is the most sensitive artefact in this whole process.

---

## Phase 5 — The outage: freeze, final dump, restore

**The app is unavailable from here until phase 9.**

1. **Tell the team it is starting.**
2. **Freeze the old project.** Supabase (old) → **Authentication → Sign In /
   Providers → Email** → turn **Enable email provider** OFF. Existing sessions
   continue, but nobody new can sign in, so nothing is written mid-copy. (A
   blunter option is pausing the project, but then you cannot dump from it.)
3. **Final dumps**, repeating phases 3 and 4 with fresh files:

   ```bash
   npx supabase link --project-ref odiihjpbzarrxvoftnvd
   npx supabase db dump --linked -f migrate/final-schema.sql
   npx supabase db dump --linked --data-only -f migrate/final-public-data.sql
   pg_dump "$OLD_DB_URL" --data-only --table=auth.users --column-inserts -f migrate/final-auth-users.sql
   pg_dump "$OLD_DB_URL" --data-only --table=auth.identities --column-inserts -f migrate/final-auth-identities.sql
   ```

4. **Reset the new project's data** (the rehearsal rows are in the way) and
   restore the final dumps:

   ```bash
   npx supabase link --project-ref <new-company-ref>
   npx supabase db reset --linked        # re-applies migrations, empty tables
   psql "$NEW_DB_URL" -f migrate/final-public-data.sql
   psql "$NEW_DB_URL" -f migrate/final-auth-users.sql
   psql "$NEW_DB_URL" -f migrate/final-auth-identities.sql
   ```

5. **Re-run every verification query** from phases 3 and 4, and fix the reference
   sequence.

---

## Phase 6 — Edge Function

```bash
npx supabase link --project-ref <new-company-ref>
npx supabase secrets set SITE_URL=https://<project>.pages.dev
npx supabase functions deploy invite-agents
npx supabase secrets list
```

`SUPABASE_SERVICE_ROLE_KEY` is injected by the platform; you do not set it. The
function reads `SITE_URL` at startup, so **the deploy after the secret is
required**, not optional.

---

## Phase 7 — Auth configuration, SMTP and templates

On the **new** project, redo everything from
[RUNBOOK section 1.3 and 1.4](RUNBOOK.md#13-supabase-auth--url-configuration-production-project):

- **URL Configuration:** Site URL and both redirect URLs.
- **Email → sign-ups OFF**, confirm email ON, password minimum 10 with mixed case
  and digits.
- **Leaked password protection: ON.** It is available on Pro, and this is one of
  the reasons for moving.
- **Email templates:** paste in the Gladex invite and reset wording.
- **Custom SMTP: set it up now.** You are about to have all 156 agents on this
  project, and the built-in sender cannot carry that
  ([RUNBOOK 1.5](RUNBOOK.md#15-email-sending-for-the-pilot)). Then raise the
  limits under **Authentication → Rate Limits**.

---

## Phase 8 — Switch Cloudflare Pages

1. Pages project → **Settings → Environment variables → Production**.
2. Change `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the **new**
   project's values.
3. **Deployments → … on the latest → Retry deployment.** The values are compiled
   into the bundle and into the Content-Security-Policy in `dist/_headers`, so a
   redeploy is required — changing the variables alone does nothing.
4. When it finishes, confirm in the browser: F12 → **Network**, sign in, and
   check the requests go to the **new** ref.

---

## Phase 9 — Smoke test, then unfreeze

Work through [RUNBOOK section 3](RUNBOOK.md#3-deploy-the-app), and additionally:

- [ ] **Sign in as an agent using their existing password.** This is the test
      that matters most. If it fails, phase 4 did not work.
- [ ] Open an old quotation: the reference, the figures and the frozen rates are
      all unchanged.
- [ ] Create a new quotation; the reference continues the sequence rather than
      restarting.
- [ ] Copy Full Quotation and paste it: the layout is intact.
- [ ] `/audit` shows the history from before the move.
- [ ] Invite one test agent: the email arrives and the link points at the live
      URL.
- [ ] F12 → Console: no CSP errors.
- [ ] **Advisors → Security Advisor on the new project: zero errors.**

Then tell the team it is back.

---

## Phase 10 — Make the old project read-only, and keep it

**Do not delete the old project for at least 30 days.** It is your rollback.

1. Leave email sign-in disabled on it.
2. Supabase (old) → **Project Settings → General** → optionally **Pause
   project**, which keeps the data and stops it costing anything.
3. Put a dated note in the company folder saying what it was and when it was
   frozen.
4. After 30 days of the new project working, and with one final dump archived,
   delete it.

---

## Rollback plan

If phase 9 fails and cannot be fixed inside the window, **go back** rather than
debug with the team waiting.

1. Cloudflare Pages → **Settings → Environment variables → Production** → set
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` back to the **old**
   project.
2. **Deployments → Retry deployment.**
3. Supabase (old) → **Authentication → Email → Enable email provider** back ON.
4. Point the Edge Function back at the old project:

   ```bash
   npx supabase link --project-ref odiihjpbzarrxvoftnvd
   npx supabase functions deploy invite-agents
   ```

5. Smoke test. You are back where you started, in **about 15 minutes**.

**The one thing that cannot be rolled back** is any data written to the new
project after the switch. That is why the window is outside selling hours and why
the smoke test comes before telling anyone it is live: if you roll back after a
day of real use, that day's quotations are on the new project and would have to
be copied over by hand.

---

## Moving the GitHub repository

The code is not urgent to move — nothing breaks if it stays — but ownership
should follow the system.

1. Create a **Gladex** GitHub organisation.
2. Old repository → **Settings → General → Transfer ownership** → the new
   organisation. **GitHub redirects the old URL**, so existing clones and the
   Cloudflare connection keep working.
3. In the new organisation, add the second administrator and require 2FA.
4. **Re-authorise Cloudflare Pages:** the Pages project → **Settings → Builds &
   deployments → Git repository**. A transfer usually survives, but confirm the
   next push still triggers a build before trusting it.
5. If the `uat-e2e` workflow is in use, recreate the **uat** environment secrets
   — they do not transfer.
6. Update the clone URL in your local copy:

   ```bash
   git remote set-url origin https://github.com/<gladex-org>/ezquote-japan.git
   git remote -v
   ```

## Moving the Cloudflare Pages project

Cloudflare **cannot move a Pages project between accounts.** You recreate it,
which also means a new `*.pages.dev` subdomain unless you take the same project
name.

1. Create the company Cloudflare account; invite the second administrator; 2FA on
   both.
2. Create a new Pages project from the transferred repository, with the same
   settings as [RUNBOOK 1.1](RUNBOOK.md#11-cloudflare-pages--create-the-project)
   and the same Production and Preview variables.
3. **If the URL changes, three things must be updated to match** — this is the
   part that is easy to forget:
   - Supabase **Authentication → URL Configuration** (Site URL and redirect URLs)
   - the Edge Function: `npx supabase secrets set SITE_URL=...` **and redeploy**
   - the pilot URL in [RUNBOOK.md](RUNBOOK.md) and
     [PILOT-BRIEF.md](PILOT-BRIEF.md), and whatever the team has bookmarked
4. Keep the old Pages project running until the new URL is confirmed working,
   then delete it.

> If a custom domain (`quotes.gladex.com` or similar) is ever wanted, do it at
> this point rather than before: a custom domain makes the `pages.dev` URL
> irrelevant and means a future account move changes nothing for users. It was
> deliberately out of scope for the pilot.
