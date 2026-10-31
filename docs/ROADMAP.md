# Yard Sale QR — Feature Roadmap

A running list of features for future consideration. Update it as features ship and new
ideas come up.

**Goal of the service:** help people increase traffic and sales at their physical yard
sale. The QR code and printed sign replace the usual hand-written sign with limited info;
each sale page lets the seller build and organize their sale, and lets buyers see whether
the sale is worth visiting.

**Status key:** ✅ Done · 🟡 Partly done · ⬜ Not started

_Last updated: 2026-10-30_

---

## 1. Getting traffic (the biggest gap)

- ✅ **Shared links show nothing about the sale.** Sale pages don't set their own preview
  information, so a link pasted into Facebook, Nextdoor, a group text or Craigslist shows the
  generic "Yard Sale QR" card. It should show the sale name, dates, the neighborhood and a few
  item photos. This is cheap to build and probably the biggest single boost to traffic.
  - _Shipped in #14, fixed in #15:_ per-sale and per-item previews with a generated image
    (item photos, name, dates, street without house number), "Happening now" / "Sale ended"
    badge, Share button and ready-to-paste posts for sellers, downloadable square image.
- 🟡 **Buyers can't find sales on their own.** You can only reach a sale through its link. A
  "sales near me this weekend" map or list would help, searchable by distance, date and
  category ("furniture within 5 miles, Saturday"). That needs map coordinates for each sale,
  which the database doesn't store yet. It's also your strongest reason for buyers to come
  back, and a natural paid feature: promote a sale to the top of the list.
  - _Done (pending merge):_ new front page (name, short description, big **Buyers** and
    **New Sellers** buttons). **Buyers → `/find`:** search by ZIP, city or street, filter by
    Today / This weekend / Next 7 days and category; cards with photos, open status, street
    (no house number) and top categories. **New Sellers → `/sell`:** benefits and Get started.
    Sellers opt in with "List my sale" (existing sales start unlisted; new sales start listed).
  - _Done (pending merge):_ map coordinates for each sale (US Census geocoder, OpenStreetMap
    fallback), "within 5/10/25/50 miles" of a ZIP/city or **Use my location**, nearest first
    with distance on each card, a **Map** view (OpenStreetMap; pins rounded to ~a block when
    the house number is hidden), and server-side paging (24 at a time, Show more).
  - _Still to do:_ promoted listings (paid) — needs a price and checkout decision. Directory
    listing itself is now part of Pro / the Sale Pass.
- ⬜ **There's one sign layout.** Traditional signs work as a trail of arrows from busy roads.
  Add arrow signs ("← YARD SALE, 2 blocks") with a small QR code, plus a quarter-page flyer
  for neighborhood boards.
- 🟡 **There's no "remind me".** Let buyers add the sale to their calendar, or follow it and get
  a message the morning it opens.
  - _Done (pending merge):_ "Add to calendar" button (an .ics file with each remaining sale
    day, address and link).
  - _Still to do:_ follow a sale and get a message the morning it opens.

## 2. Helping buyers decide it's worth the trip

- ✅ **There's no quick summary at the top of the page.** Buyers decide in about five seconds.
  Add a cover photo, the top categories ("Furniture · Tools · Kids' clothes"), the item count
  and the total value, and two or three featured items, all before the full item list.
  - _Done (pending merge):_ "What's here" categories, item count, and up to 3 highlights
    (seller stars items with "☆ Feature"; otherwise the priciest items with photos). The
    highlight photos act as the cover. Total value was deliberately left out.
