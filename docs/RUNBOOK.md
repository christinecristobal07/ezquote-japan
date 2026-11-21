# EZQUOTE Japan — operations runbook

Everything you need to deploy, change and recover the pilot. Every section is a
sequence you can follow without knowing the codebase.

**Pilot facts**

| Thing               | Value                                                             |
| ------------------- | ----------------------------------------------------------------- |
| App URL             | `https://<project>.pages.dev` — fill in after section 1 below     |
| Hosting             | Cloudflare Pages, free plan, connected to the GitHub repo         |
| Production database | Supabase free project `ezquote-japan`, ref `odiihjpbzarrxvoftnvd` |
| Preview database    | The separate UAT Supabase project (never production)              |
| Node                | 22                                                                |
| Supabase CLI        | Through `npx supabase` — nothing to install globally              |

**Two rules that matter more than the rest**

1. **Migrations are applied by a person, never automatically.** Take a manual
   dump first, dry-run, then push. If something is wrong, **fix forward** with a
   new migration — never edit or revert one that has already been applied.
2. **Preview deployments must point at the UAT project.** A preview build with
   production credentials would let anyone with a pull-request link write to the
   live database.

---

## Table of contents

1. [Go-live checklist (pilot production setup)](#1-go-live-checklist-pilot-production-setup)
2. [Free-plan limits you must plan around](#2-free-plan-limits-you-must-plan-around)
3. [Deploy the app](#3-deploy-the-app)
4. [Roll back the app](#4-roll-back-the-app)
5. [Apply a database migration](#5-apply-a-database-migration)
6. [Manual backup (weekly)](#6-manual-backup-weekly)
7. [Restore from a manual backup](#7-restore-from-a-manual-backup)
8. [Rotate keys](#8-rotate-keys)
9. [First pilot data load](#9-first-pilot-data-load)
10. [Bootstrap the Super Admin](#10-bootstrap-the-super-admin)
11. [Invite the pilot users](#11-invite-the-pilot-users)
12. [Common admin tasks](#12-common-admin-tasks)
13. [Monitoring](#13-monitoring)
14. [Known issues and deviations](#14-known-issues-and-deviations)

---

## 1. Go-live checklist (pilot production setup)

Do these in order. **Everything in this section is clicks in a dashboard, and is
yours to do** — nothing here is run from the codebase.

### 1.1 Cloudflare Pages — create the project

1. Sign in at <https://dash.cloudflare.com> (create a free account if needed).
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab → **Connect
   to Git**.
3. Authorise GitHub and pick the `ezquote-japan` repository. Grant access to
   that repository only, not all repositories.
4. **Set up builds and deployments:**
   - Production branch: `main`
   - Framework preset: **None** (do not pick Vite — the preset overrides the
     build command)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave blank
5. Expand **Environment variables (advanced)** and add, **for Production**:

   | Name                            | Value                                        |
   | ------------------------------- | -------------------------------------------- |
   | `NODE_VERSION`                  | `22`                                         |
   | `VITE_SUPABASE_URL`             | `https://odiihjpbzarrxvoftnvd.supabase.co`   |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The production project's **publishable** key |

   Get the key from Supabase → your project → **Project Settings → API keys** →
   the publishable (or legacy `anon`) key. **Never the secret / service_role
   key.** If you paste a secret key the app refuses to start, by design.

6. **Save and Deploy.** The first build takes two to three minutes.
7. When it finishes, note the URL — `https://<project>.pages.dev`. **Write it
   into the table at the top of this file and commit that change**, because
   several later steps need it.

### 1.2 Cloudflare Pages — preview environment variables

Previews must not touch the live database.

1. The Pages project → **Settings** → **Environment variables**.
2. Switch to the **Preview** tab and add:

   | Name                            | Value                                 |
   | ------------------------------- | ------------------------------------- |
   | `NODE_VERSION`                  | `22`                                  |
   | `VITE_SUPABASE_URL`             | The **UAT** project URL               |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The **UAT** project's publishable key |

3. **Verify it took effect.** Open any pull request, wait for the preview
   deployment, open the preview URL, then press F12 → **Network**, and sign in.
   Every request to `supabase.co` must go to the **UAT** ref, not
   `odiihjpbzarrxvoftnvd`. If you see the production ref, the Preview variables
   are not set — stop and fix them before merging anything.

### 1.3 Supabase Auth — URL configuration (production project)

Supabase dashboard → your project → **Authentication**.

1. **URL Configuration:**
   - **Site URL:** `https://<project>.pages.dev`
   - **Redirect URLs** — add both:
     - `https://<project>.pages.dev/auth/set-password`
     - `http://localhost:5173/auth/set-password`

   The second one is for local development. Without the first one, every invite
   and password-reset link lands on an error page.

2. **Sign In / Providers → Email:**
   - **Allow new users to sign up: OFF.** Agents are invited; nobody signs
     themselves up.
   - **Confirm email: ON**
   - **Minimum password length: 10** or more
   - **Password requirements:** require lower case, upper case and digits

3. **Leaked password protection** is a Pro feature and is unavailable on the
   free plan. Record it as an accepted gap for the pilot (section 14).

### 1.4 Supabase Auth — email templates

**Authentication → Emails → Templates.** Edit **Invite user** and **Reset
password** so they read as Gladex rather than as Supabase. Keep `{{ .ConfirmationURL }}`
exactly as it is — that is the link.

Suggested invite wording:

> **Subject:** Your EZQUOTE Japan access
>
> Hi,
>
> You have been given access to EZQUOTE Japan, the quotation tool for our Japan
> packages.
>
> Set your password here: {{ .ConfirmationURL }}
>
> The link works once and expires in 24 hours. If it has expired, reply to this
> email and we will send a new one.
>
> Please do not share your login. Every quotation records who created it.
>
> Gladex Travel & Tours

Suggested reset wording:

> **Subject:** Reset your EZQUOTE Japan password
>
> Hi,
>
> Someone asked to reset the password for this email address on EZQUOTE Japan.
>
> If that was you: {{ .ConfirmationURL }}
>
> If it was not you, ignore this email — nothing has changed.
>
> Gladex Travel & Tours

### 1.5 Email sending for the pilot

The built-in Supabase sender is rate-limited to **a few emails per hour** and is
explicitly not for production use.

- **For the pilot this is fine.** You are inviting a handful of management and
  pilot users, one at a time. See [section 11](#11-invite-the-pilot-users).
- **Custom SMTP is REQUIRED before inviting all 156 agents.** Do not attempt a
  bulk invite on the built-in sender: most of the emails will be dropped, the
  profiles will show as invited, and you will not know which agents never got a
  link. Set up SMTP (Resend, SendGrid, Amazon SES or the Gladex mail provider)
  under **Project Settings → Authentication → SMTP Settings**, then raise the
  rate limit under **Authentication → Rate Limits**.

### 1.6 Edge Function — invite-agents

The function emails invitations. It needs to know the app URL, both for the link
in the email and for its CORS allow-list.

Run these on your machine, from the repository root:

```bash
npx supabase link --project-ref odiihjpbzarrxvoftnvd
npx supabase secrets set SITE_URL=https://<project>.pages.dev
npx supabase functions deploy invite-agents
```

Then check it:

```bash
npx supabase secrets list
npx supabase functions list
```

`SITE_URL` is read at startup for both the redirect and the
`Access-Control-Allow-Origin` header, so **the function must be redeployed after
the secret changes** — setting the secret alone is not enough.

### 1.7 Supabase Advisors

**Advisors → Security Advisor** and **Advisors → Performance Advisor**.

- **Security Advisor must show zero errors.** If it shows any, stop and fix them
  before inviting anyone.
- Record any warnings you accept, with the reason, in section 14 of this file.
  Expected ones:
  - _Leaked password protection disabled_ — not available on the free plan.
  - _Function search_path_ warnings for the `app` schema helpers — these are
    intentional: every one sets `search_path = ''` explicitly and is
    `SECURITY DEFINER` so RLS policies can call it without recursion.

### 1.8 Access and accounts

- **At least two people** must have dashboard access to the Supabase project and
  to the Cloudflare account. One person holding the only access is the single
  biggest risk in this setup: if they are unreachable, nobody can restore a
  paused project or roll back a deployment.
  - Supabase: **Organization → Team → Invite member**, role Owner or
    Administrator.
  - Cloudflare: **Manage Account → Members → Invite**.
- **Turn on two-factor authentication** on Supabase, Cloudflare and GitHub, for
  every person with access.
- **Keep credentials in a password manager** shared with those people — not in
  chat, not in email, not in a spreadsheet. That includes the Supabase secret
  key, which must never be pasted anywhere near the front-end code.

---

## 2. Free-plan limits you must plan around

The pilot runs entirely on free plans. These are not bugs; they are what free
means. Management should know all four before the pilot starts.

### 2.1 The project pauses after about 7 days of inactivity

A free Supabase project is **paused after roughly a week with no database
activity**. While paused the app cannot sign anyone in — logins fail and the
screen shows a connection error.

**If nobody opens the app for a week during the pilot, expect to find it paused.**
Tell management this in advance so a paused project is not read as a broken
system.

**To restore it:** Supabase dashboard → the project → the banner says it is
paused → **Restore project**. It takes a few minutes, up to about twenty for a
larger database, and **no data is lost**. Nothing needs redeploying afterwards.

To avoid it during the pilot, have someone sign in and open a quotation once a
week. [Section 6](#6-manual-backup-weekly) gives you a weekly task anyway, and
that counts as activity.

### 2.2 No automatic backups

The free plan has **no daily backups and no point-in-time recovery**. If data is
lost, there is nothing to restore from unless you made a dump yourself.

**So a manual weekly backup is mandatory for the pilot.** See
[section 6](#6-manual-backup-weekly). Point-in-time recovery is a paid add-on
and is part of the case for moving to a company project.

### 2.3 Quotas against expected pilot usage

| Resource                   | Free plan       | Expected for the pilot                                                                                                             |
| -------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Database size              | 500 MB          | Far under. 156 agent profiles plus a few hundred quotations is a few MB; snapshots are the largest column at roughly 20–50 KB each |
| Egress                     | 5 GB / month    | Far under. The bundle is about 231 KB gzipped and cached forever by fingerprint; API responses are small JSON                      |
| Monthly active users       | 50,000          | Far under, at well below 200 people                                                                                                |
| Storage                    | 1 GB            | Unused — the app stores no files                                                                                                   |
| Edge Function invocations  | 500,000 / month | Far under; one per invite batch                                                                                                    |
| Cloudflare Pages builds    | 500 / month     | Comfortable at a few deployments a week                                                                                            |
| Cloudflare Pages bandwidth | Unlimited       | —                                                                                                                                  |

**Nothing in the pilot is near a quota.** The two real constraints are the
pausing and the absent backups, both above.

### 2.4 Not available on the free plan

- Automatic daily backups and point-in-time recovery
- Leaked-password protection
- Custom domains on Supabase, read replicas, log retention beyond one day

---

## 3. Deploy the app

Cloudflare Pages deploys on every push to `main`. There is nothing to run.

1. Merge the pull request into `main` (CI must be green first).
2. Cloudflare dashboard → **Workers & Pages** → the project → **Deployments**.
   Watch the build; it takes two to three minutes.
3. **Smoke test the production URL:**
   - Open `https://<project>.pages.dev` — the login page appears.
   - Sign in. The dashboard loads.
   - Open an existing quotation. The figures are unchanged.
   - Create a quotation, pick a city and a service, and check the live total.
   - Open the quotation text and press **Copy Full Quotation**; paste it
     somewhere and confirm the layout survived.
   - Press F12 → **Console**. There must be no red errors, and in particular no
     `Refused to connect` or `Content Security Policy` messages.
   - Check the build stamp in the footer matches the commit you just merged.

If the console shows a CSP error naming `supabase.co`, the `VITE_SUPABASE_URL`
in Cloudflare does not match the project the app is talking to. Fix the variable
and redeploy — see [troubleshooting in the README](../README.md#troubleshooting).

---

## 4. Roll back the app

The previous build is still there; rolling back is a click and takes seconds.
**This rolls back the app only, never the database.**

1. Cloudflare dashboard → **Workers & Pages** → the project → **Deployments**.
2. Find the last deployment that was known good. Check its commit SHA against
   the build stamp a user reported.
3. The **…** menu on that row → **Rollback to this deployment** → confirm.
4. Hard-refresh the production URL (Ctrl+Shift+R) and confirm the footer stamp
   is the older one.

**If the bad deployment also applied a migration, rolling back the app is not
enough** — the old code may not understand the new schema. Fix forward instead:
write a migration that corrects the schema, and deploy normally.

---

## 5. Apply a database migration

Migrations are applied by a person. Allow fifteen minutes and do not do it while
agents are quoting.

```bash
# 0. Be on the right project and up to date.
cd /path/to/ezquote-japan
git checkout main && git pull
npm ci
npx supabase link --project-ref odiihjpbzarrxvoftnvd

# 1. BACK UP FIRST. There are no automatic backups. See section 6.
npx supabase db dump --linked -f backups/pre-migration-$(date +%Y%m%d-%H%M).sql
npx supabase db dump --linked --data-only -f backups/pre-migration-$(date +%Y%m%d-%H%M)-data.sql

# 2. Preview. This contacts the project but changes nothing.
npx supabase db push --linked --dry-run

# 3. Read the list it prints. If it names a migration you do not expect, STOP.

# 4. Apply.
npx supabase db push --linked

# 5. Regenerate the TypeScript types and commit them.
npm run db:types
git add src/data/database.types.ts
git commit -m "Regenerate database types after <migration name>"

# 6. Verify, then smoke test the app (section 3).
npm run db:test
```

**If a migration fails halfway**, Postgres has rolled back that statement but
earlier migrations in the same push may have applied. Do not edit the failed
migration and push again — the history would then disagree with production.
Write a **new** migration that gets production to the state you want, and push
that. Check what actually landed with:

```bash
npx supabase migration list --linked
```

---

## 6. Manual backup (weekly)

**Mandatory on the free plan.** Put it in someone's calendar for the same day
each week. It also counts as activity, so it helps keep the project from
pausing.

```bash
cd /path/to/ezquote-japan
npx supabase link --project-ref odiihjpbzarrxvoftnvd

STAMP=$(date +%Y%m%d)

# Schema: tables, functions, triggers, policies.
npx supabase db dump --linked -f backups/ezquote-$STAMP-schema.sql

# Data only: every row in the public schema.
npx supabase db dump --linked --data-only -f backups/ezquote-$STAMP-data.sql

# Roles, if any have been changed by hand. Usually tiny.
npx supabase db dump --linked --role-only -f backups/ezquote-$STAMP-roles.sql
```

Then:

1. Check the files are not empty and that the data dump mentions `profiles` and
   `quotations`:

   ```bash
   ls -lh backups/
   grep -c "INSERT INTO" backups/ezquote-$STAMP-data.sql
   ```

2. **Move them into the restricted company folder** — the shared drive folder
   that only Admin and Product Development can open.
3. Delete the local copies.

> **These files contain every agent's name and email address.** Treat them as
> personnel data: a restricted folder, never a personal device, never a chat
> attachment, and **never committed to Git** (`backups/` is gitignored, but the
> rule is the point, not the ignore file).

Keep the last 8 weekly backups and the one before each migration.

**Test a restore once, early in the pilot** — a backup you have never restored
is a guess. Restore the latest dump into the UAT project
([section 7](#7-restore-from-a-manual-backup)) and confirm the counts match.
Record the date you did this in [HANDOVER.md](HANDOVER.md).

---

## 7. Restore from a manual backup

> Restoring over a live database replaces data. Read the whole section first,
> and practise on the UAT project.

### Into the UAT project (the safe rehearsal, and how to test a backup)

```bash
# The UAT project ref, NOT production.
npx supabase link --project-ref <uat-ref>

# Schema first, then data.
npx supabase db reset --linked              # empties the UAT database
psql "$UAT_DB_URL" -f backups/ezquote-<stamp>-schema.sql
psql "$UAT_DB_URL" -f backups/ezquote-<stamp>-data.sql
```

Get `UAT_DB_URL` from the UAT project → **Connect** → the direct connection
string. Then verify:

```sql
select count(*) from public.profiles;     -- expect 156 after the pilot load
select count(*) from public.quotations;
select count(*) from public.service_rate_versions where status = 'published';
```

### Into production (only in a real emergency)

1. **Stop the bleeding first.** Roll the app back
   ([section 4](#4-roll-back-the-app)) so nothing writes more bad data.
2. **Take a dump of the damaged state anyway.** You may need it to work out what
   was lost, and it is the only record of anything written since the backup.
3. Decide the smallest restore that fixes it. Restoring one table's rows is
   almost always better than replacing the database:

   ```bash
   # Pull just the table you need out of the data dump, then review it before applying.
   grep -A100000 "COPY public.quotation_adjustments" backups/ezquote-<stamp>-data.sql > /tmp/one-table.sql
   ```

4. Apply through the SQL Editor or `psql`, inside a transaction, and check the
   counts before committing.
5. If a full restore really is needed, do the UAT rehearsal above **first**, on
   the same dump, so you know it works.
6. Afterwards: `npm run db:types`, `npm run db:test`, and the full smoke test.

---

## 8. Rotate keys

### The publishable key (safe, no urgency)

The publishable key is designed to be public — it is in the browser bundle — so
rotate it only if asked to, not out of worry.

1. Supabase → **Project Settings → API keys** → create a new publishable key.
2. Cloudflare Pages → **Settings → Environment variables** → update
   `VITE_SUPABASE_PUBLISHABLE_KEY` for **Production** (and **Preview**, with the
   UAT project's key).
3. **The value is compiled into the bundle, so a redeploy is required.**
   Deployments → **…** on the latest → **Retry deployment**.
4. Update your local `.env` and the `.env.uat` of anyone running the e2e tests.
5. Revoke the old key once the new deployment is live and login works.

### The secret / service_role key (urgent if exposed)

This key bypasses Row Level Security. If it has ever been pasted into a browser,
a chat, a commit or a screenshot, **treat it as compromised and rotate now.**

1. Supabase → **Project Settings → API keys** → rotate the secret key.
2. The only thing that uses it is the Edge Function, and Supabase injects it
   automatically as `SUPABASE_SERVICE_ROLE_KEY`. Redeploy so the function picks
   up the new one:

   ```bash
   npx supabase functions deploy invite-agents
   ```

3. **Nothing in the front end uses it**, so no Cloudflare variable changes and
   no app redeploy. `src/lib/env.ts` refuses to start if such a key is ever put
   in `VITE_SUPABASE_PUBLISHABLE_KEY`, and `npm run check:build-secrets` fails
   the build if one reaches `dist/`.
4. Check the audit log and Supabase logs for anything done with the old key.

### If `SITE_URL` changes

```bash
npx supabase secrets set SITE_URL=https://<new-url>
npx supabase functions deploy invite-agents    # required: it is read at startup
```

Also update Supabase **Authentication → URL Configuration** (Site URL and
Redirect URLs) to match, or invite links will break.

---

## 9. First pilot data load

This loads the 156 agent profiles and the rate data from the Excel workbook. It
is a one-time job, and **it is the FR-017 deviation**: in-app rate upload is
Phase 2, so for now rates arrive through this script.

```bash
cd /path/to/ezquote-japan
```

1. **Put the workbook where the script expects it.** Copy the current batch file
   into `scripts/seed/data/`. That folder is gitignored — the workbook must never
   be committed.

2. **Make the agent fixes in the workbook first.** The last run produced a fix
   list of 45 rows: agents with a missing email, a placeholder Rate My Service
   link, or a malformed one. Fixing them in the workbook is much less work than
   fixing them one at a time in the app afterwards.

3. **Build the seed:**

   ```bash
   npm run seed:build
   ```

   It writes `scripts/seed/out/seed.sql` and prints a summary.

4. **Review the fix list before applying anything.** The script prints it and
   writes it beside the SQL. Expected from the last run: **156 profiles from 158
   rows**, 22 needing an email, 11 with a placeholder link, 13 with an invalid
   "bad" link, 12 with an invalid "great" link, 43 with some issue, and **45
   rows on the fix list**.

   One known divergence: JUSTINE's truncated `?surveyAnswerId` link is rejected
   rather than accepted. **That was a deliberate decision** — a truncated survey
   link would send clients to a broken page. Her links need re-entering by hand.

5. **Back up first** ([section 6](#6-manual-backup-weekly)), then apply:

   ```bash
   npm run seed:apply
   ```

6. **Verify the counts:**

   ```sql
   select count(*) from public.profiles;                                   -- 156
   select count(*) from public.profiles where is_active;
   select count(*) from public.profiles where 'needs_email' = any(data_issues);  -- 22
   select count(*) from public.profiles where data_issues <> '{}';         -- 43
   select count(*) from public.agent_survey_links;
   select count(*) from public.cities;
   select count(*) from public.hotels;
   select count(*) from public.services;
   select count(*) from public.service_rate_versions where status = 'published';
   select currency, php_per_unit from public.fx_rates order by created_at desc limit 3;
   ```

7. In the app, open **Agents** and work through the fix list: anyone flagged
   needs an email or working survey links before they can be invited.

---

## 10. Bootstrap the Super Admin

Someone has to be the first manager, and they cannot be invited by a manager who
does not exist yet.

1. Make sure the profile exists with the right role. In the Supabase **SQL
   Editor**:

   ```sql
   -- Check first.
   select id, full_name, email, role, is_active
   from public.profiles
   where email = 'tinegladex@gmail.com';

   -- If the row exists but the role is wrong:
   update public.profiles
   set role = 'super_admin', is_active = true
   where email = 'tinegladex@gmail.com';

   -- If there is no row at all:
   insert into public.profiles (full_name, email, role, is_active)
   values ('Christine Cristobal', 'tinegladex@gmail.com', 'super_admin', true);
   ```

2. Create the login: **Authentication → Users → Add user → Send invitation**,
   using **exactly the same email**. Profiles and logins are matched by email, so
   a typo creates a second, inactive profile instead.

3. Open the link from the email, set a password, and sign in. The sidebar should
   show every section including **Audit log**.

4. Confirm the role took: the avatar menu shows **Super Admin**.

Everyone else is invited from inside the app ([section 11](#11-invite-the-pilot-users)).

---

## 11. Invite the pilot users

**One at a time.** The built-in email sender allows only a few per hour
([section 1.5](#15-email-sending-for-the-pilot)); a bulk invite will silently
drop most of them.

1. Sign in as a manager → **Agents**.
2. Find the person. If they are not there, **Add agent** — full name, email,
   role, and a supervisor if they are a sales agent.
3. Check the row has no data-issue badge. An agent with no email cannot be
   invited; one with a broken survey link will ship a broken link in every
   quotation they send.
4. **Invite** on that row. The row then shows as invited with a timestamp.
5. **Wait for them to confirm they received it before inviting the next person.**
   If an invite does not arrive within ten minutes, you have probably hit the
   rate limit — wait an hour and resend rather than pressing the button again.
6. Record who has been invited and who has signed in. The **Agents** screen shows
   login status; the dashboard and `/audit` show activity.

For the pilot, invite in this order: the Super Admin (already done in
section 10), Product Development, Admin, one Sales Supervisor, then two or three
sales agents.

> **Do not invite all 156 agents until custom SMTP is configured.** That is a
> hard prerequisite, not a recommendation.

---

## 12. Common admin tasks

All of these are done in the app by a manager. None needs a developer — that is
the maintainability requirement, and it is met.

### A new agent

**Agents → Add agent.** Full name, email, role, supervisor if a sales agent.
Then add their Rate My Service links (the "bad" and "great" survey URLs) and
**Invite**. Links are per agent and appear in that agent's quotations only.

### Deactivate an agent

**Agents** → the agent → untick **Active** → save. They are signed out and
cannot sign back in. **Their quotations are kept** — a quotation is a record of
what was offered to a client, so nothing is deleted. Do this the same day
somebody leaves.

### A new rate version

Rates are versioned, and a published version can never be edited. A price change
means a new version.

1. **Rates & FX** → the service → **New draft**. The draft starts as a copy of
   the published version.
2. Edit the group-size tiers and any add-ons. A version cannot be published
   without at least one tier.
3. Set **Effective from** and, if the operator gave one, **Valid until**.
4. **Publish.** Agents see it immediately — but **only in quotations created
   from now on**. Existing quotations keep their own frozen rates.
5. The old version becomes inactive automatically. Nothing is deleted, and the
   whole change is in the audit log.

### An FX change

**Rates & FX → FX rates.** Enter the new PHP-per-unit figure for JPY (or USD)
and save. FX is **append-only**: the new row is added and the newest effective
row wins; the old one stays on the record.

The default is **PHP 0.50 per JPY**, with **USD 67** kept for USD charges. Only
Product Development, Admin and Super Admin can change it.

**Existing quotations do not change.** If a quote needs today's rate, open it and
use **Requote with current rates**, which makes a new quotation and leaves the
original alone.

### A new tour or transfer

1. **Content → Services → Add service.** Name, type (tour or transfer), city,
   operator, and the itinerary and inclusion text.
2. **Consumes a day** — on for a day tour, off for an airport transfer, because
   an airport transfer should not lengthen the trip.
3. For a transfer, set **one way** or **round trip** (the default is round trip).
4. Save, then go to **Rates & FX** and give it a rate version with tiers
   ([above](#a-new-rate-version)). Until it has a published rate it shows as
   "No rate yet" and cannot be quoted.

### Content edits

**Content →**

- **Services** — names, itinerary text, inclusion text
- **Hotels** — reference list by city and star rating
- **Package text** — inclusions, exclusions, notes, requirements, remarks,
  including the ones that only appear when a particular service is selected
- **Reference** — cities, operators, booking-site links
- **Settings** — the default services on a new quotation, and the itinerary
  arrival, departure and free-day wording

Content changes take effect **immediately, including on existing quotations**,
because text is not part of the frozen rate snapshot. Rates and FX are the
things that are frozen.

---

## 13. Monitoring

Nothing here needs a schedule beyond a glance once a week during the pilot.

### Supabase

- **Logs → Postgres** — database errors. A spike in `42501` means someone is
  hitting a permission wall; the app is probably showing them a confusing
  message.
- **Logs → Auth** — failed sign-ins, invites sent, password resets. This is
  where you confirm an invite actually went out.
- **Logs → Edge Functions** — every `invite-agents` call and its result.
- **Reports → Database** — size and connections, against
  [the quotas](#23-quotas-against-expected-pilot-usage).
- **Advisors** — re-check after every migration.

Free-plan logs are kept for about a day, so look the same day a problem is
reported.

### Cloudflare

- **Workers & Pages → the project → Deployments** — build logs. A failed build
  means `main` has something CI did not catch; the previous deployment is still
  live.
- **Analytics** — requests and bandwidth.

### In the app

- **`/audit`** (managers only) — every rate, FX, markup, agent and Change Rate
  change, with who and when, exportable to CSV. This is the first place to look
  when someone asks "who changed this price?".
- **The dashboard** — recent quotations, and the week's volume for managers.

### When a user reports a problem

Ask for three things: **the build stamp in the footer**, the quotation reference,
and roughly when it happened. Those turn a vague report into something you can
find in the logs.

---

## 14. Known issues and deviations

From [the UAT report](uat/UAT-report.md), where the full detail is. Seven items
need sign-off; the first two are the ones that affect what the pilot can show.

| #   | Item                                                                                                                                                                                                                                                      | Owner               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | **FR-017 in-app rate upload is deferred to Phase 2.** Rates load through the seed script ([section 9](#9-first-pilot-data-load)); Product Development can edit every rate by hand in the app. Needs management sign-off.                                  | Management          |
| 2   | **Change Rate is limited to the quote owner and managers.** A supervisor views a team member's quote but cannot adjust it. BRD 4.5 says "any user with portal access", which is met per user for their own quotes. Say the word and it is a small change. | Operations          |
| 3   | **Sneak-in markup is PHP 0**, pending a real value.                                                                                                                                                                                                       | Product Development |
| 4   | **Booking-site URLs** are seeded from the workbook and unreviewed.                                                                                                                                                                                        | Product Development |
| 5   | **Transfer direction defaults to round trip**, pending Ops.                                                                                                                                                                                               | Operations          |
| 6   | **One seeded Sapporo tour has no published rate**, so it cannot be quoted. It shows "No rate yet" rather than a wrong figure.                                                                                                                             | Product Development |
| 7   | **Japan remarks are still to be provided.** The Hong Kong remarks from the workbook were dropped as agreed.                                                                                                                                               | Product Development |

### Accepted platform warnings

| Warning                                      | Why it is accepted                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaked password protection disabled          | Pro feature, unavailable on the free plan. Mitigated by a 10-character minimum with mixed case and digits.                                                  |
| No automatic backups / no PITR               | Free plan. Mitigated by the mandatory weekly manual backup ([section 6](#6-manual-backup-weekly)).                                                          |
| `uuid` advisory via `exceljs` in `npm audit` | `exceljs` is a devDependency used only by the seed script and never bundled. `npm audit --omit=dev` is clean. The only fix offered is a breaking downgrade. |
| Main JS chunk is 814 KB (231 KB gzipped)     | Above Vite's 500 KB advisory but not a stated requirement. Code-splitting the admin routes is a later improvement.                                          |

### Still to be executed

31 end-to-end specs are written and skip themselves until a UAT Supabase project
and five test users exist. See
[UAT report section 7](uat/UAT-report.md#7-what-is-not-yet-executed).
