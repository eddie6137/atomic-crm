-- EOS Light v1b: Deliverables, Rocks, Scorecard, proposals (bot propose -> human confirm), full account signals.
-- Spec §2, §3, §5. Soft-delete only; RLS = active Atomic sales members.

create table public.eos_deliverables (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  project_id uuid not null references public.eos_projects(id),
  commitment_id uuid references public.eos_commitments(id),
  title text not null,
  acceptance_criteria text,
  due_date date,
  status text not null default 'planned'
    check (status in ('planned','in_progress','ready','delivered','accepted','cancelled')),
  proof text,
  owner_sales_id bigint references public.sales(id),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);
create index eos_deliverables_company_idx on public.eos_deliverables(company_id);
create index eos_deliverables_project_idx on public.eos_deliverables(project_id);
create index eos_deliverables_commitment_idx on public.eos_deliverables(commitment_id);
create index eos_deliverables_owner_idx on public.eos_deliverables(owner_sales_id);

create table public.eos_rocks (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  project_id uuid references public.eos_projects(id),
  title text not null,
  quarter text not null check (quarter ~ '^\d{4}-Q[1-4]$'),
  start_date date,
  end_date date,
  success_measure text,
  owner_sales_id bigint references public.sales(id),
  status text not null default 'on_track' check (status in ('on_track','off_track','done','cancelled')),
  rationale text,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);
create index eos_rocks_company_idx on public.eos_rocks(company_id);
create index eos_rocks_project_idx on public.eos_rocks(project_id);
create index eos_rocks_owner_idx on public.eos_rocks(owner_sales_id);

create table public.eos_scorecard_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  project_id uuid references public.eos_projects(id),
  name text not null,
  owner_sales_id bigint references public.sales(id),
  unit text,
  comparator text not null default '>=' check (comparator in ('>=','<=','=')),
  target numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);
create index eos_scorecard_metrics_company_idx on public.eos_scorecard_metrics(company_id);
create index eos_scorecard_metrics_project_idx on public.eos_scorecard_metrics(project_id);
create index eos_scorecard_metrics_owner_idx on public.eos_scorecard_metrics(owner_sales_id);

-- Missing week = no row (missing != zero). Monday week start (America/Los_Angeles business weeks).
create table public.eos_scorecard_values (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.eos_scorecard_metrics(id),
  week_start date not null check (extract(isodow from week_start) = 1),
  actual numeric,
  note text,
  evidence_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz,
  unique (metric_id, week_start)
);