- ✅ **The page doesn't say whether the sale is open right now.** Add "Open now · closes 2P",
  "Opens tomorrow 8A" or "Ended", plus a short note from the seller ("Everything half off
  after noon", "Fill a bag for $5").
  - _Done (pending merge):_ open-status pill (updates every minute, seller's time zone) and a
    "Note to buyers" the seller can post or change any time.
- ✅ **Sale-level details are missing:** payment methods (these are saved on the Account page
  but not shown publicly yet), early-bird policy, parking, and rain plan.
  - _Done (pending merge):_ per-sale payment methods shown as icons only (never handles;
    pre-ticked from the Account page).
  - _Decided against:_ early birds, parking and rain plan fields — tried, then removed to
    keep the page simple.
- 🟡 **Changes don't show up live.** The buyer page refreshes every 4 seconds, so this is
  less stale than first thought, but it's polling rather than true live updates. The
  reservation function stops two people claiming the same item; the second person only finds
  out when they try. _Possible upgrade:_ Supabase Realtime instead of polling.
- ✅ **Items can't be linked to directly.** A seller can't share a link to just the couch.
  - _Shipped in #14:_ `?item=<id>` opens that item, with its own link preview; buyers get
    "Share this item".

## 3. Helping sellers organize the sale

- ⬜ **The seller isn't told about reservations.** Nothing sends a text or email when someone
  reserves an item, so the seller has to keep checking the dashboard. The README already
  lists texting buyers about expiring holds as a next step.
- ⬜ **Adding items is slow.** Typing in 80 items is the biggest reason sellers will give up. A
  photo-first flow would help: snap photos in a row and fill in each item from the photo,
  with AI suggesting a name, category and price.
  - _Proposed "Snap & list" flow:_ quick-add camera mode (one photo = one item, "add another
    angle"), background upload, AI suggests name / category / price / description / quantity
    and flags multi-item or blurry photos, then a review stack with price chips (−$1 / +$1,
    $1 / $5 / $10 / $20) and "approve all that look good". Items stay hidden drafts until
    approved. Optional per-sale pricing style ("Priced to move / Fair / Firm").
  - _Tech:_ phone shrinks photos to ~1,000px before upload; a server route
    (`/api/items/suggest`) checks ownership and calls Claude with a fixed output format; one
    request per photo, several at a time; per-seller hourly cap. Needs `ANTHROPIC_API_KEY`.
  - _Rough cost:_ Claude Opus 5.5 ~1–2¢ per photo (~$1–1.50 per 80 items); Claude Haiku 5.5
    ~0.05¢ per photo, but weaker at pricing. Test both on 30–50 real photos.
  - _Open decisions:_ free vs. limited free vs. paid feature; which model; hidden drafts
    until approved (recommended yes).
- ⬜ **There are no printed price tags.** Printing tag sheets that match the listing (and
  optionally carry each item's QR code) ties the physical sale to the online one.
- ⬜ **Each sale starts from scratch.** Add "copy this sale" and "move unsold items to my next
  sale", plus multi-family sales with several sellers on one sale.
- 🟡 **There are no numbers.** Sellers can't see page views, QR scans versus link visits,
  most-viewed items or reservations. That's what proves the app brought them buyers, and it's
  the clearest thing to put on a paid plan.
  - _Shipped in #14:_ visit counts by source (QR / sign, Facebook, group posts, Craigslist,
    text, email, share button, shared by buyers) in the Share card.
  - _Still to do:_ most-viewed items (item visits are already recorded), reservations and
    sales over time, a proper stats view.

## 3½. Onboarding

- ✅ _Done (pending merge):_ new sellers land in a 3-step **welcome wizard** after confirming
  their email (name → address → dates; creates a draft sale), a **Getting started checklist**
  on the sale page (address, dates, 3+ items, a photo, go Live, print sign, share — each with
  a jump button; hideable), and an empty dashboard that points to the wizard.

## 4. Basic gaps

- ✅ **There's no "forgot password" on the login page.** Users who forget theirs are locked
  out.
  - _Shipped in #13:_ Forgot password / reset pages; stronger password rules (8–20
    characters, upper, lower, number, one of `~ ! @ # $ % ^ & * ? = +`).
- ✅ **Reservations aren't protected against abuse.** One person can fake phone numbers and
  hold every item.
  - _Shipped in #13:_ real-looking 10-digit phone required, one reservation per phone per
    sale, per-device limits (3 per sale, 10 per hour). Buyer names and phones moved out of
    public view (owner-only `item_holds`).
  - _Possible upgrade:_ SMS verification code for reservations.
- ✅ **There's no safety checking.** No automated tests, no lint setup and no checks that run
  on GitHub, so problems are only caught by hand.
  - _Shipped in #13:_ ESLint, Vitest unit tests, SQL tests for the schema, GitHub Actions CI.

---

## 5. Monetization & payments

- ✅ **Subscriptions (seller plans).** No free tier.
  - _Done (pending merge):_ **7-day free trial** of Pro (card required, cancel anytime) limited to
    1 sale, 25 items and first come, first served — Holds, Buy Now, Find yard sales and more
    sales/items stay visible with a 🔒 Pro badge. **Pro $7.99/mo or $59/yr** unlocks
    everything; **Sale Pass $14.99** = everything for 30 days, paid once. Stripe Checkout,
    customer portal (card, receipts, cancel), "Unlock everything now" (ends the trial early),
    webhook sync, limits enforced in the database. Lapsed sellers keep their sales up but
    can't add to them; holds/Buy Now/directory turn off. Complimentary accounts via SQL.
  - _Still to do:_ maybe **Business ~$24.99/mo** for estate-sale companies; switching
    monthly ↔ yearly in the portal (needs products in Stripe's catalog); Pro-only extras
    (visit stats, extra sign layouts, AI item entry, promoted listings).
- 🟡 **Help sellers take payment.** Sellers can save how buyers pay them (cash, Venmo,
  Cash App, PayPal, Zelle) on the Account page.
  - _Done (#16):_ each sale shows which methods it accepts, as icons only. Handles stay
    private.
  - _Done (pending merge):_ **Buy Now** through Stripe — card, Apple Pay, Google Pay and
    Cash App Pay. Sellers connect payouts (Stripe Express) on the Account page, then choose
    **how buyers get each item**: First come, first served (default), Hold, or Buy Now —
    exactly one (bulk items are always first come; Buy Now needs $3+). Buyers pay, get a
    pickup code, and the item is marked sold. Sellers mark orders picked up or refund them.
  - _Decided against (for now):_ Venmo through PayPal (separate integration), and
    "pay the seller directly" links (can't confirm payment; exposes handles).
  - _Decided:_ platform fee 1.5% on top of Stripe's fee; Buy Now minimum $3.
  - _Still to decide:_ no-show policy
    (default: seller keeps payment and can refund by hand), legal/tax review before launch.
- ⬜ **Email notifications.** Purchase and hold alerts to sellers; Stripe's own receipt
  covers buyers for now. Needs an email service (e.g. Resend).

## 6. Other ideas & follow-ups

- ⬜ Seller-side live updates on the dashboard (reservations appear without reloading).
- ⬜ Item photos are stored at full phone size; shrinking them on upload would speed up the
  buyer page and save storage.
- ⬜ Deleting an item doesn't remove its photo files from storage (account deletion does).

---

## Done log

| PR | What shipped |
| --- | --- |
| #12 | Sign layout (fit-to-width text, QR/details 50/50, compact times), hour-only sale times, Account page, `account_billing` table |
| #13 | Buyer privacy fix, reservation abuse limits, forgot/reset password, password rules, logout 405 fix, lint/tests/CI |
| #14 | Link previews, share tools, item links, visit counts by source, `https://` fix for the site URL |
| #15 | Upright photos and no past dates in link previews |
| #16 | Buyer page Share button fix; buyer-page upgrade (open status, seller's note, what's here + highlights, payment icons, add to calendar); this roadmap |
| _pending_ | Buy Now with Stripe (card, Apple Pay, Google Pay, Cash App Pay), seller payouts, online orders with pickup codes and refunds |
