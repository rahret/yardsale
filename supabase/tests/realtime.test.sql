-- Live updates: the seller page's tables are published to Realtime.
\set ON_ERROR_STOP on
do $$
begin
  assert (select count(*) from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename in ('items', 'item_holds', 'orders')) = 3,
    'items, item_holds and orders are published for live updates';
end;
$$;
\echo 'realtime.test.sql: all checks passed'
