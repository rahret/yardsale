-- Seller plans: what each level allows, enforced on sellers' own writes.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'no-plan@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'trial@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'pro@example.com'),
  ('00000000-0000-0000-0000-0000000000b4', 'pass@example.com'),
  ('00000000-0000-0000-0000-0000000000b5', 'lapsed@example.com');
insert into public.account_billing (user_id, plan, subscription_status, pass_expires_at) values
  ('00000000-0000-0000-0000-0000000000b2', 'pro', 'trialing', null),
  ('00000000-0000-0000-0000-0000000000b3', 'pro', 'active', null),
  ('00000000-0000-0000-0000-0000000000b4', 'none', null, now() + interval '10 days'),
  ('00000000-0000-0000-0000-0000000000b5', 'none', 'canceled', now() - interval '1 day');

do $$
begin
  assert public.seller_access('00000000-0000-0000-0000-0000000000b1') = 'none', 'no row = no plan';
  assert public.seller_access('00000000-0000-0000-0000-0000000000b2') = 'trial', 'trialing';
  assert public.seller_access('00000000-0000-0000-0000-0000000000b3') = 'full', 'pro';
  assert public.seller_access('00000000-0000-0000-0000-0000000000b4') = 'full', 'sale pass';
  assert public.seller_access('00000000-0000-0000-0000-0000000000b5') = 'none', 'canceled + expired pass';
end;
$$;

-- ---- no plan: can't create a sale --------------------------------------------
set test.uid = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
do $$
begin
  begin
    insert into public.sales (owner_id, slug) values ('00000000-0000-0000-0000-0000000000b1', 'np-1');
    raise exception 'no-plan seller created a sale';
  exception when raise_exception then null;
  end;
end;
$$;
reset role;

