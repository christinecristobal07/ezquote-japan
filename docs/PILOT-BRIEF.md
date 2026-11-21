# EZQUOTE Japan — pilot brief

**For: Gladex Travel & Tours management · 21 November 2026 · v1.0.0-pilot**

---

## What this is

EZQUOTE Japan replaces the Excel quotation workbook for our Japan land packages.
An agent picks the cities, tours, transfers and hotels; the system works out the
selling rate for every room category and produces quotation text they paste
straight into Messenger, Viber or email.

**What it is for you to judge:** whether this is better than the workbook for the
people who use it every day, and whether we commit to it.

**What the pilot covers**

- Japan land arrangements, operator rates in yen, converted at a rate only
  Product Development can change
- Per-person pricing by group-size band, for Quad, Triple, Twin, Solo, Child and
  Sneak-in
- Join-in (per-person) pricing. Private-vehicle packages are Phase 2
- Hotel costs, Change Rate adjustments, airfare, markups and the round-up-to-99
  rule, all as in the workbook
- Copy-ready quotation text with the agent's own name and Rate My Service links
- Quotation history, so every quote can be found and re-sent, and requoting at
  current rates
- Role-based access: agents see their own quotes, supervisors their team's, and
  managers everything, with every rate change logged

---

## The pilot URL

**`https://<project>.pages.dev`**

Open it in Chrome or Edge, on a computer or a phone. There is nothing to install.

## How to log in

1. You will get an email titled **"Your EZQUOTE Japan access"**.
2. Click the link and set a password. The link works once and expires in 24
   hours — if it has expired, ask for another.
3. After that, sign in at the URL above with your email and that password.

**Do not share a login.** Every quotation records who created it, and the agent's
name and feedback links go out on everything they send.

A short guide is attached for each audience:
[sales agents](USER-GUIDE-SALES.md) and
[Product Development](USER-GUIDE-PRODUCT-DEV.md).

---

## What to test

Please try to break it on real work rather than on test data.

1. **Quote a package you have recently sold by hand, then compare the figures.**
   This is the single most valuable thing you can do. If they differ, we want to
   know which is right.
2. **Check the Solo rate.** For Solo you enter the per-person **twin** rate and
   the system doubles it. Confirm that matches how we price Solo today.
3. **Copy a quotation and paste it** into Messenger, Viber, Gmail and Outlook, on
   a computer and on a phone. Tell us if the spacing, line breaks or emojis come
   out wrong anywhere.
4. **Try the awkward cases:** a 7-day trip, a group of thirty, a child and a
   sneak-in on the same booking, a hotel that is not on our list.
5. **Change an exchange rate** (Product Development) and confirm that existing
   quotations keep their original figures while a new quotation uses the new rate.
   This is deliberate and is the main reason for building it this way.
6. **Check that an agent sees only their own quotations**, a supervisor sees their
   team's read-only, and the feedback links on a quotation are that agent's own.
7. **Use it for a full day of real quoting** and tell us what was slower than the
   workbook. That matters as much as anything being wrong.

---

## Known limitations

These are consequences of running a pilot on free accounts. None of them is a
defect, and all of them go away if we commit to the system.

**1. The database pauses after about a week of no use.**
A free Supabase project is suspended after roughly seven days with no activity.
The app then cannot sign anyone in and shows a connection error. **If nobody uses
it for a week, expect to find it asleep** — restoring it takes a few minutes from
the dashboard and **no data is lost**. Please do not read this as the system
breaking.

**2. There are no automatic backups.**
The free plan has no daily backups and no point-in-time recovery. We take a
**manual backup every week** and store it in a restricted company folder, because
it contains agents' names and emails. Automatic daily backups come with the paid
plan.

**3. Email is rate-limited, so we invite people one at a time.**
The built-in sender allows only a few emails an hour. That is fine for the
handful of pilot users. **Before all 156 agents can be invited we need a proper
email service configured** — a small setup task, but a hard prerequisite.

**4. Uploading a rate sheet is not in this version.**
Rates were loaded once from the workbook by script. Product Development can edit
every rate, exchange rate and markup in the app, by hand, without a developer —
so nothing is blocked. An in-app upload screen is Phase 2 and **needs your
sign-off** to schedule.

**5. A supervisor can view a team member's quotation but not adjust it.**
The BRD says "any user with portal access" may enter a Change Rate amount, which
is met for each user's own quotes. If supervisors should also be able to adjust
their team's, tell us — it is a small change.

**6. Five smaller items are waiting on us, not on the software:** the Sneak-in
markup is set to zero pending a real value; the booking-site links are unreviewed;
transfer direction defaults to round trip pending Operations; one Sapporo tour has
no price so it cannot be quoted; and the Japan-specific remarks have not been
supplied.

The full detail, with what was tested and how, is in the
[UAT report](uat/UAT-report.md): **15 of 17 acceptance scenarios pass
automatically, nothing fails, and 19 of 20 functional requirements are met.**

---

## How to give feedback

Tell any of us, however is easiest — a message is fine. To make something
findable, please include:

1. **The small grey version number at the very bottom of the page** (it looks
   like `v1.0.0-pilot · a1b2c3d`)
2. **The quotation reference**, if it concerns one (like `JPN-2026-000123`)
3. **Roughly when it happened**

With those three we can find it in the logs. Without them we usually cannot,
because the pilot keeps only a day of logs.

A screenshot helps. So does "this was slower than the workbook" — that is
feedback, not a complaint.

---

## The decision we need from you

**Do we move EZQUOTE Japan onto a Gladex company account and a paid plan?**

Right now the system sits in a personal Supabase account on a free plan. That was
the right way to build a pilot cheaply. It is the wrong way to run something the
sales team depends on, for one reason above all: **if one person is unreachable,
nobody else can restore the database, roll back a bad release or rotate a key.**

What moving gives us:

| Now (free, personal)           | After (Pro, company)                  |
| ------------------------------ | ------------------------------------- |
| Pauses after a week unused     | Always on                             |
| No automatic backups           | Daily backups, point-in-time recovery |
| One person's account           | Company-owned, several administrators |
| Email limited to a few an hour | Proper email service — all 156 agents |
| Leaked-password checking off   | On                                    |

**Cost: about USD 25 a month**, plus a small amount for email. The plan is written
and ready: [MIGRATION-TO-COMPANY.md](MIGRATION-TO-COMPANY.md). It is **about an
hour of downtime on a Sunday**, agents keep their existing passwords, and it is
reversible in fifteen minutes if anything goes wrong.

**What we need:** approval to create the company accounts and schedule the move.
Once approved we also need sign-off on the two Phase 2 items — in-app rate upload
and whether supervisors should be able to adjust their team's quotes.
