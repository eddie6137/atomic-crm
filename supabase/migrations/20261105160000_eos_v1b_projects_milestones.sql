-- EOS Light v1b-2: two-level Projects (parent/sub-project) + Milestones. STAGING first; prod only with CTO gate.
alter table public.eos_projects add column if not exists parent_project_id uuid references public.eos_projects(id);
create index if not exists eos_projects_parent_idx on public.eos_projects(parent_project_id);

-- Max two levels: a sub-project's parent must be top-level, same account, not itself; a parent can't become a child.
create or replace function public.eos_project_hierarchy()
returns trigger language plpgsql set search_path = ''
as $$
declare p public.eos_projects;
begin
  if new.parent_project_id is null then return new; end if;
  if new.parent_project_id = new.id then raise exception 'EOS: project cannot be its own parent'; end if;
  select * into p from public.eos_projects where id = new.parent_project_id;
  if not found then raise exception 'EOS: parent project not found'; end if;
  if p.parent_project_id is not null then raise exception 'EOS: projects are limited to two levels'; end if;
  if p.company_id is distinct from new.company_id then raise exception 'EOS: parent project belongs to a different company'; end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.eos_projects c where c.parent_project_id = new.id) then
    raise exception 'EOS: a project with sub-projects cannot itself be a sub-project';
  end if;
  return new;
end $$;
create trigger eos_projects_hierarchy before insert or update of parent_project_id, company_id on public.eos_projects
  for each row execute function public.eos_project_hierarchy();

create table public.eos_milestones (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  project_id uuid not null references public.eos_projects(id),
  title text not null,
  due_date date,
  status text not null default 'planned' check (status in ('planned','in_progress','done','missed','cancelled')),
  owner_sales_id bigint references public.sales(id),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);
create index eos_milestones_project_idx on public.eos_milestones(project_id);
create index eos_milestones_company_idx on public.eos_milestones(company_id);
create index eos_milestones_owner_idx on public.eos_milestones(owner_sales_id);

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
  if tg_table_name in ('eos_commitments','eos_issues','eos_deliverables','eos_rocks','eos_scorecard_metrics','eos_milestones') then
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
  if tg_table_name in ('eos_commitments','eos_issues','eos_deliverables','eos_rocks','eos_scorecard_metrics','eos_milestones') then
    if new.project_id is not null then
      update public.eos_projects set last_activity_at = now() where id = new.project_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.eos_after_write() from public, anon, authenticated;

create trigger eos_milestones_before before insert or update on public.eos_milestones for each row execute function public.eos_before_write();
create trigger eos_milestones_after after insert or update on public.eos_milestones for each row execute function public.eos_after_write();

alter table public.eos_milestones enable row level security;
revoke all on public.eos_milestones from anon;
revoke delete, truncate on public.eos_milestones from authenticated;
create policy eos_milestones_select on public.eos_milestones for select to authenticated using ((select public.eos_is_member()));
create policy eos_milestones_insert on public.eos_milestones for insert to authenticated with check ((select public.eos_is_member()));
create policy eos_milestones_update on public.eos_milestones for update to authenticated using ((select public.eos_is_member())) with check ((select public.eos_is_member()));
