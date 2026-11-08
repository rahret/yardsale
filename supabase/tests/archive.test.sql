-- Archiving a sale: only when it isn't live; going live unarchives it.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'archiver@example.com');
insert into public.account_billing (user_id, plan, subscription_status) values
  ('00000000-0000-0000-0000-0000000000d1', 'pro', 'trialing');
insert into public.sales (id, owner_id, slug, status) values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'to-archive', 'live');

set test.uid = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
do $$
begin
  begin
    update public.sales set archived_at = now() where id = 'd1000000-0000-0000-0000-000000000001';
    raise exception 'archived a live sale';
  exception when check_violation then null;
  end;

  update public.sales set status = 'ended' where id = 'd1000000-0000-0000-0000-000000000001';
  update public.sales set archived_at = now() where id = 'd1000000-0000-0000-0000-000000000001';
  assert (select archived_at is not null from public.sales where id = 'd1000000-0000-0000-0000-000000000001'), 'ended sale archived';

  update public.sales set status = 'live' where id = 'd1000000-0000-0000-0000-000000000001';
  assert (select archived_at is null from public.sales where id = 'd1000000-0000-0000-0000-000000000001'), 'going live unarchives';

  -- an archived sale still counts toward the trial's one sale
  update public.sales set status = 'ended', archived_at = now() where id = 'd1000000-0000-0000-0000-000000000001';
  begin
    insert into public.sales (owner_id, slug) values ('00000000-0000-0000-0000-0000000000d1', 'another');
    raise exception 'trial seller made a second sale after archiving';
  exception when sqlstate 'P0001' then null;
  end;
end;
$$;
reset role;
\echo 'archive.test.sql: all checks passed'
