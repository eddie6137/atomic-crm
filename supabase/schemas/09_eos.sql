-- EOS Light v1a: Projects / Commitments / Issues + attachments/links + lossless import.
-- Spec: amplify-agentic-os/status/specs/eos-light-web-2026-11-05.md (CTO gate v1a 2026-11-05).
-- Soft-delete only (archived_at). No DELETE grants/policies on EOS tables.

-- ---------- membership helpers ----------
create or replace function public.eos_is_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sales s
    where s.user_id = (select auth.uid()) and s.disabled = false
  );
$$;
revoke all on function public.eos_is_member() from public, anon;
grant execute on function public.eos_is_member() to authenticated;

-- Private (Joe/Eddie) domain foundation for v1c contracts. Empty in v1a.
create table public.eos_private_members (
  sales_id bigint primary key references public.sales(id),
  added_at timestamptz not null default now()
);
alter table public.eos_private_members enable row level security;
create or replace function public.eos_is_private_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.eos_private_members pm
    join public.sales s on s.id = pm.sales_id
    where s.user_id = (select auth.uid()) and s.disabled = false
  );
$$;
revoke all on function public.eos_is_private_member() from public, anon;
grant execute on function public.eos_is_private_member() to authenticated;
create policy eos_private_members_select on public.eos_private_members
  for select to authenticated using ((select public.eos_is_private_member()));

-- ---------- core tables ----------
create table public.eos_projects (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned','active','on_hold','done','cancelled')),
  is_internal boolean not null default false,
  start_date date,
  target_date date,
  owner_sales_id bigint references public.sales(id),
  origin_deal_id bigint references public.deals(id),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);

create table public.eos_commitments (
  id uuid primary key default gen_random_uuid(),
  company_id bigint references public.companies(id),
  project_id uuid references public.eos_projects(id),
  title text not null,
  direction text check (direction in ('to_client','from_client','internal')),
  is_verbatim boolean not null default false,
  speaker text,
  source_url text,
  due_date date,
  due_text text,
  definition_of_done text,
  owner_sales_id bigint references public.sales(id),
  owner_text text,
  status text not null default 'open' check (status in
    ('open','in_progress','blocked','completed','superseded','cancelled','ambiguous','lapsed')),
  status_text text,
  status_reason text,
  blocker text,
  priority text,
  type text,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  needs_review boolean not null default false,
  legacy_id text,
  import_row_id uuid,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz,
  constraint eos_commitments_company_or_review check (company_id is not null or needs_review)
);

create table public.eos_issues (
  id uuid primary key default gen_random_uuid(),
  company_id bigint references public.companies(id),
  project_id uuid references public.eos_projects(id),
  title text not null,
  detail text,
  priority text,
  type text,
  raised_by text,
  raised_at date,
  due_date date,
  due_text text,
  owner_sales_id bigint references public.sales(id),
  owner_text text,
  status text not null default 'open' check (status in ('open','ids','solved','dropped')),
  status_text text,
  solution text,
  resolved_at date,
  commitment_id uuid references public.eos_commitments(id),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  needs_review boolean not null default false,
  legacy_id text,
  import_row_id uuid,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz,
  constraint eos_issues_company_or_review check (company_id is not null or needs_review)
);

create index eos_projects_company_idx on public.eos_projects(company_id);
create index eos_commitments_company_idx on public.eos_commitments(company_id);
create index eos_commitments_project_idx on public.eos_commitments(project_id);
create index eos_commitments_owner_idx on public.eos_commitments(owner_sales_id);
create index eos_commitments_due_idx on public.eos_commitments(due_date);
create index eos_issues_company_idx on public.eos_issues(company_id);
create index eos_issues_project_idx on public.eos_issues(project_id);
create index eos_issues_owner_idx on public.eos_issues(owner_sales_id);
create index eos_issues_commitment_idx on public.eos_issues(commitment_id);

-- ---------- import / reconciliation (lossless) ----------
create table public.eos_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- e.g. 'fixture' | 'google_sheets'
  spreadsheet_id text,
  tab_name text not null,
  tab_id text,
  snapshot_sha256 text not null,     -- hash of full raw grid
  header_row integer not null,
  row_positions integer not null,    -- total data row positions after header
  nonempty_rows integer not null,
  canonical_records integer not null,
  needs_review_records integer not null,
  column_count integer not null,
  columns jsonb not null,            -- [{index,label,mapped_to}]
  raw_checksum text not null,
  semantic_checksum text not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  created_by bigint references public.sales(id)
);
create table public.eos_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.eos_import_batches(id),
  row_ordinal integer not null,      -- 1-based sheet row number
  raw jsonb not null,                -- {cells:[{index,label,value}]}
  row_sha256 text not null,
  target_table text not null check (target_table in ('eos_commitments','eos_issues')),
  target_id uuid not null,
  needs_review boolean not null,
  review_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, row_ordinal)
);
create index eos_import_rows_batch_idx on public.eos_import_rows(batch_id);

