-- search_sales: distance, dates, words, category, paging, and visibility.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'search-seller@example.com');
-- Ankeny (~0 mi from the search point), Des Moines (~12 mi), Iowa City (~110 mi),
-- one with no coordinates yet, one unlisted, one draft
insert into public.sales (id, owner_id, slug, name, street, city, state, zip, status, listed, lat, lng) values
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'ankeny', 'BIG BIG Sale', '5009 NW 4th', 'Ankeny', 'IA', '50023', 'live', true, 41.7318, -93.6001),
  ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'dsm', 'Moving Sale', '812 Oak St', 'Des Moines', 'IA', '50312', 'live', true, 41.5868, -93.6250),
  ('f0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', 'iowa-city', 'Estate Sale', '1 Main St', 'Iowa City', 'IA', '52240', 'live', true, 41.6611, -91.5302),
  ('f0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000f1', 'no-coords', 'Kids Toys', '44 Maple Ave', 'Ankeny', 'IA', '50021', 'live', true, null, null),
  ('f0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000f1', 'unlisted', 'Secret Sale', '9 Elm', 'Ankeny', 'IA', '50023', 'live', false, 41.73, -93.60),
  ('f0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000f1', 'draft', 'Draft Sale', '9 Elm', 'Ankeny', 'IA', '50023', 'draft', true, 41.73, -93.60);
insert into public.sale_days (sale_id, date, start_time, end_time)
select id, current_date + 2, '08:00', '14:00' from public.sales where owner_id = '00000000-0000-0000-0000-0000000000f1';
-- Des Moines is a week out; Kids Toys also had a day long ago
update public.sale_days set date = current_date + 7 where sale_id = 'f0000000-0000-0000-0000-000000000002';
insert into public.sale_days (sale_id, date, start_time, end_time) values ('f0000000-0000-0000-0000-000000000004', current_date - 30, '08:00', '14:00');
insert into public.items (sale_id, name, category) values
  ('f0000000-0000-0000-0000-000000000002', 'couch', 'Furniture'),
  ('f0000000-0000-0000-0000-000000000003', 'dresser', 'furniture');

set role anon;
do $$
declare
  slugs text;
begin
  -- no location: soonest first, unlisted and draft sales never appear
  select string_agg(s.slug, ',' order by r.ord) into slugs
  from (select sale_id, row_number() over () ord from public.search_sales()) r join public.sales s on s.id = r.sale_id;
  assert slugs = 'ankeny,iowa-city,no-coords,dsm', 'soonest first, listed only: ' || slugs;

  -- within 25 miles of Ankeny: nearest first; no-coordinate sales can't match a radius
  select string_agg(s.slug, ',' order by r.ord) into slugs
  from (select sale_id, row_number() over () ord from public.search_sales(41.73, -93.60, 25)) r join public.sales s on s.id = r.sale_id;
  assert slugs = 'ankeny,dsm', 'within 25 miles: ' || slugs;
  assert (select round(distance_miles::numeric) from public.search_sales(41.73, -93.60, 25) where sale_id = 'f0000000-0000-0000-0000-000000000002') between 9 and 12,
    'Des Moines is about 10 miles from Ankeny';

  -- a location with no radius still sorts by distance and keeps everything
  assert (select count(*) from public.search_sales(41.73, -93.60, null)) = 4, 'no radius keeps all';

  -- dates: only sales with a day in range
  assert (select count(*) from public.search_sales(p_from => current_date, p_to => current_date + 3)) = 3, 'next 3 days';
  assert (select count(*) from public.search_sales(p_from => current_date + 6, p_to => current_date + 8)) = 1, 'next week';

  -- words: city, ZIP prefix, sale name; every word must match; never the house number
  assert (select count(*) from public.search_sales(p_query => 'ankeny')) = 2, 'city';
  assert (select count(*) from public.search_sales(p_query => '500')) = 2, 'ZIP prefix';
  assert (select count(*) from public.search_sales(p_query => 'Ankeny, IA')) = 2, 'commas ignored';
  assert (select count(*) from public.search_sales(p_query => 'ankeny estate')) = 0, 'all words must match';
  assert (select count(*) from public.search_sales(p_query => '5009')) = 0, 'house number is not searchable';
  assert (select count(*) from public.search_sales(p_query => 'nw 4th')) = 1, 'street name is';

  -- category, case-insensitive
  assert (select count(*) from public.search_sales(p_category => 'FURNITURE')) = 2, 'category';

  -- paging: total counts every match; pages don't overlap
  assert (select max(total) from public.search_sales(p_limit => 2)) = 4, 'total across pages';
  assert (select count(*) from public.search_sales(p_limit => 2)) = 2, 'page size';
  assert (select count(*) from public.search_sales(p_limit => 2, p_offset => 2)) = 2, 'second page';
  assert not exists (
    select 1 from public.search_sales(p_limit => 2) a join public.search_sales(p_limit => 2, p_offset => 2) b using (sale_id)
  ), 'pages do not overlap';
end;
$$;
reset role;

\echo 'search.test.sql: all checks passed'
