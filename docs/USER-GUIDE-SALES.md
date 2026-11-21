# EZQUOTE Japan — guide for sales agents

This replaces the Excel quotation workbook for Japan packages. You pick the
cities, services and hotels; it works out the rate for every room category and
gives you text you can paste straight into Messenger, Viber or email.

**The app:** `https://<project>.pages.dev`

> Screenshots in this guide live in [uat/evidence/](uat/evidence/). They are
> captured from the real app during testing, so a step that looks different from
> your screen usually means your role shows fewer options — not that you are in
> the wrong place.

---

## Contents

1. [Signing in the first time](#1-signing-in-the-first-time)
2. [Starting a quotation](#2-starting-a-quotation)
3. [Cities, services and how long the trip is](#3-cities-services-and-how-long-the-trip-is)
4. [Hotels and booking status](#4-hotels-and-booking-status)
5. [Hotel cost and Change Rate](#5-hotel-cost-and-change-rate)
6. [Airfare](#6-airfare)
7. [Generating and copying the quotation](#7-generating-and-copying-the-quotation)
8. [Requoting at today's rates](#8-requoting-at-todays-rates)
9. [Finding an old quotation](#9-finding-an-old-quotation)
10. [My profile and my links](#10-my-profile-and-my-links)
11. [FAQ](#11-faq)

---

## 1. Signing in the first time

You will get an email titled **"Your EZQUOTE Japan access"**.

1. Open it and click the link. It works **once** and expires after 24 hours.
2. Set a password — at least 10 characters, with capital and small letters and a
   number. Use something you do not use anywhere else.
3. You are signed in, and from then on you sign in at the app URL with your email
   and that password.

**If the link has expired or never arrived**, ask your manager to send it again.
Do not create a new account; your profile already exists and a second one would
not be linked to your records.

**If you see "Pending approval"** after signing in, your email is not yet matched
to a profile. Tell your manager which email address you used — usually it is a
different address from the one on file.

**Forgot your password?** On the sign-in page, use **Forgot password** and follow
the email.

> Never share your login. Every quotation records who created it, and your name
> and your Rate My Service links go out on everything you send.

---

## 2. Starting a quotation

**New quotation** (the button is on the dashboard and on the quotations list).

Fill in:

| Field              | Notes                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Cities covered** | **Required.** Tick every city the package covers. This decides which tours, transfers and hotels you are offered. |
| Client name        | Optional, but it appears on the quotation and makes the quote easy to find later.                                 |
| Travel date        | Optional. Cannot be in the past.                                                                                  |
| Adults / Children  | **Count everyone travelling.** This decides the group-size price band.                                            |
| Hotel category     | 3, 4 or 5 star — it filters the hotel list.                                                                       |

Then **Create quotation**.

> **The moment you press Create, today's rates are locked into this quotation.**
> If Product Development changes the yen rate tomorrow, this quote keeps today's
> figures. That is deliberate: what you send a client does not change under them.
> The footer of the quotation page shows the date the rates were frozen.

You get a reference like **JPN-2026-000123**. Use it when asking about a quote.

---

## 3. Cities, services and how long the trip is

### Cities covered

In the **Basics** card. Tick or untick at any time; it saves itself.

Changing the cities **filters what you are offered** — a Tokyo-only package does
not show Osaka tours or Osaka hotels. Airport transfers always show, because they
are not tied to one city.

**If you narrow the cities after already picking something**, nothing is deleted.
You get a warning listing what is now outside the cities, and you decide: remove
it, or add the city back. The app will not throw away work you have already
priced.

### Tours and transfers

In **Tours & transfers**, tick what the package includes. Each card shows the
**per-person price** at your current group size.

- **"No rate yet"** and a greyed-out tick means that service has no published
  price. You cannot quote it — ask Product Development.
- Some tours have an **entrance ticket** as an optional extra. It is **off by
  default**; tick it only if the client is paying for it.
- **Consumes day** means that tour uses up a day of the trip. An airport transfer
  does not.

### How long the trip is

In **Duration**, two ways:

- **Derived** (the default) — the app counts it: arrival day, one day per tour
  that consumes a day, departure day. Minimum 3D2N.
- **Agent selected** — you choose the number of days.

You will be warned above 7D6N, which is the top of what is supported.

### The itinerary

Built from your services and the duration. Assign a tour to a particular day with
the dropdown beside it, or press **Auto-arrange** to have them spread out.
Unused days show as free time.

---

## 4. Hotels and booking status

In the **Hotels** card.

1. **Category** — 3, 4 or 5 star. Changing it changes the list.
2. Tick the hotels you are offering. The list is **reference only** — these are
   suggestions from the team, not bookings.
3. **A hotel that is not on the list:** type it into **Add other hotel** and press
   **Add**. It appears on the quotation like any other. Its cost is whatever you
   enter in [Hotel cost](#5-hotel-cost-and-change-rate) — the list does not
   control the price.
4. **Booking status:**
   - **Not booked** — you are still quoting
   - **Booked** — held but not confirmed
   - **Confirmed** — confirmed with the hotel

   While it is anything but **Confirmed**, the quotation carries:

   > _Rooms & Rates are subjected to AVAILABILITY and REVISION at point of
   > confirmation or prior_

   **Leave that note on until the rooms are genuinely confirmed.** It is what
   protects you if the hotel comes back with a different rate.

---

## 5. Hotel cost and Change Rate

This is where the real money goes in, and the one part worth reading twice.

### Hotel cost

**Add hotel cost** in the Hotel cost card. You enter what the room actually costs
and the app divides it per person, per category:

| Category     | What to enter                | A 20,000 room becomes    |
| ------------ | ---------------------------- | ------------------------ |
| Quad share   | the **room** cost            | 5,000 each               |
| Triple share | the **room** cost            | 6,666.67 each            |
| Twin share   | the **room** cost            | 10,000 each              |
| **Solo**     | **the per-person TWIN rate** | **double what you type** |
| Child        | the cost **per child**       | as entered               |
| Sneak-in     | the cost **per person**      | as entered               |

> ### Solo is the one that catches people
>
> For Solo you do **not** enter the room cost. You enter the **per-person twin
> rate**, and the app doubles it — because a solo traveller pays for the whole
> room.
>
> **Example.** A twin room is 12,000, so 6,000 per person. For Solo you type
> **6,000** and the hotel line shows **12,000**. If you type 12,000 you will
> quote 24,000 and lose the sale.
>
> The card shows the working under each figure. **Check it before you send.**

If you enter a nightly rate, the form can multiply it by the number of nights for
you — look for the nights field.

### Change Rate

Any other per-person adjustment: an operator surcharge, a rate difference, an
extra transfer, a special arrangement. **Add adjustment**, then pick the
category, the kind, the amount and a reason.

- **Negative amounts are allowed** — use one for a discount.
- **You can enter it in JPY, USD or PHP.** It is converted at this quotation's
  frozen rate.
- **The reason is required.** It is what you or your manager will read in six
  weeks when wondering why this quote was different.

> ### Entries cannot be edited or deleted
>
> Once saved, an entry stays on the record. To correct a mistake, press
> **Reverse** on it and give a reason. The app adds an exact opposite entry, both
> rows stay visible, and they cancel out in the total.
>
> This is on purpose: a quotation is a record of what you offered a client, and a
> record you can quietly change is not a record. It also means nobody can accuse
> you of altering a price after the fact.

### The live summary

On the right, always visible: the final rate for every category you are showing.
**Show breakdown** opens every line — hotel, each service, each markup, airfare,
each adjustment, and the rounding — and the lines always add up exactly to the
final figure.

**The final rate always ends in 99**, rounded up. 19,050 becomes 19,099.

---

## 6. Airfare

In **Airfare & package markup**. Type the per-person airfare in pesos; it is added
to every category.

- Leave it **0** for a land-only package, and no airfare line appears.
- Airfare is **not** included in any percentage markup — a percentage is worked
  out on the land arrangements only.

**Package markup** in the same card is an extra markup across the whole package,
either a fixed peso amount or a percentage. Most quotations leave it empty.

---

## 7. Generating and copying the quotation

**Quotation text**, top right of the quotation page.

1. You see a **live preview** of the full quotation: package title, duration,
   rates by category, itinerary, inclusions, exclusions, notes, requirements,
   remarks, and your own closing block with your name and your Rate My Service
   links.
2. **Generate quotation** saves this version. Saved versions are listed, so you
   can see exactly what you sent and when.
3. **Copy Full Quotation** puts the whole thing on your clipboard. Paste it into
   Messenger, Viber, Gmail or Outlook.
   - There are also buttons to copy single sections, for when a client asks only
     about the inclusions.
   - If copying fails (some older browsers block it), a box opens with the text
     selected — press Ctrl+C.

**Check the paste the first time** in each app you use. The spacing, the line
breaks and the emojis are all preserved, but it is worth seeing it once with your
own eyes.

**Before you send, check:**

- [ ] The rates match the live summary
- [ ] Your name and links are at the bottom, and they are **yours**
- [ ] The availability note is there if the rooms are not confirmed
- [ ] The itinerary days are in the right order

---

## 8. Requoting at today's rates

A quotation keeps its original rates forever. When a client comes back weeks later
and you need current pricing:

1. Open the quotation → the **Rates snapshot** card at the bottom.
2. **Compare with current rates.** It tells you either "Nothing has changed" or
   exactly what moved — the yen rate, an operator price, a markup, a service no
   longer sold.
3. If it is worth it, **Requote with current rates**. That makes a **new
   quotation** at today's prices, copying the client, cities, services, hotels and
   your Change Rate entries. **The original is untouched.**
4. If anything could not be carried over — a tour no longer on sale — the app
   tells you what and you decide what to put in its place.

You can also requote from the **…** menu on any row of the quotations list.

---

## 9. Finding an old quotation

**My quotations** in the sidebar. Newest first, and it shows only your own.

- **Search** by reference, client name or package title
- Filter by **status** (Draft, Sent, Archived) or by **travel date**
- Sort by clicking a column heading
- The **…** menu on each row: Open, Quotation text, Requote, Archive

**Archive** tidies a quote out of your default view without deleting it — filter
by Status = Archived to see it again, and **Restore** to bring it back. Nothing is
ever deleted.

**Share a filtered list** by copying the address bar: the filters are in the URL,
so whoever opens it sees the same rows (subject to what they are allowed to see).

The dashboard also shows your **recent quotations** for picking up where you left
off.

---

## 10. My profile and my links

**My profile** in the avatar menu, top right.

You see your name, email, role and your two **Rate My Service** links — the "bad
experience" and "great experience" survey URLs. These go out at the bottom of
every quotation you send, so the feedback comes back attributed to you.

**You only ever see your own links, and only your own appear in your
quotations.** If they look wrong or empty, tell your manager — a broken survey
link sends your client to an error page.

---

## 11. FAQ

**I changed the yen rate story — my old quote still shows the old price. Is it
broken?**
No, that is the point. Every quotation keeps the rates it was created with, so
what you sent a client cannot change behind your back. Use
[Requote](#8-requoting-at-todays-rates) for a new price.

**Why is my Solo rate twice what I expected?**
Because for Solo you enter the **per-person twin rate**, not the room cost, and
the app doubles it. See [the warning in section 5](#5-hotel-cost-and-change-rate).

**Why does the final rate end in 99?**
Company pricing: the final figure is always rounded **up** to the next number
ending in 99.

**A tour says "No rate yet".**
It has no published price. Ask Product Development to publish one; you cannot
quote it until they do.

**I picked 4 adults but the price per person looks high.**
Prices are banded by the **total** number of travellers, children included. Small
groups pay more per person. Check the band shown in the Travellers card.

**I made a mistake in a Change Rate entry.**
Press **Reverse** on it and give a reason. Both rows stay on the record and cancel
out. You cannot edit or delete the original — that is deliberate.

**Can my supervisor see my quotations?**
Yes, read-only. They cannot change your figures. Managers can see everything.

**Can I see another agent's quotations?**
No. You see your own only.

**The app says it cannot connect.**
During the pilot the free database **pauses after about a week with nobody using
it**. Tell your manager — restoring it takes a few minutes from the dashboard and
loses nothing.

**Something looks wrong and I want to report it.**
Send three things: the **small grey version number at the very bottom of the
page**, the quotation reference, and roughly when it happened. With those three it
can be found in the logs; without them it usually cannot.

**Can I delete a quotation?**
No. **Archive** it instead. A quotation is a record of what was offered to a
client, so nothing is deleted.
