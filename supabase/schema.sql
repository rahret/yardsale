-- ============================================================================
-- Garage Sale HQ — database schema
-- Run this once in your Supabase project's SQL editor (Project -> SQL Editor
-- -> New query -> paste this whole file -> Run).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles: one row per signed-up user, auto-created on signup
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- extra profile fields edited on the Account page
alter table public.profiles add column if not exists phone text not null default '';
-- how buyers can pay this seller today (before card payments are set up), e.g.
-- {"cash": true, "venmo": "@jamie", "cashapp": "$jamie", "paypal": "", "zelle": ""}
alter table public.profiles add column if not exists payment_options jsonb not null default '{"cash": true}';

-- ----------------------------------------------------------------------------
-- account_billing: subscription plan + Stripe ids, one row per user.
-- Kept out of `profiles` on purpose: users may update their own profile, but
-- must never be able to change their own plan or Stripe ids. Users can only
-- READ their row; it is written server-side (service role) by Stripe
-- webhooks. A missing row means the free plan.
-- ----------------------------------------------------------------------------
create table if not exists public.account_billing (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  -- mirrors Stripe's subscription.status: active, trialing, past_due, canceled, ...
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- Stripe Connect (Express) account used to pay out sellers for card sales
  stripe_connect_account_id text unique,
  connect_charges_enabled boolean not null default false,
  connect_payouts_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.account_billing enable row level security;

drop policy if exists "Users can view their own billing" on public.account_billing;
create policy "Users can view their own billing"
  on public.account_billing for select
  using (auth.uid() = user_id);

-- lets a signed-in user permanently delete their own account. Deleting the
-- auth user cascades to profiles, sales, items, sale_days, saved_locations,
-- and account_billing. (Photo files in Storage are removed by the app first.)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ----------------------------------------------------------------------------
-- sales: one garage sale, owned by a user. a user can own many sales.
-- ----------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique,
  name text not null default 'My Garage Sale',
  tagline text not null default 'everything must go — cash or Venmo',
  street text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  default_reservation_minutes int not null default 30,
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- address was originally one free-text field; split into street/city/state/zip
-- so the app never has to guess where "street" ends inside a comma-joined
-- string (e.g. the printed sign, which only wants the street). Existing
-- sales will need their address re-entered in the new fields.
alter table public.sales add column if not exists street text not null default '';
alter table public.sales add column if not exists city text not null default '';
alter table public.sales add column if not exists state text not null default '';
alter table public.sales add column if not exists zip text not null default '';
alter table public.sales drop column if exists address;

-- starts_at/ends_at (a single date range) were replaced by the sale_days
-- table below, which supports different hours on different days.
alter table public.sales drop column if exists starts_at;
alter table public.sales drop column if exists ends_at;

create index if not exists sales_owner_id_idx on public.sales (owner_id);

alter table public.sales enable row level security;

drop policy if exists "Owners can view their own sales" on public.sales;
create policy "Owners can view their own sales"
  on public.sales for select
  using (auth.uid() = owner_id);

drop policy if exists "Public can view non-draft sales" on public.sales;
create policy "Public can view non-draft sales"
  on public.sales for select
  using (status <> 'draft');

drop policy if exists "Owners can insert their own sales" on public.sales;
create policy "Owners can insert their own sales"
  on public.sales for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update their own sales" on public.sales;
create policy "Owners can update their own sales"
  on public.sales for update
  using (auth.uid() = owner_id);

drop policy if exists "Owners can delete their own sales" on public.sales;
create policy "Owners can delete their own sales"
  on public.sales for delete
  using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- sale_days: per-day open hours for a sale. Yard sales commonly run 1-4 days
-- with different hours each day (e.g. Fri 10-4, Sat/Sun 8-12), so hours are
-- tracked per calendar date rather than as a single start/end range.
-- ----------------------------------------------------------------------------
create table if not exists public.sale_days (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  unique (sale_id, date)
);

create index if not exists sale_days_sale_id_idx on public.sale_days (sale_id);

alter table public.sale_days enable row level security;

drop policy if exists "Owners can view their own sale days" on public.sale_days;
create policy "Owners can view their own sale days"
  on public.sale_days for select
  using (exists (select 1 from public.sales s where s.id = sale_days.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Public can view days of visible sales" on public.sale_days;
create policy "Public can view days of visible sales"
  on public.sale_days for select
  using (exists (select 1 from public.sales s where s.id = sale_days.sale_id and s.status <> 'draft'));

drop policy if exists "Owners can insert days for their own sales" on public.sale_days;
create policy "Owners can insert days for their own sales"
  on public.sale_days for insert
  with check (exists (select 1 from public.sales s where s.id = sale_days.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Owners can update days for their own sales" on public.sale_days;
create policy "Owners can update days for their own sales"
  on public.sale_days for update
  using (exists (select 1 from public.sales s where s.id = sale_days.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Owners can delete days for their own sales" on public.sale_days;
create policy "Owners can delete days for their own sales"
  on public.sale_days for delete
  using (exists (select 1 from public.sales s where s.id = sale_days.sale_id and s.owner_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- saved_locations: addresses a seller has saved for quick reuse across sales
-- ----------------------------------------------------------------------------
create table if not exists public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '',
  street text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  created_at timestamptz not null default now()
);

-- split the same way as sales.address above; existing saved locations will
-- need to be re-saved in the new fields.
alter table public.saved_locations add column if not exists street text not null default '';
alter table public.saved_locations add column if not exists city text not null default '';
alter table public.saved_locations add column if not exists state text not null default '';
alter table public.saved_locations add column if not exists zip text not null default '';
alter table public.saved_locations drop column if exists address;

create index if not exists saved_locations_owner_id_idx on public.saved_locations (owner_id);

alter table public.saved_locations enable row level security;

drop policy if exists "Owners can view their own saved locations" on public.saved_locations;
create policy "Owners can view their own saved locations"
  on public.saved_locations for select
  using (auth.uid() = owner_id);

drop policy if exists "Owners can insert their own saved locations" on public.saved_locations;
create policy "Owners can insert their own saved locations"
  on public.saved_locations for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update their own saved locations" on public.saved_locations;
create policy "Owners can update their own saved locations"
  on public.saved_locations for update
  using (auth.uid() = owner_id);

drop policy if exists "Owners can delete their own saved locations" on public.saved_locations;
create policy "Owners can delete their own saved locations"
  on public.saved_locations for delete
  using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- items: belong to a sale
-- ----------------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'Misc',
  price numeric(10, 2) not null default 0,
  icon text not null default '📦',
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'low_stock')),
  reservation_minutes int, -- null = use sale.default_reservation_minutes
  reserved_at timestamptz, -- the buyer's name/phone live in the private item_holds table
  sold_at timestamptz,
  sort_order int not null default 0,
  -- quantity_total = starting quantity (shown to buyers), quantity_available =
  -- live remaining count (seller-only; a bulk item is one with quantity_total
  -- > 1, e.g. "20 identical books sold as one item card").
  quantity_total int not null default 1 check (quantity_total >= 1),
  quantity_available int not null default 1 check (quantity_available >= 0 and quantity_available <= quantity_total),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- per-item reservation history was replaced by the private
-- reservation_log table (one reservation per person per sale).
alter table public.items drop column if exists reserved_history;

-- backfill for databases created before quantity tracking existed
alter table public.items add column if not exists quantity_total int not null default 1;
alter table public.items add column if not exists quantity_available int not null default 1;

-- revenue: actual $ collected for this item so far, tracked separately from
-- `price` (the list price) because a seller may negotiate a different sale
-- price per unit, and a bulk item can sell in several batches at different
-- negotiated prices over time. Set on the single-item "mark sold" flow and
-- accumulated by record_bulk_sale() below; `price` itself never changes when
-- an item sells.
alter table public.items add column if not exists revenue numeric(10, 2) not null default 0;

-- backfill for items already marked sold before sale-price tracking existed —
-- assume they sold at list price so the Revenue stat doesn't drop to zero.
update public.items
set revenue = case
  when quantity_total > 1 then price * (quantity_total - quantity_available)
  when status = 'sold' then price
  else 0
end
where revenue = 0
  and (
    (quantity_total > 1 and quantity_available < quantity_total)
    or (quantity_total = 1 and status = 'sold')
  );

alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check check (status in ('available', 'reserved', 'sold', 'low_stock'));

alter table public.items drop constraint if exists items_quantity_total_check;
alter table public.items add constraint items_quantity_total_check check (quantity_total >= 1);

alter table public.items drop constraint if exists items_quantity_available_check;
alter table public.items add constraint items_quantity_available_check
  check (quantity_available >= 0 and quantity_available <= quantity_total);

create index if not exists items_sale_id_idx on public.items (sale_id);

alter table public.items enable row level security;

drop policy if exists "Owners can view their own items" on public.items;
create policy "Owners can view their own items"
  on public.items for select
  using (exists (select 1 from public.sales s where s.id = items.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Public can view items of visible sales" on public.items;
create policy "Public can view items of visible sales"
  on public.items for select
  using (exists (select 1 from public.sales s where s.id = items.sale_id and s.status <> 'draft'));

drop policy if exists "Owners can insert items into their own sales" on public.items;
create policy "Owners can insert items into their own sales"
  on public.items for insert
  with check (exists (select 1 from public.sales s where s.id = items.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Owners can update items in their own sales" on public.items;
create policy "Owners can update items in their own sales"
  on public.items for update
  using (exists (select 1 from public.sales s where s.id = items.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Owners can delete items in their own sales" on public.items;
create policy "Owners can delete items in their own sales"
  on public.items for delete
  using (exists (select 1 from public.sales s where s.id = items.sale_id and s.owner_id = auth.uid()));

-- NOTE: there is intentionally no public UPDATE policy on items. Buyers can
-- only change item status via the reserve_item() function below, which runs
-- with elevated privileges and enforces all the reservation rules atomically.

-- ----------------------------------------------------------------------------
-- item_photos: 0..n photos per item, stored in the "item-photos" storage bucket
-- ----------------------------------------------------------------------------
create table if not exists public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists item_photos_item_id_idx on public.item_photos (item_id);

alter table public.item_photos enable row level security;

drop policy if exists "Owners can view their own item photos" on public.item_photos;
create policy "Owners can view their own item photos"
  on public.item_photos for select
  using (
    exists (
      select 1 from public.items i
      join public.sales s on s.id = i.sale_id
      where i.id = item_photos.item_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Public can view photos of visible items" on public.item_photos;
create policy "Public can view photos of visible items"
  on public.item_photos for select
  using (
    exists (
      select 1 from public.items i
      join public.sales s on s.id = i.sale_id
      where i.id = item_photos.item_id and s.status <> 'draft'
    )
  );

drop policy if exists "Owners can insert photos for their own items" on public.item_photos;
create policy "Owners can insert photos for their own items"
  on public.item_photos for insert
  with check (
    exists (
      select 1 from public.items i
      join public.sales s on s.id = i.sale_id
      where i.id = item_photos.item_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete photos for their own items" on public.item_photos;
create policy "Owners can delete photos for their own items"
  on public.item_photos for delete
  using (
    exists (
      select 1 from public.items i
      join public.sales s on s.id = i.sale_id
      where i.id = item_photos.item_id and s.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- item_holds: who is holding a reserved item (buyer name + phone). Kept out of
-- `items` because items are publicly readable on live sales — only the sale's
-- owner may see who reserved what. One row per currently-reserved item;
-- written by reserve_item() and removed automatically when the item stops
-- being reserved (see items_clear_hold below).
-- ----------------------------------------------------------------------------
create table if not exists public.item_holds (
  item_id uuid primary key references public.items (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create index if not exists item_holds_sale_id_idx on public.item_holds (sale_id);

alter table public.item_holds enable row level security;

drop policy if exists "Owners can view holds on their own sales" on public.item_holds;
create policy "Owners can view holds on their own sales"
  on public.item_holds for select
  using (exists (select 1 from public.sales s where s.id = item_holds.sale_id and s.owner_id = auth.uid()));

drop policy if exists "Owners can delete holds on their own sales" on public.item_holds;
create policy "Owners can delete holds on their own sales"
  on public.item_holds for delete
  using (exists (select 1 from public.sales s where s.id = item_holds.sale_id and s.owner_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- reservation_log: one row per successful reservation. Not readable by any
-- app user (no policies/grants) — only reserve_item() touches it, to enforce
-- one reservation per phone number per sale and per-device rate limits.
-- ----------------------------------------------------------------------------
create table if not exists public.reservation_log (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales (id) on delete cascade,
  phone text not null, -- normalized digits only
  client_ip text,
  created_at timestamptz not null default now()
);

create index if not exists reservation_log_sale_phone_idx on public.reservation_log (sale_id, phone);
create index if not exists reservation_log_ip_idx on public.reservation_log (client_ip, created_at);

alter table public.reservation_log enable row level security;

-- one-time migration for databases created before item_holds/reservation_log:
-- buyer names/phones used to live on publicly readable items/sales columns.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'items' and column_name = 'reserved_phone') then
    insert into public.item_holds (item_id, sale_id, name, phone, created_at)
    select id, sale_id, coalesce(reserved_name, ''), reserved_phone, coalesce(reserved_at, now())
    from public.items
    where status = 'reserved' and reserved_phone is not null
    on conflict (item_id) do nothing;
    alter table public.items drop column if exists reserved_name;
    alter table public.items drop column reserved_phone;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sales' and column_name = 'reserved_history') then
    insert into public.reservation_log (sale_id, phone)
    select s.id, h.phone from public.sales s, unnest(s.reserved_history) as h(phone);
    alter table public.sales drop column reserved_history;
  end if;
end;
$$;

-- remove the hold row whenever an item stops being reserved (sold, released
-- by the seller, expired by sweep_expired_reservations, ...).
create or replace function public.clear_item_hold()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status <> 'reserved' then
    delete from public.item_holds where item_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists items_clear_hold on public.items;
create trigger items_clear_hold
  after update of status on public.items
  for each row execute procedure public.clear_item_hold();

-- ----------------------------------------------------------------------------
-- GRANTS: Row Level Security only restricts which *rows* a role can touch —
-- the role still needs baseline table-level privileges before RLS is even
-- evaluated. Some Supabase projects don't pre-grant these to anon/authenticated
-- for tables created via the SQL editor, which surfaces as "permission denied
-- for table X" (a plain Postgres grant error, not an RLS violation). Granting
-- explicitly here makes this schema work regardless of that default.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to anon, authenticated;
grant select on public.account_billing to authenticated;
grant select, delete on public.item_holds to authenticated;
grant select, insert, update, delete on public.sales to anon, authenticated;
grant select, insert, update, delete on public.sale_days to anon, authenticated;
grant select, insert, update, delete on public.items to anon, authenticated;
grant select, insert, update, delete on public.item_photos to anon, authenticated;
grant select, insert, update, delete on public.saved_locations to authenticated;

-- ----------------------------------------------------------------------------
-- keep updated_at fresh
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at before update on public.sales
  for each row execute procedure public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at before update on public.items
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- sync_item_status: for bulk items (quantity_total > 1) the status is fully
-- derived from quantity_available rather than set by hand — sold out once
-- quantity_available hits 0, "low_stock" once it drops under 26% of
-- quantity_total, else available. Runs on insert, on any change to the
-- quantity columns, and on any attempt to write `status` directly (e.g. a
-- stale client trying to set a bulk item to "reserved") so the derived value
-- always wins for bulk items. Single items (quantity_total = 1) are
-- untouched here and keep the hand-managed available/reserved/sold flow.
-- ----------------------------------------------------------------------------
create or replace function public.sync_item_status()
returns trigger
language plpgsql
as $$
begin
  if new.quantity_total > 1 then
    if new.quantity_available <= 0 then
      new.status := 'sold';
      new.sold_at := coalesce(new.sold_at, now());
    else
      new.sold_at := null;
      if new.quantity_available::numeric / new.quantity_total::numeric < 0.26 then
        new.status := 'low_stock';
      else
        new.status := 'available';
      end if;
    end if;
    -- bulk items are never reservable, so they should never carry hold state
    new.reserved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists items_sync_status on public.items;
create trigger items_sync_status
  before insert or update of quantity_total, quantity_available, status on public.items
  for each row execute procedure public.sync_item_status();

-- ----------------------------------------------------------------------------
-- adjust_item_quantity: atomically bumps a bulk item's live available count
-- (positive delta to restock/undo, negative delta to record a quick sale of
-- units at list price), clamped to [0, quantity_total]. Revenue moves with
-- the actual (clamped) quantity change, priced at the item's current list
-- price — this is the fast no-prompt path (the "− sold 1" / "+ restock 1"
-- buttons); negotiated-price sales go through record_bulk_sale() instead.
-- Runs with the caller's own privileges, so the existing "owners can update
-- items in their own sales" RLS policy is still what decides who is allowed
-- to call this successfully.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_item_quantity(p_item_id uuid, p_delta int)
returns public.items
language plpgsql
as $$
declare
  v_item public.items%rowtype;
  v_after int;
  v_actual_delta int;
begin
  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found or not authorized';
  end if;

  v_after := greatest(0, least(v_item.quantity_total, v_item.quantity_available + p_delta));
  v_actual_delta := v_after - v_item.quantity_available;

  update public.items
  set quantity_available = v_after,
      revenue = greatest(0, revenue - v_actual_delta * price)
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;

grant execute on function public.adjust_item_quantity(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- record_bulk_sale: records the sale of p_qty units of a bulk item at a
-- (possibly negotiated) p_unit_price, decrementing quantity_available and
-- adding to the item's accumulated revenue in one atomic step. p_qty is
-- clamped to however many units are actually available, so revenue never
-- counts more units than were really sold. Runs with the caller's own
-- privileges, same RLS policy as adjust_item_quantity above.
-- ----------------------------------------------------------------------------
create or replace function public.record_bulk_sale(p_item_id uuid, p_qty int, p_unit_price numeric)
returns public.items
language plpgsql
as $$
declare
  v_item public.items%rowtype;
  v_sold int;
begin
  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found or not authorized';
  end if;

  v_sold := greatest(0, least(p_qty, v_item.quantity_available));

  update public.items
  set quantity_available = quantity_available - v_sold,
      revenue = revenue + (v_sold * p_unit_price)
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;

grant execute on function public.record_bulk_sale(uuid, int, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- restock_bulk_item: reverses the sale of p_qty units of a bulk item,
-- crediting them back to quantity_available and removing p_qty * p_unit_price
-- from the item's accumulated revenue. p_qty is clamped to however many
-- units are actually recorded as sold (quantity_total - quantity_available),
-- and revenue never drops below 0. Runs with the caller's own privileges,
-- same RLS policy as record_bulk_sale above.
-- ----------------------------------------------------------------------------
create or replace function public.restock_bulk_item(p_item_id uuid, p_qty int, p_unit_price numeric)
returns public.items
language plpgsql
as $$
declare
  v_item public.items%rowtype;
  v_restocked int;
begin
  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found or not authorized';
  end if;

  v_restocked := greatest(0, least(p_qty, v_item.quantity_total - v_item.quantity_available));

  update public.items
  set quantity_available = quantity_available + v_restocked,
      revenue = greatest(0, revenue - (v_restocked * p_unit_price))
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$$;

grant execute on function public.restock_bulk_item(uuid, int, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- sweep_expired_reservations: flips any item whose reservation window has
-- passed back to "available". Safe to call anonymously and often (the public
-- shop page calls this on load and every ~4s while viewers are browsing).
-- ----------------------------------------------------------------------------
create or replace function public.sweep_expired_reservations(p_sale_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.items i
  set status = 'available',
      reserved_at = null
  from public.sales s
  where i.sale_id = s.id
    and i.sale_id = p_sale_id
    and i.status = 'reserved'
    and i.reserved_at + make_interval(mins => coalesce(i.reservation_minutes, s.default_reservation_minutes)) < now();
end;
$$;

grant execute on function public.sweep_expired_reservations(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- reserve_item: the only way a buyer can place a hold on an item. Runs as a
-- single atomic transaction so two people racing for the same item can't both
-- win it, respects the sale being live, and auto-expires stale reservations
-- first. Abuse limits (all tracked in the private reservation_log):
--   * the phone must look like a real US/Canada number (10 digits, valid area
--     code and exchange, not one repeated digit);
--   * one reservation per phone number per sale;
--   * per device (client IP, when the request carries one): at most 3
--     reservations per sale and 10 across all sales per hour, so one person
--     can't hold everything by typing made-up numbers. (Kept loose because
--     mobile carriers often share one IP across many phones.)
-- The sales row is locked for the duration of the transaction so concurrent
-- attempts on the same sale can't both slip past these checks.
-- ----------------------------------------------------------------------------
create or replace function public.reserve_item(
  p_item_id uuid,
  p_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_sale public.sales%rowtype;
  v_norm_phone text;
  v_minutes int;
  v_headers json;
  v_ip text;
begin
  v_norm_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_norm_phone) = 11 and left(v_norm_phone, 1) = '1' then
    v_norm_phone := substr(v_norm_phone, 2);
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    return jsonb_build_object('success', false, 'error', 'Enter your name.');
  end if;
  if v_norm_phone !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' or v_norm_phone ~ '^(.)\1+$' then
    return jsonb_build_object('success', false, 'error', 'Enter a valid 10-digit phone number.');
  end if;

  -- Supabase passes the HTTP request headers to Postgres; prefer the
  -- CDN-provided client IP, falling back to the first X-Forwarded-For hop.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(split_part(coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-forwarded-for',
    v_headers ->> 'x-real-ip',
    ''), ',', 1)), '');

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'This item no longer exists.');
  end if;

  if v_item.quantity_total > 1 then
    return jsonb_build_object('success', false, 'error', 'This is a bulk item sold in person — it can''t be reserved.');
  end if;

  select * into v_sale from public.sales where id = v_item.sale_id for update;
  if not found or v_sale.status <> 'live' then
    return jsonb_build_object('success', false, 'error', 'This sale is not currently accepting reservations.');
  end if;

  v_minutes := coalesce(v_item.reservation_minutes, v_sale.default_reservation_minutes);

  -- auto-expire a stale reservation before evaluating availability
  if v_item.status = 'reserved' and v_item.reserved_at + make_interval(mins => v_minutes) < now() then
    v_item.status := 'available';
  end if;

  if v_item.status = 'sold' then
    return jsonb_build_object('success', false, 'error', 'This item has already sold.');
  end if;
  if v_item.status = 'reserved' then
    return jsonb_build_object('success', false, 'error', 'Someone just reserved this — try another item!');
  end if;
  if exists (select 1 from public.reservation_log where sale_id = v_sale.id and phone = v_norm_phone) then
    return jsonb_build_object('success', false, 'error', 'You''ve already made a reservation for this sale — one reservation per person.');
  end if;
  if v_ip is not null then
    if (select count(*) from public.reservation_log where sale_id = v_sale.id and client_ip = v_ip) >= 3 then
      return jsonb_build_object('success', false, 'error', 'Too many reservations from this device for this sale.');
    end if;
    if (select count(*) from public.reservation_log
        where client_ip = v_ip and created_at > now() - interval '1 hour') >= 10 then
      return jsonb_build_object('success', false, 'error', 'Too many reservations from this device — try again later.');
    end if;
  end if;

  update public.items
  set status = 'reserved',
      reserved_at = now()
  where id = p_item_id;

  insert into public.item_holds (item_id, sale_id, name, phone)
  values (p_item_id, v_sale.id, left(trim(p_name), 60), v_norm_phone)
  on conflict (item_id) do update
    set name = excluded.name, phone = excluded.phone, created_at = now();

  insert into public.reservation_log (sale_id, phone, client_ip)
  values (v_sale.id, v_norm_phone, v_ip);

  return jsonb_build_object('success', true, 'reservation_minutes', v_minutes);
end;
$$;

grant execute on function public.reserve_item(uuid, text, text) to anon, authenticated;

-- ============================================================================
-- STORAGE: create a public bucket called "item-photos" for listing photos.
-- Do this once in the Supabase dashboard: Storage -> New bucket -> name it
-- "item-photos" -> toggle "Public bucket" ON -> Create bucket.
-- Then run the policies below (they restrict uploads/deletes to the sale's
-- owner; public read is handled by the bucket being public).
-- Upload path convention used by the app: {sale_id}/{item_id}/{random}-{filename}
-- ============================================================================

-- NOTE: storage.objects.name and public.sales.name both exist, so inside this
-- subquery an unqualified `name` resolves to sales.name (innermost scope),
-- not the uploaded file's path. It must be qualified as objects.name or this
-- check silently always evaluates false and every upload gets denied.
drop policy if exists "Owners can upload photos for their own sales" on storage.objects;
create policy "Owners can upload photos for their own sales"
  on storage.objects for insert
  with check (
    bucket_id = 'item-photos'
    and exists (
      select 1 from public.sales s
      where s.id::text = (storage.foldername(objects.name))[1]
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete photos for their own sales" on storage.objects;
create policy "Owners can delete photos for their own sales"
  on storage.objects for delete
  using (
    bucket_id = 'item-photos'
    and exists (
      select 1 from public.sales s
      where s.id::text = (storage.foldername(objects.name))[1]
        and s.owner_id = auth.uid()
    )
  );
