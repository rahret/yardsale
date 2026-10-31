# Garage Sale HQ

A full multi-user garage sale platform: anyone can create an account, build one or more
garage sales, add items with photos, and share a mobile-friendly page (with a QR code)
where buyers browse, filter, and place time-limited reservations — all in real time.

Built with **Next.js 14 (App Router)** + **Supabase** (Postgres database, auth, and file
storage). Styling is Tailwind CSS using the cardboard-tag/marker aesthetic from the
original prototype.

## What's included

- **Accounts** — email/password signup and login (Supabase Auth), session handled via
  cookies so it works in Server Components, Client Components, and middleware.
- **Multi-tenant** — every user can create multiple sales. All data access is enforced
  at the database level with Postgres Row Level Security, so one seller can never see or
  edit another seller's sale, even if the app code had a bug.
- **Items with photos** — sellers can add unlimited items per sale, each with multiple
  drag-and-drop-uploaded photos (stored in Supabase Storage), price, category, and an
  emoji fallback icon for items with no photo yet.
- **Reservations** — buyers reserve an item with their name + phone number for a
  configurable window (default 30 min, overridable per item or per sale). One
  reservation per item per phone number, enforced atomically in the database via a
  Postgres function (`reserve_item`) so two buyers racing for the same item can't both
  win it. Expired reservations automatically free up (`sweep_expired_reservations`).
- **Sale statuses** — Draft (only you can see it while setting up) → Live (public,
  reservable) → Ended (public, read-only).
- **Admin dashboard** — stats (available/reserved/sold/revenue), shareable link + QR
  code, inline item editing, mark-sold, cancel-hold, delete.
- **Public shop page** — mobile-first grid, category filters, sort, show/hide sold
  toggle, item detail sheet with photo gallery and live countdown.

## Project structure

```
supabase/schema.sql          All tables, RLS policies, and the reserve_item /
                              sweep_expired_reservations database functions.
src/lib/supabase/client.ts   Browser Supabase client (client components).
src/lib/supabase/server.ts   Server Supabase client (server components / route handlers).
middleware.ts                Keeps auth session fresh, protects /dashboard routes.
src/app/login, /signup       Auth pages.
src/app/dashboard            Signed-in area: list of a user's sales, create new sale.
src/app/dashboard/account    Account page: profile, email/password, plan & billing,
                              how buyers can pay you, delete account.
src/app/dashboard/sales/[id] Sale admin: items, photos, settings, share/QR, stats.
src/app/s/[slug]             Public shop page buyers see (no login required).
src/components/SaleAdmin.tsx Admin UI logic (items CRUD, photo management, settings).
src/components/ShopView.tsx  Public shop UI logic (browse, filter, reserve, countdown).
src/components/PhotoUploader.tsx  Drag-and-drop multi-photo upload to Supabase Storage.
```

## Find yard sales (buyer search)

`/find` lists live sales whose sellers ticked **List my sale** (existing sales start unlisted).

- **Search** runs in the database (`search_sales()`): place/radius, dates, words (name,
  street name — never the house number — city, state, ZIP prefix) and category, 24 at a time
  with **Show more**. `/api/sales/search` serves later pages.
- **Distance:** each sale's address is turned into map coordinates (`sales.lat/lng`) when the
  seller saves it (`/api/sales/[id]/geocode`; older sales are done the next time the seller
  opens their sale). Lookups use the free **US Census Bureau geocoder**, falling back to
  **OpenStreetMap Nominatim**. Buyers can type a ZIP or city (`/api/geocode`, Nominatim,
  cached and spaced 1 s apart per its usage policy) or tap **Use my location**, then pick
  5 / 10 / 25 / 50 miles. A place that can't be found falls back to word matching.
- **Map view:** Leaflet with OpenStreetMap tiles (no API key; attribution shown). Pins for
  sales that hide the house number are rounded to about a block (~200 m).
- No keys or accounts are needed for any of this. For heavy traffic, OpenStreetMap's free tile
  and Nominatim services ask you to move to a paid provider (e.g. MapTiler, Stadia Maps) —
  swap the tile URL in `SalesMap.tsx` and the lookup in `src/lib/geocode.ts`.

## Sharing & link previews

- **Link previews:** `/s/[slug]` sets Open Graph / Twitter tags (title with dates, top
  categories, item count, location). The image is drawn per sale at `/s/[slug]/preview`
  (`?item=<id>` for one item, `?size=square` for a 1080×1080 story image). Draft sales get
  no preview. "Happening now" uses the seller's time zone, saved from their browser when
  they save the sale or change its status.
- **Address privacy:** previews and ready-made posts show the street name without the house
  number unless the seller ticks "Show my full address" (`sales.show_full_address`). The
  sale page itself always shows the full address.
