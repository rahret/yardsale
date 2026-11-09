-- Rate limits: the counter, the visitor's IP, and limits on visit counting.
\set ON_ERROR_STOP on

-- the counter allows up to the limit in a window, then refuses
do $$
begin
  assert private.hit('test:a', 2, 3600), 'first use allowed';
  assert private.hit('test:a', 2, 3600), 'second use allowed';
  assert not private.hit('test:a', 2, 3600), 'third use refused';
  assert private.hit('test:b', 2, 3600), 'other keys are separate';
end;
$$;

-- only the server can use it through the API
set role anon;
do $$
begin
  begin
    perform public.rate_limit_hit('x', 1, 60);
    raise exception 'a visitor called rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set role service_role;
select public.rate_limit_hit('test:server', 5, 60);
reset role;

-- the visitor's IP: Cloudflare's header (which visitors can't fake) wins over
-- anything a visitor could send in X-Forwarded-For
do $$
begin
  perform set_config('request.headers', '{"cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6"}', false);
  assert private.client_ip() = '198.51.100.7', 'Cloudflare''s header first';
  perform set_config('request.headers', '{"x-real-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6"}', false);
  assert private.client_ip() = '203.0.113.9', 'then x-real-ip';
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.8, 10.0.0.1"}', false);
  assert private.client_ip() = '198.51.100.8', 'then the first forwarded entry';
  perform set_config('request.headers', '', false);
  assert private.client_ip() is null, 'no headers, no IP';
end;
$$;

-- visit counting stops at 30 per visitor per sale per hour
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ad01', 'rl@example.com');
insert into public.sales (id, owner_id, slug, status) values
  ('ad000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000ad01', 'rl-sale', 'live');
set role anon;
select set_config('request.headers', '{"cf-connecting-ip": "192.0.2.50"}', false);
select public.log_sale_visit('ad000000-0000-0000-0000-000000000001', 'qr') from generate_series(1, 40);
select set_config('request.headers', '{"cf-connecting-ip": "192.0.2.51"}', false);
select public.log_sale_visit('ad000000-0000-0000-0000-000000000001', 'qr');
reset role;
do $$
begin
  assert (select count(*) from public.sale_visits where sale_id = 'ad000000-0000-0000-0000-000000000001') = 31,
    '30 from the busy visitor + 1 from someone else';
end;
$$;
delete from public.sale_visits where sale_id = 'ad000000-0000-0000-0000-000000000001';
select set_config('request.headers', '', false);
\echo 'ratelimit.test.sql: all checks passed'
