-- Visit counting: who can log, what's recorded, and who can read it.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'visits-seller@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'visits-other@example.com');
insert into public.sales (id, owner_id, slug, status) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'visits-live', 'live'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'visits-draft', 'draft');
insert into public.items (id, sale_id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'lamp');

-- anonymous buyers
set role anon;
select public.log_sale_visit('a0000000-0000-0000-0000-000000000001', 'qr');
select public.log_sale_visit('a0000000-0000-0000-0000-000000000001', 'FACEBOOK', 'b0000000-0000-0000-0000-000000000001');
select public.log_sale_visit('a0000000-0000-0000-0000-000000000001', '<script>');            -- unknown -> direct
select public.log_sale_visit('a0000000-0000-0000-0000-000000000001', 'qr', 'b0000000-0000-0000-0000-0000000000ff'); -- unknown item -> null
select public.log_sale_visit('a0000000-0000-0000-0000-000000000002', 'qr');                  -- draft: ignored
select public.log_sale_visit('a0000000-0000-0000-0000-000000000001', 'directory');         -- home page directory
do $$
begin
  begin
    perform 1 from public.sale_visits;
    raise exception 'anon must not be able to read sale_visits';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- the seller viewing their own sale isn't counted
set test.uid = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
select public.log_sale_visit('a0000000-0000-0000-0000-000000000001', 'qr');
reset role;

do $$
begin
  assert (select count(*) from public.sale_visits) = 5, 'five visits recorded';
  assert (select count(*) from public.sale_visits where src = 'directory') = 1, 'directory visits are tagged';
  assert (select count(*) from public.sale_visits where src = 'direct') = 1, 'unknown sources become direct';
  assert (select count(*) from public.sale_visits where src = 'facebook' and item_id is not null) = 1, 'source is lower-cased; item kept';
  assert (select count(*) from public.sale_visits where sale_id = 'a0000000-0000-0000-0000-000000000002') = 0, 'drafts are not counted';
end;
$$;

-- only the owner can read the counts
set test.uid = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;
do $$ begin assert (select count(*) from public.sale_visit_counts('a0000000-0000-0000-0000-000000000001')) = 0, 'other users see no counts'; end; $$;
reset role;

set test.uid = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
do $$
begin
  assert (select visits from public.sale_visit_counts('a0000000-0000-0000-0000-000000000001') where src = 'qr') = 2, 'owner sees qr = 2';
end;
$$;
reset role;

\echo 'visits.test.sql: all checks passed'
