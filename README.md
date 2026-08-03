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

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**.
   Free tier is enough to get started.
   password = 5CM6Sh32kQ0bcsI0
2. Once it's ready, open **Project Settings → API** and copy the **Project URL**
    https://ihumlnkmtquhlgyotlqc.supabase.co
 and
   **anon public** key — you'll need these in step 3.
   sb_publishable_c_wwWnPuzfLyLFEMmQQyGw_HUy-9XII

## 2. Set up the database

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and click
   **Run**. This creates all tables, security policies, and the two database functions
   the app depends on.
3. Open **Storage** in the left sidebar → **New bucket** → name it exactly
   `item-photos` → toggle **Public bucket** ON → **Create bucket**.
   (`schema.sql` already added the upload/delete policies for this bucket — the bucket
   itself has to be created by hand because Supabase doesn't allow creating buckets from
   plain SQL.)
4. Open **Authentication → Providers** and make sure **Email** is enabled (it is by
   default). Optional: under **Authentication → Emails** you can customize the
   confirmation email template.
5. Open **Authentication → URL Configuration** and set:
   - **Site URL**: your production URL once you have one (e.g.
     `https://your-app.vercel.app`) — use `http://localhost:3000` for now.
   - **Redirect URLs**: add `http://localhost:3000/auth/callback` for local dev, and
     later add `https://your-app.vercel.app/auth/callback` too.

## 3. Run it locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
cd garage-sale-app
npm install
cp .env.example .env.local
```

Edit `.env.local` and fill in the two values from step 1:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Get started**, create an
account, and build your first sale. Confirmation emails come from Supabase's built-in
email service (fine for testing; for production you'll want to configure a custom SMTP
provider under **Project Settings → Auth** so emails don't land in spam).

## 4. Deploy it for real (Vercel, free tier)

1. Push this folder to a new GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import that repo.
3. In the project's **Environment Variables**, add the same three variables from your
   `.env.local` (set `NEXT_PUBLIC_SITE_URL` to the `https://your-app.vercel.app` URL
   Vercel gives you — you can update it after the first deploy once you know the URL).
4. Click **Deploy**.
5. Back in Supabase → **Authentication → URL Configuration**, update **Site URL** and
   **Redirect URLs** to include your real `https://your-app.vercel.app` domain (and
   `/auth/callback` for the redirect URL), or signup confirmation links will send people
   to the wrong place.

That's it — the site is now live and anyone can sign up, create their own sale, and
share their own QR code.

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
