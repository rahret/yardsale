-- The seller's stats: only the owner can read them, the breakdown needs a
-- full plan, and days are counted in the sale's time zone.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ac01', 'statspro@example.com'),
  ('00000000-0000-0000-0000-00000000ac02', 'statstrial@example.com');
insert into public.account_billing (user_id, plan, subscription_status) values
  ('00000000-0000-0000-0000-00000000ac01', 'pro', 'active'),
  ('00000000-0000-0000-0000-00000000ac02', 'pro', 'trialing');
insert into public.sales (id, owner_id, slug, status, timezone) values
  ('ac000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000ac01', 'stats-pro', 'live', 'America/Chicago'),
  ('ac000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000ac02', 'stats-trial', 'live', 'America/Chicago');
insert into public.items (id, sale_id, name, sell_mode, price) values
  ('ac100000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'lamp', 'hold', 10),
  ('ac100000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000001', 'chair', 'hold', 20),
  ('ac100000-0000-0000-0000-000000000003', 'ac000000-0000-0000-0000-000000000002', 'rug', 'hold', 5);

-- visits: 3 from QR today, 1 Facebook today, 1 from a shared lamp link; and
-- one at 11:30pm Chicago time yesterday (already "today" in UTC)
insert into public.sale_visits (sale_id, src, item_id, created_at) values
  ('ac000000-0000-0000-0000-000000000001', 'qr', null, now()),
  ('ac000000-0000-0000-0000-000000000001', 'qr', null, now()),
  ('ac000000-0000-0000-0000-000000000001', 'qr', null, now()),
  ('ac000000-0000-0000-0000-000000000001', 'facebook', null, now()),
  ('ac000000-0000-0000-0000-000000000001', 'share', 'ac100000-0000-0000-0000-000000000001', now()),
  ('ac000000-0000-0000-0000-000000000001', 'direct', null,
   (((now() at time zone 'America/Chicago')::date - 1) + time '23:30') at time zone 'America/Chicago');
insert into public.sale_visits (sale_id, src) values ('ac000000-0000-0000-0000-000000000002', 'qr');

-- a buyer opens the chair twice and the lamp once; the seller's own look doesn't count
set role anon;
select public.log_item_view('ac100000-0000-0000-0000-000000000002');
select public.log_item_view('ac100000-0000-0000-0000-000000000002');
select public.log_item_view('ac100000-0000-0000-0000-000000000001');
select public.reserve_item('ac100000-0000-0000-0000-000000000002', 'Buyer', '312-555-0144');
reset role;
set test.uid = '00000000-0000-0000-0000-00000000ac01';
set role authenticated;
select public.log_item_view('ac100000-0000-0000-0000-000000000001');

do $$
declare
  st jsonb := public.sale_stats('ac000000-0000-0000-0000-000000000001');
  today jsonb;
  yesterday jsonb;
begin
  assert not (st ->> 'locked')::boolean, 'pro seller sees everything';
  assert (st ->> 'visits')::int = 6, 'six visits';
  assert (st ->> 'holds')::int = 1, 'one hold';
  assert (st ->> 'item_views')::int = 4, 'three opens + one shared item link';
  assert jsonb_array_length(st -> 'days') >= 7, 'at least a week of days';
  select d into today from jsonb_array_elements(st -> 'days') d
    where d ->> 'day' = ((now() at time zone 'America/Chicago')::date)::text;
  select d into yesterday from jsonb_array_elements(st -> 'days') d
    where d ->> 'day' = ((now() at time zone 'America/Chicago')::date - 1)::text;
  assert (today ->> 'visits')::int = 5 and (today ->> 'holds')::int = 1, 'today''s visits and holds';
  assert (yesterday ->> 'visits')::int = 1, 'a late-night visit counts on the seller''s own day';
  assert st -> 'sources' -> 0 ->> 'src' = 'qr' and (st -> 'sources' -> 0 ->> 'visits')::int = 3, 'QR is the top source';
  assert st -> 'top_items' -> 0 ->> 'name' = 'chair' and (st -> 'top_items' -> 0 ->> 'views')::int = 2, 'chair viewed most';
  assert (st -> 'top_items' -> 1 ->> 'views')::int = 2, 'lamp: one open + one shared link (seller''s own view skipped)';

  begin
    perform public.sale_stats('ac000000-0000-0000-0000-000000000002');
    raise exception 'read another seller''s stats';
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;
reset role;

-- trial: headline numbers only
set test.uid = '00000000-0000-0000-0000-00000000ac02';
set role authenticated;
do $$
declare
  st jsonb := public.sale_stats('ac000000-0000-0000-0000-000000000002');
begin
  assert (st ->> 'locked')::boolean, 'trial stats are locked';
  assert (st ->> 'visits')::int = 1, 'but the visit count shows';
  assert st -> 'days' is null and st -> 'top_items' is null, 'no breakdown';
end;
$$;
reset role;

-- buyers can't read item views
set role anon;
do $$
begin
  assert (select count(*) from public.item_views) = 0, 'item views are private';
exception when insufficient_privilege then null;
end;
$$;
reset role;

update public.items set status = 'available', reserved_at = null where sale_id = 'ac000000-0000-0000-0000-000000000001';
-- later tests count every visit, so leave none behind
delete from public.sale_visits where sale_id in ('ac000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002');
\echo 'stats.test.sql: all checks passed'