create table public.eos_proposals (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('slack','fireflies','fixture','email')),
  source_ref text not null,          -- message ts / meeting id
  source_url text,
  excerpt text not null,
  target_table text not null check (target_table in ('eos_commitments','eos_issues')),
  payload jsonb not null,            -- candidate fields (title, company_id, owner_sales_id, due_date, ...)
  confidence numeric check (confidence between 0 and 1),
  extraction_version text not null,
  fingerprint text not null unique,  -- dedupe source_ref + excerpt + target
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  reject_reason text,
  confirmed_record_id uuid,
  decided_by bigint references public.sales(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index eos_proposals_status_idx on public.eos_proposals(status);

-- ---------- triggers (extend v1a functions) ----------
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
    if tg_table_name = 'eos_projects'
       and (to_jsonb(new) - 'last_activity_at' - 'updated_at') = (to_jsonb(old) - 'last_activity_at' - 'updated_at') then
      new.revision := old.revision;
    else
      new.revision := old.revision + 1;
    end if;
  end if;
  new.updated_at := now();
  if tg_table_name in ('eos_commitments','eos_issues','eos_deliverables','eos_rocks','eos_scorecard_metrics') then
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
  -- meaningful human activity on child items bumps the project staleness clock
  if tg_table_name in ('eos_commitments','eos_issues','eos_deliverables','eos_rocks','eos_scorecard_metrics') then
    if new.project_id is not null then
      update public.eos_projects set last_activity_at = now() where id = new.project_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.eos_after_write() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['eos_deliverables','eos_rocks','eos_scorecard_metrics','eos_scorecard_values'] loop
    execute format('create trigger %1$s_before before insert or update on public.%1$s for each row execute function public.eos_before_write()', t);
    execute format('create trigger %1$s_after after insert or update on public.%1$s for each row execute function public.eos_after_write()', t);
  end loop;
end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['eos_deliverables','eos_rocks','eos_scorecard_metrics','eos_scorecard_values','eos_proposals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using ((select public.eos_is_member()))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select public.eos_is_member()))', t);
  end loop;
  foreach t in array array['eos_deliverables','eos_rocks','eos_scorecard_metrics','eos_scorecard_values'] loop
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using ((select public.eos_is_member())) with check ((select public.eos_is_member()))', t);
  end loop;
end $$;
-- proposals: insert only pending; decisions only through confirm/reject RPCs
revoke update on public.eos_proposals from authenticated;
drop policy eos_proposals_insert on public.eos_proposals;
create policy eos_proposals_insert on public.eos_proposals for insert to authenticated
  with check ((select public.eos_is_member()) and status = 'pending' and confirmed_record_id is null and decided_by is null);

-- ---------- confirm / reject: SECURITY DEFINER with explicit caller (active member) + role checks;
-- members never get UPDATE on eos_proposals ----------
create or replace function public.eos_confirm_proposal(p_id uuid, p_fields jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare pr public.eos_proposals; f jsonb; new_id uuid := gen_random_uuid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then raise exception 'EOS: authenticated caller required'; end if;
  if not public.eos_is_member() then raise exception 'EOS: not a member'; end if;
  select * into pr from public.eos_proposals where id = p_id for update;
  if not found then raise exception 'EOS: proposal not found'; end if;
  if pr.status = 'confirmed' then return pr.confirmed_record_id; end if;  -- idempotent
  if pr.status = 'rejected' then raise exception 'EOS: proposal already rejected'; end if;
  if pr.target_table not in ('eos_commitments','eos_issues') then raise exception 'EOS: bad target'; end if;
  if not exists (select 1 from public.companies c where c.id = (pr.payload || coalesce(p_fields,'{}'::jsonb)->>'company_id')::bigint) then raise exception 'EOS: unknown account'; end if;
  f := pr.payload || coalesce(p_fields, '{}'::jsonb);
  if coalesce(f->>'title','') = '' then raise exception 'EOS: title required'; end if;
  if f->>'company_id' is null then raise exception 'EOS: account required to confirm'; end if;
  if pr.target_table = 'eos_commitments' then
    insert into public.eos_commitments(id, company_id, project_id, title, owner_sales_id, due_date, due_text, priority, type,
      direction, is_verbatim, speaker, source_url, status)
    values (new_id, (f->>'company_id')::bigint, nullif(f->>'project_id','')::uuid, f->>'title',
      nullif(f->>'owner_sales_id','')::bigint, nullif(f->>'due_date','')::date, f->>'due_text', nullif(f->>'priority',''), nullif(f->>'type',''),
      nullif(f->>'direction',''), coalesce((f->>'is_verbatim')::boolean, false), f->>'speaker', coalesce(f->>'source_url', pr.source_url), 'open');
  else
    insert into public.eos_issues(id, company_id, project_id, title, detail, owner_sales_id, priority, type, raised_by, raised_at, status)
    values (new_id, (f->>'company_id')::bigint, nullif(f->>'project_id','')::uuid, f->>'title', coalesce(f->>'detail', pr.excerpt),
      nullif(f->>'owner_sales_id','')::bigint, nullif(f->>'priority',''), nullif(f->>'type',''), f->>'raised_by',
      coalesce(nullif(f->>'raised_at','')::date, (pr.created_at at time zone 'America/Los_Angeles')::date), 'open');
  end if;
  perform public.eos_mark_proposal(p_id, 'confirmed', new_id, null);
  return new_id;
end $$;

create or replace function public.eos_reject_proposal(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then raise exception 'EOS: authenticated caller required'; end if;
  if not public.eos_is_member() then raise exception 'EOS: not a member'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'EOS: reason required'; end if;
  perform public.eos_mark_proposal(p_id, 'rejected', null, p_reason);
end $$;

-- narrow definer helper: only flips a PENDING proposal's decision fields
create or replace function public.eos_mark_proposal(p_id uuid, p_status text, p_record uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eos_is_member() then raise exception 'EOS: not a member'; end if;
  if p_status not in ('confirmed','rejected') then raise exception 'EOS: bad status'; end if;
  if p_status = 'confirmed' and not exists (
      select 1 from public.eos_proposals pr
      where pr.id = p_id and (
        (pr.target_table = 'eos_commitments' and exists (select 1 from public.eos_commitments x where x.id = p_record))
        or (pr.target_table = 'eos_issues' and exists (select 1 from public.eos_issues x where x.id = p_record)))) then
    raise exception 'EOS: confirmed record missing';
  end if;
  update public.eos_proposals
     set status = p_status, confirmed_record_id = p_record, reject_reason = p_reason,
         decided_by = public.eos_current_sales_id(), decided_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'EOS: proposal is not pending'; end if;
end $$;
revoke all on function public.eos_mark_proposal(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.eos_confirm_proposal(uuid, jsonb) from public, anon;
revoke all on function public.eos_reject_proposal(uuid, text) from public, anon;
grant execute on function public.eos_confirm_proposal(uuid, jsonb) to authenticated;
grant execute on function public.eos_reject_proposal(uuid, text) to authenticated;
-- eos_mark_proposal is internal only (called from the definer RPCs); not executable by members.

-- ---------- full per-account signals (§3 defaults; date-only rules in America/Los_Angeles) ----------
drop view public.eos_account_summary;
create view public.eos_account_summary with (security_invoker = on) as
with today as (select (now() at time zone 'America/Los_Angeles')::date d)
select c.id, c.name,
  (select count(*) from public.eos_projects p where p.company_id = c.id and p.archived_at is null and p.status in ('planned','active','on_hold')) as open_projects,
  (select count(*) from public.eos_commitments m where m.company_id = c.id and m.archived_at is null and m.status in ('open','in_progress','blocked','ambiguous')) as open_commitments,
  (select count(*) from public.eos_commitments m, today where m.company_id = c.id and m.archived_at is null and m.status in ('open','in_progress','blocked','ambiguous') and m.due_date < today.d) as overdue_commitments,
  (select count(*) from public.eos_issues i where i.company_id = c.id and i.archived_at is null and i.status in ('open','ids')) as open_issues,
  (select count(*) from public.eos_deliverables v, today where v.company_id = c.id and v.archived_at is null and v.status in ('planned','in_progress','ready') and v.due_date between today.d and today.d + 7) as deliverables_due_7d,
  (select count(*) from public.eos_projects p where p.company_id = c.id and p.archived_at is null and p.status = 'active' and p.last_activity_at < now() - interval '14 days') as stale_projects,
  (select count(*) from public.eos_rocks r where r.company_id = c.id and r.archived_at is null and r.status = 'off_track') as off_track_rocks,
  (select count(*) from public.eos_commitments m where m.company_id = c.id and m.archived_at is null and (m.owner_sales_id is null or m.due_date is null) and m.status in ('open','in_progress','blocked','ambiguous')) as missing_owner_or_date
from public.companies c
where exists (select 1 from public.eos_projects p where p.company_id = c.id)
   or exists (select 1 from public.eos_commitments m where m.company_id = c.id)
   or exists (select 1 from public.eos_issues i where i.company_id = c.id)
   or exists (select 1 from public.eos_rocks r where r.company_id = c.id);
revoke all on public.eos_account_summary from anon;
grant select on public.eos_account_summary to authenticated;