-- ---- trial: one sale, 25 items, unlisted, first come only ---------------------
set test.uid = '00000000-0000-0000-0000-0000000000b2';
set role authenticated;
insert into public.sales (id, owner_id, slug, status) values
  ('b2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'trial-1', 'live');
do $$
begin
  assert not (select listed from public.sales where slug = 'trial-1'), 'trial sale starts unlisted';
  begin
    update public.sales set listed = true where slug = 'trial-1';
    raise exception 'trial seller listed their sale';
  exception when raise_exception then null;
  end;
  begin
    insert into public.sales (owner_id, slug) values ('00000000-0000-0000-0000-0000000000b2', 'trial-2');
    raise exception 'trial seller created a second sale';
  exception when raise_exception then null;
  end;

  begin
    insert into public.items (sale_id, name, sell_mode) values ('b2000000-0000-0000-0000-000000000001', 'held', 'hold');
    raise exception 'trial seller added a Hold item';
  exception when raise_exception then null;
  end;
  begin
    insert into public.items (sale_id, name, price, sell_mode) values ('b2000000-0000-0000-0000-000000000001', 'bought', 5, 'buy_now');
    raise exception 'trial seller added a Buy Now item';
  exception when raise_exception then null;
  end;

  -- a bulk item sent as "hold" is fine: it's always first come anyway
  insert into public.items (sale_id, name, quantity_total, quantity_available, sell_mode)
  values ('b2000000-0000-0000-0000-000000000001', 'cups', 10, 10, 'hold');
  insert into public.items (sale_id, name, sell_mode)
  select 'b2000000-0000-0000-0000-000000000001', 'thing ' || n, 'in_person' from generate_series(2, 25) n;
  assert (select count(*) from public.items where sale_id = 'b2000000-0000-0000-0000-000000000001') = 25, '25 items';

  begin
    insert into public.items (sale_id, name, sell_mode) values ('b2000000-0000-0000-0000-000000000001', 'one too many', 'in_person');
    raise exception 'trial seller added a 26th item';
  exception when raise_exception then null;
  end;

  begin
    update public.items set sell_mode = 'hold' where name = 'thing 2';
    raise exception 'trial seller switched an item to Hold';
  exception when raise_exception then null;
  end;
  -- editing an item otherwise is fine
  update public.items set price = 3 where name = 'thing 2';
end;
$$;
reset role;

-- ---- Pro and Sale Pass: everything ------------------------------------------
set test.uid = '00000000-0000-0000-0000-0000000000b3';
set role authenticated;
insert into public.sales (id, owner_id, slug, status) values
  ('b3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b3', 'pro-1', 'live'),
  ('b3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'pro-2', 'draft');
insert into public.items (sale_id, name, sell_mode)
select 'b3000000-0000-0000-0000-000000000001', 'pro thing ' || n, 'hold' from generate_series(1, 30) n;
do $$
begin
  assert (select listed from public.sales where slug = 'pro-1'), 'pro sale starts listed';
end;
$$;
reset role;

set test.uid = '00000000-0000-0000-0000-0000000000b4';
set role authenticated;
insert into public.sales (id, owner_id, slug, status) values
  ('b4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b4', 'pass-1', 'live');
insert into public.items (sale_id, name, price, sell_mode) values ('b4000000-0000-0000-0000-000000000001', 'chair', 20, 'buy_now');
reset role;

-- ---- lapsed: existing sale stays, but holds stop and nothing new is added ----
-- (set up as the server would have while the seller was on Pro)
insert into public.sales (id, owner_id, slug, status, listed) values
  ('b5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b5', 'lapsed-1', 'live', true);
insert into public.items (id, sale_id, name, sell_mode) values
  ('b5100000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'old hold', 'hold');
insert into public.sale_days (sale_id, date, start_time, end_time) values ('b5000000-0000-0000-0000-000000000001', current_date, '08:00', '14:00');
set test.uid = '00000000-0000-0000-0000-0000000000b5';
set role authenticated;
do $$
begin
  begin
    insert into public.items (sale_id, name, sell_mode) values ('b5000000-0000-0000-0000-000000000001', 'new', 'in_person');
    raise exception 'lapsed seller added an item';
  exception when raise_exception then null;
  end;
  -- they can still edit and mark things sold
  update public.items set price = 2 where name = 'old hold';
end;
$$;
reset role;
set test.uid = '';
set role anon;
do $$
begin
  assert (public.reserve_item('b5100000-0000-0000-0000-000000000001', 'Pat', '515-555-0142') ->> 'success')::boolean = false,
    'lapsed seller''s items can''t be held';
  assert not exists (select 1 from public.search_sales() where sale_id = 'b5000000-0000-0000-0000-000000000001'),
    'lapsed seller''s sale leaves the directory';
end;
$$;
reset role;

-- ---- Sale Pass purchases ----------------------------------------------------
do $$
declare
  v_first timestamptz;
  v_again timestamptz;
  v_second timestamptz;
begin
  v_first := public.grant_sale_pass('00000000-0000-0000-0000-0000000000b1', 'cs_pass_1', 1499);
  assert v_first between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', '30 days from now';
  assert public.seller_access('00000000-0000-0000-0000-0000000000b1') = 'full', 'pass unlocks everything';

  v_again := public.grant_sale_pass('00000000-0000-0000-0000-0000000000b1', 'cs_pass_1', 1499);
  assert v_again = v_first, 'repeated webhook doesn''t extend';

  v_second := public.grant_sale_pass('00000000-0000-0000-0000-0000000000b1', 'cs_pass_2', 1499);
  assert v_second = v_first + interval '30 days', 'second pass stacks on the first';
end;
$$;

-- sellers can't grant themselves a pass or change their plan
set test.uid = '00000000-0000-0000-0000-0000000000b2';
set role authenticated;
do $$
begin
  begin
    perform public.grant_sale_pass('00000000-0000-0000-0000-0000000000b2', 'cs_fake', 0);
    raise exception 'seller granted themselves a pass';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.account_billing set plan = 'comp';
    raise exception 'seller changed their plan';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

\echo 'plans.test.sql: all checks passed'
