-- Buy Now orders: completing payments, double-sell protection, and access.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'orders-seller@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'orders-other@example.com');
insert into public.sales (id, owner_id, slug, status) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'orders-sale', 'live');
insert into public.items (id, sale_id, name, price, status, reserved_at) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'rocking chair', 25, 'available', null),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'bike', 100, 'reserved', now()),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'lamp', 15, 'reserved', now() - interval '2 hours');
insert into public.orders (id, sale_id, item_id, item_name, amount_cents, fee_cents, pickup_code) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'rocking chair', 2500, 103, '0421'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'rocking chair', 2500, 103, '9999'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'bike', 10000, 320, '1111'),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'lamp', 1500, 74, '2222');

do $$
begin
  -- first buyer gets the chair
  assert public.complete_order('e0000000-0000-0000-0000-000000000001', 'pi_1', 'a@x.com', 'Sam') = 'paid', 'first buyer pays';
  assert (select status from public.items where id = 'd0000000-0000-0000-0000-000000000001') = 'sold', 'item sold';
  assert (select revenue from public.items where id = 'd0000000-0000-0000-0000-000000000001') = 25, 'revenue recorded';
  assert (select buyer_name from public.orders where id = 'e0000000-0000-0000-0000-000000000001') = 'Sam', 'pickup name saved';

  -- Stripe retries the same event: nothing changes, revenue not doubled
  assert public.complete_order('e0000000-0000-0000-0000-000000000001', 'pi_1', 'a@x.com', 'Sam') = 'paid', 'retry is harmless';
  assert (select revenue from public.items where id = 'd0000000-0000-0000-0000-000000000001') = 25, 'revenue not doubled';

  -- a second buyer who paid for the same chair is flagged for refund
  assert public.complete_order('e0000000-0000-0000-0000-000000000002', 'pi_2', 'b@x.com', 'Lee') = 'conflict', 'second buyer conflicts';

  -- an item someone is actively holding can't be bought out from under them
  assert public.complete_order('e0000000-0000-0000-0000-000000000003', 'pi_3', 'c@x.com', null) = 'conflict', 'active hold wins';
  assert (select status from public.items where id = 'd0000000-0000-0000-0000-000000000002') = 'reserved', 'hold kept';

  -- but a hold that has already expired doesn't block a paid order
  assert public.complete_order('e0000000-0000-0000-0000-000000000004', 'pi_4', 'd@x.com', null) = 'paid', 'expired hold yields';
  assert (select status from public.items where id = 'd0000000-0000-0000-0000-000000000003') = 'sold', 'lamp sold';
  assert not exists (select 1 from public.item_holds where item_id = 'd0000000-0000-0000-0000-000000000003'), 'old hold cleared';

  assert public.complete_order('e0000000-0000-0000-0000-0000000000ff', 'pi_x', null, null) = 'missing', 'unknown order';
end;
$$;

-- only the seller can read their orders; nobody but the server can complete one
set test.uid = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
do $$
begin
  assert (select count(*) from public.orders) = 4, 'seller sees their orders';
  begin
    perform public.complete_order('e0000000-0000-0000-0000-000000000002', 'pi_fake', null, null);
    raise exception 'sellers must not be able to complete orders';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.orders set status = 'paid';
    if found then raise exception 'sellers must not be able to edit orders'; end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set test.uid = '00000000-0000-0000-0000-0000000000c2';
set role authenticated;
do $$ begin assert (select count(*) from public.orders) = 0, 'other users see no orders'; end; $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.orders;
    raise exception 'anon must not read orders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.complete_order('e0000000-0000-0000-0000-000000000002', 'pi_fake', null, null);
    raise exception 'anon must not complete orders';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Buy Now and Hold are mutually exclusive per item
insert into public.items (id, sale_id, name, price, sell_mode) values
  ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'dresser', 80, 'buy_now');
do $$
begin
  assert (public.reserve_item('d0000000-0000-0000-0000-000000000009', 'Pat', '312-555-0177') ->> 'error') like '%use Buy Now%',
    'holds are refused on Buy Now items';
  assert (select status from public.items where id = 'd0000000-0000-0000-0000-000000000009') = 'available', 'still available';
  begin
    insert into public.items (sale_id, name, price, sell_mode, quantity_total, quantity_available)
    values ('c0000000-0000-0000-0000-000000000001', 'books', 1, 'buy_now', 20, 20);
    raise exception 'bulk items must not be Buy Now';
  exception when check_violation then null;
  end;
end;
$$;

\echo 'orders.test.sql: all checks passed'
