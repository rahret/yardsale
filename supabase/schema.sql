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

-- ----------------------------------------------------------------------------
-- sales: one garage sale, owned by a user. a user can own many sales.
-- ----------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique,
  name text not null default 'My Garage Sale',
  tagline text not null default 'everything must go — cash or Venmo',
  address text not null default '',
  default_reservation_minutes int not null default 30,
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  reserved_history text[] not null default '{}', -- normalized phone numbers that already reserved an item in this sale
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- backfill for databases created before these columns existed
alter table public.sales add column if not exists address text not null default '';
alter table public.sales add column if not exists reserved_history text[] not null default '{}';

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
  address text not null,
  created_at timestamptz not null default now()
);

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
  reserved_name text,
  reserved_phone text,
  reserved_at timestamptz,
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

-- reservation history moved to sales.reserved_history: buyers are now
-- limited to one reservation per person per sale, not per item.
alter table public.items drop column if exists reserved_history;

-- backfill for databases created before quantity tracking existed
alter table public.items add column if not exists quantity_total int not null default 1;
alter table public.items add column if not exists quantity_available int not null default 1;

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
-- GRANTS: Row Level Security only restricts which *rows* a role can touch —
-- the role still needs baseline table-level privileges before RLS is even
-- evaluated. Some Supabase projects don't pre-grant these to anon/authenticated
-- for tables created via the SQL editor, which surfaces as "permission denied
-- for table X" (a plain Postgres grant error, not an RLS violation). Granting
-- explicitly here makes this schema work regardless of that default.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, update on public.profiles to anon, authenticated;
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
    new.reserved_name := null;
    new.reserved_phone := null;
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
-- (positive delta to restock/undo, negative delta to record units just sold),
-- clamped to [0, quantity_total]. Runs with the caller's own privileges, so
-- the existing "owners can update items in their own sales" RLS policy is
-- still what decides who is allowed to call this successfully.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_item_quantity(p_item_id uuid, p_delta int)
returns public.items
language plpgsql
as $$
declare
  v_item public.items%rowtype;
begin
  update public.items
  set quantity_available = greatest(0, least(quantity_total, quantity_available + p_delta))
  where id = p_item_id
  returning * into v_item;

  if not found then
    raise exception 'Item not found or not authorized';
  end if;

  return v_item;
end;
$$;

grant execute on function public.adjust_item_quantity(uuid, int) to authenticated;

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
      reserved_name = null,
      reserved_phone = null,
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
-- win it, enforces "one reservation per person per sale" (tracked on
-- sales.reserved_history, not per item), respects the sale being live, and
-- auto-expires stale reservations first. The sales row is locked for the
-- duration of the transaction so two concurrent reservation attempts by the
-- same phone number (on different items) can't both slip past the check.
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
begin
  v_norm_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if length(trim(coalesce(p_name, ''))) = 0 then
    return jsonb_build_object('success', false, 'error', 'Enter your name.');
  end if;
  if length(v_norm_phone) < 7 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid phone number.');
  end if;

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
    v_item.reserved_name := null;
    v_item.reserved_phone := null;
    v_item.reserved_at := null;
  end if;

  if v_item.status = 'sold' then
    return jsonb_build_object('success', false, 'error', 'This item has already sold.');
  end if;
  if v_item.status = 'reserved' then
    return jsonb_build_object('success', false, 'error', 'Someone just reserved this — try another item!');
  end if;
  if v_norm_phone = any(v_sale.reserved_history) then
    return jsonb_build_object('success', false, 'error', 'You''ve already made a reservation for this sale — one reservation per person.');
  end if;

  update public.items
  set status = 'reserved',
      reserved_name = trim(p_name),
      reserved_phone = trim(p_phone),
      reserved_at = now()
  where id = p_item_id;

  update public.sales
  set reserved_history = array_append(v_sale.reserved_history, v_norm_phone)
  where id = v_sale.id;

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