- **Share tools** (seller's sale page): native share sheet / Facebook / Email / Text,
  ready-to-paste posts (group post, Craigslist, text), and a downloadable square image.
  Buyers get "Share" on the sale and "Share this item" on each item; `?item=<id>` opens it.
- **Visit counts:** shared links carry `?src=` (qr, facebook, group, craigslist, text,
  email, share, friend). Each browser session's first visit is recorded in `sale_visits`
  (no personal data; the seller's own visits are skipped) and shown to the seller by source.
- `NEXT_PUBLIC_SITE_URL` should include `https://`; the app adds it if missing.

## Checks & tests

```
npm run lint        # ESLint (next/core-web-vitals)
npm run typecheck   # TypeScript
npm test            # unit tests (Vitest)
npm run test:db     # loads supabase/schema.sql into a scratch Postgres and runs
                    # supabase/tests/*.test.sql (needs psql + PGHOST/PGUSER/... set)
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of these, plus `npm run build`, on
every pull request and on pushes to `main`.

## Buyer privacy & reservation limits

- Buyers' names and phone numbers are stored in `item_holds`, which only the sale's owner
  can read (the seller sees them next to each reserved item). They are never on the
  publicly readable `items` / `sales` rows.
- `reserve_item` requires a real-looking 10-digit US/Canada phone number, allows one
  reservation per phone number per sale, and limits each device (client IP) to 3
  reservations per sale and 10 per hour across all sales.

## Password rules

New passwords (sign-up, reset, and the Account page) must be 8–20 characters with at least
one uppercase letter, one lowercase letter, one number, and one of `~ ! @ # $ % ^ & * ? = +`.
The rules live in `PASSWORD_RULES` in `src/lib/utils.ts`. They're checked in the app; to
also enforce them in Supabase itself, set Authentication → Providers → Email → minimum
password length to 8 and require lowercase, uppercase, digits and symbols.

## Password reset

"Forgot password?" on the login page emails a link to `/auth/callback?redirectTo=/reset-password`.
In Supabase → Authentication → URL Configuration, make sure your site's
`/auth/callback**` URL is in the Redirect URLs allow-list.

## Buy Now (online payments with Stripe)

Buyers can pay for an item online (card, Apple Pay, Google Pay, Cash App Pay) and pick it up
with a 4-digit code. Each item has exactly one way to buy it, picked by the seller when adding
or editing it (`items.sell_mode`): **First come, first served** (no holds or online payment;
the default), **Hold** (reserve, pay in person) or **Buy Now** (pay online). Bulk items are
always first come, first served, and Buy Now needs a price of at least $3 (`MIN_CHARGE_CENTS`
in `src/lib/fees.ts`; Stripe's own minimum is 50¢, but below $3 the fixed card fee eats most of
the sale). The database refuses holds on anything but Hold items, and checkout refuses
anything but Buy Now items. Money goes to the seller through
**Stripe Connect** (Express accounts, destination charges). The app keeps an application fee
equal to Stripe's processing fee (which the platform pays on these charges) plus a 1.5% + 15¢
platform cut, which covers Stripe Connect's per-seller and payout fees.

How it fits together:

- `/api/stripe/connect` — seller onboarding (creates their Express account, sends them to
  Stripe); `/api/stripe/connect/return` refreshes their status; `/api/stripe/dashboard`
  opens their payouts dashboard.
- `/api/checkout` — starts Stripe Checkout for one item (server re-checks everything).
- `/api/stripe/webhook` — marks orders paid via the `complete_order` database function. If two
  people paid for the same item, the second is refunded automatically.
- `/s/[slug]/order` — the buyer's confirmation page with the pickup code (also confirms the
  payment directly with Stripe, so it doesn't depend on webhook timing).
- `/api/orders/[id]/pickup` and `/refund` — the seller's "Picked up" and "Refund" buttons.
- `orders` table — readable by the sale's owner; written only by the server.

Setup:

1. Create a Stripe account and turn on **Connect** (Express). Start in **test mode**.
2. Dashboard → Settings → **Payment methods**: enable Cards, Apple Pay, Google Pay and
   **Cash App Pay**. Checkout shows whatever is enabled there.
3. Dashboard → Settings → **Customer emails**: turn on receipts for successful payments
   (the receipt includes the pickup code).
4. Add a webhook endpoint `https://<your site>/api/stripe/webhook` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired` and (for seller plans)
   `customer.subscription.created`, `customer.subscription.updated` and
   `customer.subscription.deleted`. Add a second
   endpoint to the same URL that listens to **connected accounts** for `account.updated`.
5. In Vercel, set these server-only variables:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET` (first endpoint) and `STRIPE_CONNECT_WEBHOOK_SECRET` (second)
   - `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API; never expose it to the browser)
   - optional `NEXT_PUBLIC_PLATFORM_FEE_PERCENT` (default 1.5) and
     `NEXT_PUBLIC_PLATFORM_FEE_FIXED_CENTS` (default 15), and
     `NEXT_PUBLIC_STRIPE_FEE_PERCENT` / `NEXT_PUBLIC_STRIPE_FEE_FIXED_CENTS` if your Stripe
     rate isn't 2.9% + 30¢.
6. Re-run `supabase/schema.sql`.

Without these variables the app still runs; Buy Now just reports that online payment isn't
available. `npm test` includes payload checks against
[stripe-mock](https://github.com/stripe/stripe-mock) when `STRIPE_MOCK_PORT` is set.

## Seller plans (subscriptions)

There's no free tier. Sellers choose one of:

| Plan | Price | What's included |
| --- | --- | --- |
| **Free trial** of Pro | 7 days, card required, cancel anytime | 1 sale, up to 25 items, first come, first served only |
| **Pro** | $7.99/month or $59/year | Unlimited sales and items, Holds, Buy Now, listing in Find yard sales |
| **Sale Pass** | $14.99 once | Everything in Pro for 30 days; no subscription (a second pass adds 30 more days) |

During the trial, the locked features (more sales or items, Holds, Buy Now, Find yard sales)
are still shown, with a 🔒 Pro badge and a link to the plans. "Unlock everything now" on the
Account page opens a confirmation pop-up where the seller picks monthly, yearly or a Sale Pass
and sees what will happen before anything changes:
- **Monthly / yearly:** the trial ends now and the card on file is charged for the first
  period (switching period if needed). If the card is declined, nothing changes.
- **Sale Pass:** the seller pays on Stripe Checkout; once paid, the trial subscription is
  canceled so Pro never bills them. If they don't finish paying, the trial carries on.

One trial per account.

Switching plans:
- **Monthly ↔ yearly** ("Change plan" on the Account page): switches today. Monthly → yearly
  charges the year now, less credit for the unused part of the month; yearly → monthly turns
  the unused part of the year into account credit that pays the monthly charges.
- **Sale Pass → Pro:** subscribing while a pass is running doesn't charge until the pass ends
  (Stripe needs that to be at least 48 hours away; otherwise billing starts now). No free trial
  on top of a pass. Pass holders can also add another 30 days.
- **Pro → Sale Pass:** cancel Pro in Manage billing; it runs to the end of the paid period,
  then buy a pass.

Without a plan (trial canceled, subscription ended, pass expired), the seller's sales stay up,
but they can't add sales or items, their sales leave Find yard sales, and buyers see every
item as first come, first served. A seller with a live subscription has to cancel it before
deleting their account.

How it fits together:

- `public.seller_access(user)` in `schema.sql` decides `full` / `trial` / `none`; the app
  mirrors it in `src/lib/billing.ts` (`accessFor`). Triggers on `sales` and `items` enforce
  the limits for sellers' own writes, and `reserve_item`, `search_sales` and `/api/checkout`
  check it too.
- `/api/billing/checkout` (Stripe Checkout, subscription or one-time), `/api/billing/return`
  (applies the result right away), `/api/billing/portal` (Stripe's customer portal: card,
  receipts, cancel), `/api/billing/upgrade` (end the trial early), `/api/billing/change`
  (switch monthly ↔ yearly).
- The webhook keeps `account_billing` in sync from `customer.subscription.*` events and
  records Sale Passes (`grant_sale_pass`, one row per Checkout in `sale_passes`).
- Prices live in `src/lib/billing.ts` (`PRICES`) and are sent with each checkout, so there's
  nothing to set up in Stripe. Each plan is filed under one fixed Stripe product
  (`yardsaleqr_pro_month`, `yardsaleqr_pro_year`, `yardsaleqr_sale_pass`), created
  automatically the first time it's needed in test mode and again in live mode.
- New sellers pick a plan on `/dashboard/welcome` before the setup wizard.

Setup (in addition to the Buy Now setup below):

1. Re-run `supabase/schema.sql`.
2. Stripe Dashboard → Settings → Billing → **Customer portal**: activate it, and allow
   customers to update payment methods, view invoices and cancel subscriptions.
3. Add `customer.subscription.created`, `customer.subscription.updated` and
   `customer.subscription.deleted` to the **first** (platform) webhook endpoint.
4. Optional: Settings → Billing → Subscriptions and emails — turn on the trial-ending
   reminder email and failed-payment emails.
5. To give an account everything for free (yours, or a tester's), run in the SQL editor:

   ```sql
   insert into public.account_billing (user_id, plan)
   select id, 'comp' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set plan = 'comp';
   ```

## Notes / things to customize

- **SMS reminders** aren't included — buyers just give a phone number shown to the
  seller in the admin panel. Wiring up Twilio to text buyers when their hold is about to
  expire would be a natural next step.
- **Payments** — see "Buy Now" above. Sellers can also list other ways to pay (cash, Venmo,
  Cash App, PayPal, Zelle) on the Account page; buyers see only the method names. The `account_billing` table is in place
  for Stripe subscriptions (seller plans) and Stripe Connect (card / Apple Pay payouts
  to sellers); it is read-only to users and meant to be written by Stripe webhooks
  using the service-role key.
- The visual style (cardboard tags, marker font) lives in `tailwind.config.ts` and
  `globals.css` — change the color variables there to reskin it.
