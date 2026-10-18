-- Reservation rules and buyer-privacy checks. Run via supabase/tests/run.sh.
-- Every check raises (and fails the run) on a wrong result.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'seller@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'someone@example.com');
insert into public.sales (id, owner_id, slug, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'test-sale', 'live');
insert into public.items (id, sale_id, name)
select ('20000000-0000-0000-0000-00000000000' || n)::uuid, '10000000-0000-0000-0000-000000000001', 'item ' || n
from generate_series(1, 6) n;

create function pg_temp.reserve(p_item int, p_phone text, p_ip text default null) returns jsonb
language sql as $$
  select set_config('request.headers', coalesce(json_build_object('x-forwarded-for', p_ip)::text, ''), false);
  select public.reserve_item(('20000000-0000-0000-0000-00000000000' || p_item)::uuid, 'Buyer', p_phone);
$$;

create function pg_temp.expect(label text, got jsonb, want_error_like text) returns void
language plpgsql as $$
begin
  if want_error_like is null and (got ->> 'success')::boolean is not true then
    raise exception '% — expected success, got %', label, got;
  elsif want_error_like is not null and coalesce(got ->> 'error', '') not ilike '%' || want_error_like || '%' then
    raise exception '% — expected error like "%", got %', label, want_error_like, got;
  end if;
end;
$$;

select pg_temp.expect('fake area code', pg_temp.reserve(1, '123-456-7890'), 'valid 10-digit');
select pg_temp.expect('repeated digit', pg_temp.reserve(1, '222-222-2222'), 'valid 10-digit');
select pg_temp.expect('too short', pg_temp.reserve(1, '555-1234'), 'valid 10-digit');
select pg_temp.expect('valid with +1', pg_temp.reserve(1, '+1 (312) 555-0101', '1.2.3.4'), null);
select pg_temp.expect('already held', pg_temp.reserve(1, '312-555-0199', '5.5.5.5'), 'just reserved');
select pg_temp.expect('same phone twice', pg_temp.reserve(2, '3125550101', '5.5.5.5'), 'one reservation per person');
select pg_temp.expect('device 2nd', pg_temp.reserve(2, '312-555-0102', '1.2.3.4'), null);
select pg_temp.expect('device 3rd', pg_temp.reserve(3, '312-555-0103', '1.2.3.4, 10.0.0.1'), null);
select pg_temp.expect('device cap', pg_temp.reserve(4, '312-555-0104', '1.2.3.4'), 'too many');
select pg_temp.expect('other device', pg_temp.reserve(4, '312-555-0104', '9.9.9.9'), null);
select pg_temp.expect('no ip header', pg_temp.reserve(5, '312-555-0105'), null);

do $$
begin
  assert (select count(*) from public.item_holds) = 5, 'one hold per reserved item';
  assert (select phone from public.item_holds where item_id = '20000000-0000-0000-0000-000000000001') = '3125550101',
    'phones are stored normalized';

  -- seller releases a hold -> hold row is removed
  update public.items set status = 'available', reserved_at = null where id = '20000000-0000-0000-0000-000000000004';
  assert (select count(*) from public.item_holds) = 4, 'release clears the hold';

  -- expired hold is swept -> hold row is removed
  update public.items set reserved_at = now() - interval '2 hours' where id = '20000000-0000-0000-0000-000000000005';
  perform public.sweep_expired_reservations('10000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.item_holds) = 3, 'sweep clears expired holds';
end;
$$;

-- Buyer contact info must not be visible to anyone but the sale's owner.
do $$
begin
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and column_name in ('reserved_name', 'reserved_phone', 'reserved_history')),
    'buyer contact columns must not exist on public tables';
end;
$$;

set test.uid = '00000000-0000-0000-0000-000000000002';
set role authenticated;
do $$ begin assert (select count(*) from public.item_holds) = 0, 'other users cannot read holds'; end; $$;
reset role;

set test.uid = '00000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin assert (select count(*) from public.item_holds) = 3, 'owner can read holds'; end; $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.item_holds;
    raise exception 'anon must not be able to read item_holds';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.reservation_log;
    raise exception 'anon must not be able to read reservation_log';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

\echo 'reservations.test.sql: all checks passed'
