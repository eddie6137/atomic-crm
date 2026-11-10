-- Rollback for migrations/20261109180000_eos_intake_p1.sql (Intake & Triage P1).
-- Drops the intake tables (and every intake/FYI/channel-map row in them), the intake RPCs,
-- and the companies attribution columns. Commitments/proposals created by Accept are NOT
-- deleted; they only lose their link to the intake row. Aborts if any eos_proposals row has
-- source 'email' (the old CHECK would reject it): resolve those rows by hand first.
-- Not applied by the Supabase CLI (lives outside supabase/migrations). Run by hand only on CTO direction.
-- History row: delete by NAME (connector apply_migration records its own version timestamp).
begin;
do $$ begin
  if exists (select 1 from public.eos_proposals where source = 'email') then
    raise exception 'rollback aborted: eos_proposals rows with source=email exist';
  end if;
end $$;
drop function if exists public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text);
drop function if exists public.eos_intake_accept_action(uuid,jsonb);
drop function if exists public.eos_intake_accept_fyi(uuid,jsonb);
drop function if exists public.eos_intake_reject(uuid);
drop function if exists public.eos_intake_audit_quick_add(uuid);
drop function if exists public.eos_intake_require_member();
drop table if exists public.eos_account_fyi;
drop table if exists public.eos_slack_channel_map;
drop table if exists public.eos_intake_items;
alter table public.eos_proposals drop constraint eos_proposals_source_check;
alter table public.eos_proposals add constraint eos_proposals_source_check
  check (source in ('slack','fireflies','fixture'));
alter table public.companies
  drop constraint if exists companies_plus_slug_format,
  drop constraint if exists companies_plus_slug_key,
  drop column if exists plus_slug,
  drop column if exists aliases,
  drop column if exists domains;
delete from supabase_migrations.schema_migrations where name = 'eos_intake_p1';
commit;