-- ---------- append-only activity ----------
create table public.eos_activity (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  actor_sales_id bigint,
  revision integer,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index eos_activity_record_idx on public.eos_activity(record_id);

-- ---------- triggers ----------
create or replace function public.eos_current_sales_id()
returns bigint language sql stable security definer set search_path = ''
as $$ select s.id from public.sales s where s.user_id = (select auth.uid()) $$;
revoke all on function public.eos_current_sales_id() from public, anon;
grant execute on function public.eos_current_sales_id() to authenticated;

create or replace function public.eos_before_write()
returns trigger language plpgsql set search_path = ''
as $$
declare pcompany bigint;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.eos_current_sales_id());
    new.revision := 1;
    new.created_at := now();
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    -- staleness-clock-only touch (from child activity) does not bump revision
    if tg_table_name = 'eos_projects'
       and (to_jsonb(new) - 'last_activity_at' - 'updated_at') = (to_jsonb(old) - 'last_activity_at' - 'updated_at') then
      new.revision := old.revision;
    else
      new.revision := old.revision + 1;
    end if;
  end if;
  new.updated_at := now();
  if tg_table_name in ('eos_commitments','eos_issues') then
    if new.project_id is not null then
      select company_id into pcompany from public.eos_projects where id = new.project_id;
      if new.company_id is null then
        new.company_id := pcompany;
      elsif pcompany is distinct from new.company_id then
        raise exception 'EOS: project % belongs to a different company', new.project_id;
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.eos_after_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.eos_activity(table_name, record_id, action, actor_sales_id, revision, changes)
  values (tg_table_name, new.id, lower(tg_op), public.eos_current_sales_id(), new.revision,
          case when tg_op = 'UPDATE' then
            (select jsonb_object_agg(n.key, n.value) from jsonb_each(to_jsonb(new)) n
             where n.key not in ('updated_at','revision') and (to_jsonb(old) -> n.key) is distinct from n.value)
          else null end);
  -- meaningful human activity bumps project staleness clock (imports set needs_review rows; still human-confirmed later)
  if tg_table_name in ('eos_commitments','eos_issues') then
    if new.project_id is not null then
      update public.eos_projects set last_activity_at = now() where id = new.project_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.eos_after_write() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['eos_projects','eos_commitments','eos_issues'] loop
    execute format('create trigger %1$s_before before insert or update on public.%1$s for each row execute function public.eos_before_write()', t);
    execute format('create trigger %1$s_after after insert or update on public.%1$s for each row execute function public.eos_after_write()', t);
  end loop;
end $$;

-- ---------- RLS: Team = active Atomic sales members; no delete ----------
do $$ declare t text; begin
  foreach t in array array['eos_projects','eos_commitments','eos_issues','eos_import_batches','eos_import_rows','eos_activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using ((select public.eos_is_member()))', t);
  end loop;
  foreach t in array array['eos_projects','eos_commitments','eos_issues','eos_import_batches','eos_import_rows'] loop
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select public.eos_is_member()))', t);
  end loop;
  foreach t in array array['eos_projects','eos_commitments','eos_issues'] loop
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using ((select public.eos_is_member())) with check ((select public.eos_is_member()))', t);
  end loop;
end $$;
-- import evidence + activity are append-only
revoke update on public.eos_import_batches, public.eos_import_rows, public.eos_activity from authenticated;
revoke insert on public.eos_activity from authenticated;

-- ---------- private storage bucket ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('eos-attachments', 'eos-attachments', false, 10485760)
on conflict (id) do nothing;
create policy "eos attachments select" on storage.objects for select to authenticated
  using (bucket_id = 'eos-attachments' and (select public.eos_is_member()));
create policy "eos attachments insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'eos-attachments' and (select public.eos_is_member()));
-- no delete policy: soft-delete only

-- ---------- per-account counts (invoker rights) ----------
create view public.eos_account_summary with (security_invoker = on) as
select c.id, c.name,
  (select count(*) from public.eos_projects p where p.company_id = c.id and p.archived_at is null and p.status in ('planned','active','on_hold')) as open_projects,
  (select count(*) from public.eos_commitments m where m.company_id = c.id and m.archived_at is null and m.status in ('open','in_progress','blocked','ambiguous')) as open_commitments,
  (select count(*) from public.eos_commitments m where m.company_id = c.id and m.archived_at is null and m.status in ('open','in_progress','blocked','ambiguous')
     and m.due_date < (now() at time zone 'America/Los_Angeles')::date) as overdue_commitments,
  (select count(*) from public.eos_issues i where i.company_id = c.id and i.archived_at is null and i.status in ('open','ids')) as open_issues
from public.companies c
where exists (select 1 from public.eos_projects p where p.company_id = c.id)
   or exists (select 1 from public.eos_commitments m where m.company_id = c.id)
   or exists (select 1 from public.eos_issues i where i.company_id = c.id);
revoke all on public.eos_account_summary from anon;
grant select on public.eos_account_summary to authenticated;

-- ---------- reconciliation results (insert-only) ----------
create table public.eos_import_reconciliations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.eos_import_batches(id),
  ok boolean not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.eos_import_reconciliations enable row level security;
revoke all on public.eos_import_reconciliations from anon;
revoke update, delete, truncate on public.eos_import_reconciliations from authenticated;
create policy eos_import_reconciliations_select on public.eos_import_reconciliations for select to authenticated using ((select public.eos_is_member()));
create policy eos_import_reconciliations_insert on public.eos_import_reconciliations for insert to authenticated with check ((select public.eos_is_member()));
