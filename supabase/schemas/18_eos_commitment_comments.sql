-- v1d U1b (Q1, CTO-approved 2026-11-08 ~10:08 PM PT): plain comments on client actions.
-- STAGING ONLY until Eddie's merge Approve via the PR #6 runbook path. Additive; rollback:
-- supabase/rollbacks/20261108230000_eos_commitment_comments.down.sql
-- Deliberately NO eos_after_write trigger: comments are never copied into eos_activity.
create table public.eos_commitment_comments (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.eos_commitments(id),
  body text not null,
  created_by bigint references public.sales(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint eos_commitment_comments_body_len
    check (char_length(btrim(body)) between 1 and 4000)
);
create index eos_commitment_comments_commitment_idx
  on public.eos_commitment_comments (commitment_id, created_at desc);

-- created_by/created_at are server-set; the client cannot spoof the author.
create or replace function public.eos_comment_before_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.created_by := public.eos_current_sales_id();
  new.created_at := now();
  new.archived_at := null;
  return new;
end $$;
revoke all on function public.eos_comment_before_insert() from public, anon, authenticated;
create trigger eos_commitment_comments_before_insert
  before insert on public.eos_commitment_comments
  for each row execute function public.eos_comment_before_insert();

-- RLS: same member model as eos_commitments; read for members, insert-own; no update/delete.
alter table public.eos_commitment_comments enable row level security;
revoke all on public.eos_commitment_comments from anon;
revoke all on public.eos_commitment_comments from authenticated;
grant select, insert on public.eos_commitment_comments to authenticated;
create policy eos_commitment_comments_select on public.eos_commitment_comments
  for select to authenticated using ((select public.eos_is_member()));
create policy eos_commitment_comments_insert on public.eos_commitment_comments
  for insert to authenticated
  with check ((select public.eos_is_member()) and created_by = (select public.eos_current_sales_id()));
