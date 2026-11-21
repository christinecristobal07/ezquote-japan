# EZQUOTE Japan — guide for Product Development and Admin

You own the numbers and the words. Everything in this guide is done in the app;
none of it needs a developer.

**Who this is for:** Product Development, Admin and Super Admin. The three roles
see the same screens.

---

## Contents

1. [The one rule to understand first](#1-the-one-rule-to-understand-first)
2. [Rates: draft to published](#2-rates-draft-to-published)
3. [Exchange rates](#3-exchange-rates)
4. [Markups](#4-markups)
5. [Tours and transfers](#5-tours-and-transfers)
6. [Hotels](#6-hotels)
7. [Package text](#7-package-text)
8. [Reference data and settings](#8-reference-data-and-settings)
9. [Agents and invites](#9-agents-and-invites)
10. [The audit log](#10-the-audit-log)
11. [What happens to existing quotes when I change X](#11-what-happens-to-existing-quotes-when-i-change-x)

---

## 1. The one rule to understand first

**Rates are frozen into each quotation. Words are not.**

When an agent creates a quotation, the app takes a copy of every rate it might
need — the exchange rates, every published operator price, every markup — and
stores it inside that quotation.

So:

- **Change a rate, an exchange rate or a markup** → only quotations created
  **from that moment on** use the new figure. Every existing quotation keeps what
  it was created with.
- **Change inclusions, exclusions, notes, remarks, a service name or itinerary
  text** → the change appears **immediately, everywhere**, including on quotations
  created last month.

This is deliberate. A price an agent has already sent a client must not move
underneath them. A typo in the inclusions should be fixed everywhere at once.

[Section 11](#11-what-happens-to-existing-quotes-when-i-change-x) is the full
table. If you only read one thing in this guide, read that.

---

## 2. Rates: draft to published

**Rates & FX** in the sidebar.

A rate lives in a **version**. A published version can never be edited — a price
change means a new version. That is what makes it possible to say exactly what any
quotation was priced at.

```
draft  →  published  →  inactive
```

- **Draft** — yours to edit. **Agents cannot see it at all**, so a half-finished
  price can never be quoted.
- **Published** — live, and locked. Agents' new quotations use it.
- **Inactive** — superseded. Kept, because old quotations reference it.

### Creating a new rate version

1. **Rates & FX** → click the service.
2. **New draft.** It starts as a copy of the current published version, so you
   are editing figures rather than retyping them.
3. Set the **currency** — JPY or USD, whichever the operator quotes in. Each gets
   converted at its own exchange rate.
4. Fill in the **group-size tiers** (below).
5. **Effective from** — the date it starts applying. **Valid until** — the
   operator's expiry, if they gave one. **After that date the rate stops being
   used in new quotations automatically**, which is how an expired price stops
   being sold without anybody remembering to remove it.
6. Add any **add-ons** — entrance tickets and the like. Give each a name and an
   amount in the operator's currency. Add-ons are **optional and off by default**;
   the agent ticks them per quotation.
7. **Publish.**

### Group-size tiers

Tiers are the per-person price at different party sizes. The band is chosen by the
**total number of travellers in the quotation, children included**.

| Min pax | Max pax | Amount (operator currency) |
| ------- | ------- | -------------------------- |
| 1       | 1       | 50,000                     |
| 2       | 6       | 10,850                     |
| 7       | 9       | 9,450                      |
| 10      | 18      | 8,889                      |

The editor checks your work as you type and will not let you publish:

- **overlapping bands** — 2–6 and 5–9 would make the price ambiguous
- **gaps** — if nothing covers 7 travellers, a party of 7 cannot be quoted
- **a version with no tiers at all**

Fix what it flags before publishing. A warning here is cheaper than a wrong quote.

You can add separate **child** tiers. If a service has none, children are priced
at the adult tier for the same band.

### Publishing

**Publish** asks you to confirm, because it cannot be undone. On publish:

- the previous version becomes **inactive** automatically
- the new one applies to **new quotations only**
- the whole change is written to the audit log with your name

**Before you publish, check:** the currency is right, the tiers have no gaps or
overlaps, the effective date is what you mean, and the amounts are in the
operator's currency — not pesos.

---

## 3. Exchange rates

**Rates & FX → FX rates.**

| Currency | Default      | Used for                     |
| -------- | ------------ | ---------------------------- |
| JPY      | **PHP 0.50** | all Japanese operator rates  |
| USD      | **PHP 67**   | charges quoted in US dollars |
| PHP      | 1            | fixed; nothing to set        |

To change one: enter the new PHP-per-unit figure and save.

**Exchange rates are append-only.** Saving adds a new row; the old one stays on
the record. There is no edit and no delete, so the history of what the rate was
on any date is always there.

**Only Product Development, Admin and Super Admin can change FX.** Agents and
supervisors see it and cannot touch it.

> Changing the yen rate does **not** change a single existing quotation. If an
> agent needs today's rate on an old quote, they use **Requote with current
> rates**, which makes a new quotation and leaves the original alone.

---

## 4. Markups

**Rates & FX → Markups.** Two kinds, and both can be a fixed peso amount or a
percentage.

### Per-category markups

Added to the per-person rate for each room category:

| Category     | Default                          |
| ------------ | -------------------------------- |
| Quad share   | PHP 2,500                        |
| Triple share | PHP 2,600                        |
| Twin share   | PHP 2,700                        |
| Solo         | PHP 3,500                        |
| Child        | PHP 2,000                        |
| Sneak-in     | **PHP 0** — pending a real value |

### Per-service-type markups

| Type     | Default   |
| -------- | --------- |
| Tour     | PHP 1,000 |
| Transfer | PHP 2,000 |

### Fixed or percent

- **Fixed** — that many pesos, flat.
- **Percent** — a percentage of the base, and **the base matters**:

  ```
  base = hotel cost per person
       + the converted tour and transfer rates (including add-ons)

  NOT included: the tour/transfer markups,
                airfare,
                non-hotel Change Rate entries
  ```

  So 10% on a base of 13,550 is 1,355. Adding a 25,000 airfare does **not**
  increase it, and the percentage does not compound on top of the fixed service
  markups.

Markups are **append-only**, like FX: a change is a new row, and the old value
stays on the record.

---

## 5. Tours and transfers

**Content → Services.**

### Adding one

| Field                | What it does                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Name                 | What the agent and the client see                                                                                                 |
| Type                 | Tour or Transfer                                                                                                                  |
| City                 | **Which quotations it is offered in.** Leave blank for something not tied to a city, like an airport transfer that serves several |
| Operator             | Who provides it                                                                                                                   |
| **Consumes day**     | **On** for a day tour; **off** for an airport transfer. This is what makes the itinerary come out the right length                |
| Adds night           | On if it adds an overnight                                                                                                        |
| Transfer direction   | Transfers only: one way or round trip (**default round trip**)                                                                    |
| Itinerary title/text | What appears on the itinerary day                                                                                                 |
| Inclusion text       | The line it adds to the inclusions                                                                                                |

Then give it a rate ([section 2](#2-rates-draft-to-published)). **Until it has a
published rate it shows as "No rate yet" and agents cannot select it** — better
than letting them quote a guess.

### City and the agent's view

An agent ticks the cities their package covers, and the tour and transfer list is
filtered to those cities. **A service with no city always shows.**

So: give a Tokyo day tour the city Tokyo, and give a multi-airport transfer no
city at all.

### Deactivating one

Untick **Active**. It disappears from new quotations and stays on old ones.
**Do not delete a service** — old quotations reference it, and the database will
refuse.

---

## 6. Hotels

**Content → Hotels.**

Name, **city**, **star rating** (3, 4 or 5), walking distance to the station, room
types and notes.

The agent picks their hotel category and their cities, and sees the matching
hotels. **This list is reference only** — it suggests hotels; it does not set the
price. The agent enters the actual room cost themselves, and can type in a hotel
that is not on the list at all.

So the list being out of date makes agents' lives harder; it does not produce a
wrong price.

---

## 7. Package text

**Content → Package text.** Everything that is words rather than numbers:

- **Inclusions** and **Exclusions**
- **Notes**, **Requirements**, **Remarks**

For each entry you can set:

- **Sort order** — drag to reorder; this is the order on the quotation
- **Active** — off hides it without deleting it
- **Starts on / Ends on** — a date window, for seasonal text. Outside the window
  it simply does not appear
- **Conditional on a service** — the line appears **only** when that service is in
  the quotation. Use this for "entrance ticket not included" or an exclusion that
  only applies to one tour

> **Package text changes take effect immediately, on existing quotations too.**
> That is what you want for a typo and worth pausing over for a change of
> substance: an agent who sent a quote this morning will find the inclusions
> different if they regenerate it this afternoon.

### Still outstanding

**Japan-specific remarks have not been provided yet.** The Hong Kong remarks from
the old workbook were deliberately removed, and the BRD remarks are in place as a
stand-in. This is item 7 on the deviations list in
[the runbook](RUNBOOK.md#14-known-issues-and-deviations).

---

## 8. Reference data and settings

**Content → Reference**

- **Cities** — the list agents choose from. Deactivate rather than delete.
- **Operators** — who provides each service.
- **Booking sites** — the links shown beside the hotel list. **These are seeded
  from the old workbook and have not been reviewed** (deviations item 4).

**Content → Settings**

- **Default services on a new quotation** — what is pre-ticked. Only services
  that have a published rate are actually applied.
- **Itinerary wording** — the arrival line, the departure line and the free-day
  line.

---

## 9. Agents and invites

**Agents** in the sidebar. Managers only.

### Adding an agent

**Add agent:** full name, email, role, and a **supervisor** if they are a sales
agent.

| Role                | Can                                    |
| ------------------- | -------------------------------------- |
| Super Admin         | everything                             |
| Product Development | everything                             |
| Admin               | everything                             |
| Sales Supervisor    | own quotations, plus read their team's |
| Sales Agent         | own quotations only                    |

A supervisor's team is whoever has them set as supervisor.

### Rate My Service links

Each agent has two: a **"bad experience"** link and a **"great experience"** link.
They go out at the bottom of that agent's quotations, so feedback is attributed to
the right person.

**Each agent sees only their own.** Set them when you create the agent — a missing
or broken link sends their client to an error page.

### Data issues

The agent list flags rows imported from the workbook that need attention:

| Badge                  | Means                                               |
| ---------------------- | --------------------------------------------------- |
| **Needs email**        | No email, so they **cannot be invited** at all      |
| **Placeholder link**   | A survey link that is a placeholder, not a real URL |
| **Invalid bad link**   | The "bad experience" URL is malformed               |
| **Invalid great link** | The "great experience" URL is malformed             |

From the last import: **156 profiles from 158 rows**, 22 needing an email, 43 with
some issue, **45 rows on the fix list**. Work through them before inviting people.

One specific case: **JUSTINE's survey link was truncated and was rejected rather
than imported.** That was a deliberate decision — a truncated link would send
clients to a broken page. Her links need re-entering by hand.

### Inviting

**Invite** on the agent's row sends them an email with a link to set a password.
The row then shows as invited, with the date.

> ### Invite one person at a time during the pilot
>
> The pilot uses Supabase's built-in email sender, which allows **only a few
> emails per hour**. Invite someone, wait for them to confirm they got it, then
> invite the next.
>
> **Do not bulk-invite all 156 agents.** Most of the emails would be silently
> dropped, the profiles would show as invited, and you would have no way to tell
> who never received a link. **Custom SMTP must be set up first** — see
> [the runbook](RUNBOOK.md#15-email-sending-for-the-pilot).

An agent who has not been invited, or who has no email, simply cannot sign in.

### Deactivating

Untick **Active** and save. They are signed out and cannot return. **Their
quotations are kept** — a quotation is a record of what was offered to a client.
Do this the same day somebody leaves.

---

## 10. The audit log

**Audit log** in the sidebar. Managers only — agents and supervisors cannot see
it at all.

Every change to rates, FX, markups, services, hotels, content, agents, survey
links and Change Rate entries, with **who** and **when**.

- **Tabs:** All changes · Rate changes · Change Rate entries · Agents & links
- **Filters:** by person, by date range
- **Expand a row** to see every field that changed, before and after, in plain
  words rather than column names
- **This record** opens one item's whole history
- **Export CSV** for the current filter, up to 10,000 rows

This is the first place to look when somebody asks "who changed this price?" or
"when did this rate go up?".

Nothing can be edited or deleted from the log, including by you. That is the
point of having one.

---

## 11. What happens to existing quotes when I change X

The table to keep to hand.

| You change                                    | Existing quotations              | New quotations                      | Why                                                     |
| --------------------------------------------- | -------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| **An exchange rate (FX)**                     | **No change**                    | Use the new rate                    | Frozen in each quotation's snapshot                     |
| **Publish a new rate version**                | **No change**                    | Use the new version                 | Same                                                    |
| **A category or service markup**              | **No change**                    | Use the new markup                  | Same                                                    |
| **A rate's Valid until date**                 | **No change**                    | Stops being offered after that date | Expired rates leave new snapshots                       |
| **Deactivate a service**                      | **Still listed and priced**      | Not offered                         | Removing it would change a sent quote                   |
| **Add a service**                             | **Not available on them**        | Available                           | A quotation can only use what is in its own snapshot    |
| **A service's name**                          | **Changes everywhere**           | Changes                             | Text, not a rate                                        |
| **A service's itinerary text**                | **Changes everywhere**           | Changes                             | Text                                                    |
| **A service's inclusion text**                | **Changes everywhere**           | Changes                             | Text                                                    |
| **Inclusions / exclusions / notes / remarks** | **Change everywhere**            | Change                              | Text                                                    |
| **A hotel's name or details**                 | **Changes everywhere**           | Changes                             | Reference data, and hotel cost is entered per quotation |
| **Deactivate a hotel**                        | Stays on quotations that list it | Not offered                         | Same                                                    |
| **A city**                                    | Stays as recorded                | Affects what is offered             | —                                                       |
| **Itinerary wording in Settings**             | **Changes everywhere**           | Changes                             | Text                                                    |
| **Default services in Settings**              | No change                        | Pre-ticked                          | Only applies at creation                                |
| **An agent's name**                           | **Changes on their quotations**  | Changes                             | Read live for the closing block                         |
| **An agent's survey links**                   | **Change on their quotations**   | Change                              | Read live                                               |
| **Deactivate an agent**                       | **Quotations kept**              | They cannot create any              | A quotation is a record                                 |

### The short version

- **Numbers are frozen.** Rates, FX, markups — only new quotations.
- **Words are live.** Text, names, links — everywhere, immediately.

If an agent needs an old quotation at today's numbers, they use **Requote with
current rates** on it. That makes a new quotation and leaves the original exactly
as it was.

### If you are unsure before a big change

1. Note today's figures and the quotations that matter.
2. Make the change.
3. Open an existing quotation and confirm it is unchanged.
4. Create a test quotation and confirm the new figure appears.
5. Check the audit log recorded it with your name.

That whole loop takes two minutes and the audit log means nothing is unrecoverable
anyway.
