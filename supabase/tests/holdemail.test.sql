-- Holds can carry an optional email for the buyer's confirmation.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ab01', 'holdseller@example.com');
insert into public.account_billing (user_id, plan, subscription_status) values
  ('00000000-0000-0000-0000-00000000ab01', 'pro', 'active');
insert into public.sales (id, owner_id, slug, status) values
  ('ab000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000ab01', 'hold-email', 'live');
insert into public.items (id, sale_id, name, sell_mode) values
  ('ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'chair', 'hold'),
  ('ab100000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000001', 'lamp', 'hold');

set role anon;
do $$
declare
  r jsonb;
begin
  r := public.reserve_item('ab100000-0000-0000-0000-000000000001', 'Pat', '312-555-0199', 'not-an-email');
  assert not (r ->> 'success')::boolean and r ->> 'error' ilike '%valid email%', 'a bad email is refused';

  r := public.reserve_item('ab100000-0000-0000-0000-000000000001', 'Pat', '312-555-0199', '  Pat@Example.COM ');
  assert (r ->> 'success')::boolean, 'hold with an email';
  assert r ->> 'reserved_at' is not null, 'the hold''s start time comes back';

  r := public.reserve_item('ab100000-0000-0000-0000-000000000002', 'Sam', '312-555-0198');
  assert (r ->> 'success')::boolean, 'email is optional';

  -- buyers can't read anyone's hold details (or their email)
  begin
    perform 1 from public.item_holds;
    raise exception 'a buyer could read item_holds';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  assert (select email from public.item_holds where item_id = 'ab100000-0000-0000-0000-000000000001') = 'pat@example.com',
    'email stored trimmed and lower-cased';
  assert (select email from public.item_holds where item_id = 'ab100000-0000-0000-0000-000000000002') is null, 'no email';
  assert (select reserved_at from public.items where id = 'ab100000-0000-0000-0000-000000000001') =
         (select created_at from public.item_holds where item_id = 'ab100000-0000-0000-0000-000000000001'),
    'one timestamp for the hold';
end;
$$;

-- release them so later tests start with no holds
update public.items set status = 'available', reserved_at = null where sale_id = 'ab000000-0000-0000-0000-000000000001';
\echo 'holdemail.test.sql: all checks passed'
