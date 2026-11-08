-- Copying a sale and moving unsold items to the next sale.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'copier@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'other@example.com'),
  ('00000000-0000-0000-0000-0000000000e3', 'copytrial@example.com');
insert into public.account_billing (user_id, plan, subscription_status) values
  ('00000000-0000-0000-0000-0000000000e1', 'pro', 'active'),
  ('00000000-0000-0000-0000-0000000000e2', 'pro', 'active'),
  ('00000000-0000-0000-0000-0000000000e3', 'pro', 'trialing');

-- a sale with: a single item, a sold item, an item on hold, a part-sold bulk
-- lot (10, 4 left, $12 revenue), a sold-out bulk lot, and photos
insert into public.sales (id, owner_id, slug, name, tagline, street, city, status, note, accepted_payments) values
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'spring', 'Spring sale',
   'all must go', '12 Elm St', 'Springfield', 'ended', 'half off after noon', '{cash,venmo}'),
  ('c2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'theirs', 'Theirs', '', '', '', 'live', '', '{}');
insert into public.sale_days (sale_id, date, start_time, end_time) values
  ('c1000000-0000-0000-0000-000000000001', '2026-04-04', '08:00', '14:00');
insert into public.items (id, sale_id, name, price, sell_mode, status, quantity_total, quantity_available, revenue, created_at) values
  ('c1100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'chair', 10, 'hold', 'available', 1, 1, 0, now() - interval '5 min'),
  ('c1100000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'lamp', 5, 'in_person', 'sold', 1, 1, 5, now() - interval '4 min'),
  ('c1100000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'bike', 40, 'hold', 'reserved', 1, 1, 0, now() - interval '3 min'),
  ('c1100000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'books', 2, 'in_person', 'available', 10, 4, 12, now() - interval '2 min'),
  ('c1100000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'cups', 1, 'in_person', 'available', 6, 0, 6, now() - interval '1 min');
insert into public.item_photos (item_id, storage_path, position) values
  ('c1100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001/chair/a.jpg', 0),
  ('c1100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001/chair/b.jpg', 1),
  ('c1100000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001/books/a.jpg', 0);

set test.uid = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
do $$
declare
  v_new uuid;
  v_all uuid;
  v_none uuid;
  v_moved int;
begin
  -- ---- copy with unsold items ---------------------------------------------------
  v_new := public.copy_sale('c1000000-0000-0000-0000-000000000001', 'Fall sale', 'fall-1', 'unsold');
  assert (select status from public.sales where id = v_new) = 'draft', 'the copy is a draft';
  assert (select name from public.sales where id = v_new) = 'Fall sale', 'new name';
  assert (select street || '|' || city || '|' || tagline from public.sales where id = v_new) = '12 Elm St|Springfield|all must go',
    'address and tagline copied';
  assert (select accepted_payments from public.sales where id = v_new) = '{cash,venmo}', 'payment methods copied';
  assert (select note from public.sales where id = v_new) = '', 'note to buyers not copied';
  assert not exists (select 1 from public.sale_days where sale_id = v_new), 'dates not copied';
  assert (select string_agg(name, ',' order by created_at) from public.items where sale_id = v_new) = 'chair,bike,books',
    'unsold items copied in order (on-hold counts as unsold)';
  assert (select status from public.items where sale_id = v_new and name = 'bike') = 'available', 'hold not copied';
  assert (select sell_mode from public.items where sale_id = v_new and name = 'chair') = 'hold', 'sell mode copied';
  assert (select quantity_total || '/' || quantity_available || '/' || revenue from public.items where sale_id = v_new and name = 'books') = '4/4/0.00',
    'bulk lot brings only what is left, no revenue';
  assert (select count(*) from public.item_photos p join public.items i on i.id = p.item_id where i.sale_id = v_new) = 3,
    'photos copied (same files)';
  assert (select string_agg(storage_path, ',' order by position) from public.item_photos p join public.items i on i.id = p.item_id
          where i.sale_id = v_new and i.name = 'chair') = 'c1000000-0000-0000-0000-000000000001/chair/a.jpg,c1000000-0000-0000-0000-000000000001/chair/b.jpg',
    'photo order kept';

  -- ---- copy with all / no items -------------------------------------------------
  v_all := public.copy_sale('c1000000-0000-0000-0000-000000000001', '', 'all-1', 'all');
  assert (select name from public.sales where id = v_all) = 'Spring sale', 'blank name keeps the old one';
  assert (select count(*) from public.items where sale_id = v_all) = 5, 'all items copied';
  assert (select count(*) from public.items where sale_id = v_all and status = 'available') = 5, 'all start available';
  assert (select quantity_available from public.items where sale_id = v_all and name = 'cups') = 6, 'bulk lots restocked';
  v_none := public.copy_sale('c1000000-0000-0000-0000-000000000001', 'Empty', 'none-1', 'none');
  assert not exists (select 1 from public.items where sale_id = v_none), 'no items copied';

  -- can't copy someone else's sale
  begin
    perform public.copy_sale('c2000000-0000-0000-0000-000000000001', 'Mine now', 'steal-1', 'all');
    raise exception 'copied another seller''s sale';
  exception when sqlstate 'P0001' then null;
  end;

  -- ---- move unsold items --------------------------------------------------------
  v_moved := public.move_unsold_items('c1000000-0000-0000-0000-000000000001', v_none);
  assert v_moved = 2, 'chair and the rest of the books moved (hold and sold stay)';
  assert (select sale_id from public.items where id = 'c1100000-0000-0000-0000-000000000001') = v_none, 'chair moved itself';
  assert (select count(*) from public.item_photos where item_id = 'c1100000-0000-0000-0000-000000000001') = 2, 'photos went with it';
  assert (select quantity_total || '/' || quantity_available || '/' || status || '/' || revenue
          from public.items where id = 'c1100000-0000-0000-0000-000000000004') = '6/0/sold/12.00',
    'sold part of the bulk lot stays behind with its revenue';
  assert (select quantity_total || '/' || quantity_available from public.items where sale_id = v_none and name = 'books') = '4/4',
    'the rest of the bulk lot is in the next sale';
  assert (select status from public.items where id = 'c1100000-0000-0000-0000-000000000003') = 'reserved', 'item on hold stays';
  assert public.move_unsold_items('c1000000-0000-0000-0000-000000000001', v_none) = 0, 'nothing left to move';

  begin
    perform public.move_unsold_items(v_none, 'c2000000-0000-0000-0000-000000000001');
    raise exception 'moved items into another seller''s sale';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.move_unsold_items(v_none, v_none);
    raise exception 'moved items into the same sale';
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;
reset role;

-- ---- the trial's one-sale limit applies to copies -------------------------------
insert into public.sales (id, owner_id, slug) values
  ('c3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e3', 'trial-copy');
set test.uid = '00000000-0000-0000-0000-0000000000e3';
set role authenticated;
do $$
begin
  begin
    perform public.copy_sale('c3000000-0000-0000-0000-000000000001', 'Again', 'trial-copy-2', 'all');
    raise exception 'trial seller copied their sale';
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;
reset role;
\echo 'copy.test.sql: all checks passed'
