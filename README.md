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
src/app/dashboard/sales/[id] Sale admin: items, photos, settings, share/QR, stats.
src/app/s/[slug]             Public shop page buyers see (no login required).
src/components/SaleAdmin.tsx Admin UI logic (items CRUD, photo management, settings).
src/components/ShopView.tsx  Public shop UI logic (browse, filter, reserve, countdown).
src/components/PhotoUploader.tsx  Drag-and-drop multi-photo upload to Supabase Storage.
```

## Notes / things to customize

- **SMS reminders** aren't included — buyers just give a phone number shown to the
  seller in the admin panel. Wiring up Twilio to text buyers when their hold is about to
  expire would be a natural next step.
- **Payments** aren't included — the app assumes cash/Venmo/etc. at pickup, same as the
  original design.
- The visual style (cardboard tags, marker font) lives in `tailwind.config.ts` and
  `globals.css` — change the color variables there to reskin it.
