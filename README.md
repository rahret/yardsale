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

## Notes / things to customize

- **SMS reminders** aren't included — buyers just give a phone number shown to the
  seller in the admin panel. Wiring up Twilio to text buyers when their hold is about to
  expire would be a natural next step.
- **Payments** aren't processed yet — sellers list how buyers can pay them (cash, Venmo,
  Cash App, PayPal, Zelle) on the Account page. The `account_billing` table is in place
  for Stripe subscriptions (seller plans) and Stripe Connect (card / Apple Pay payouts
  to sellers); it is read-only to users and meant to be written by Stripe webhooks
  using the service-role key.
- The visual style (cardboard tags, marker font) lives in `tailwind.config.ts` and
  `globals.css` — change the color variables there to reskin it.
