-- EOS Light v1c: Contracts + clause obligations + occurrences (spec §8). PRIVATE domain:
-- every table is readable/writable only by eos_is_private_member() (Joe/Eddie, verified sales ids).
-- No writes to eos_activity (Team-readable) from these tables: avoids leaking private changes.
-- No Team-sheet mapping. No outbound notices. Soft-delete only.

create table public.eos_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  project_id uuid references public.eos_projects(id),
  title text not null,
  version integer not null default 1 check (version >= 1),
  start_date date,
  term_quantity integer check (term_quantity > 0),
  term_unit text check (term_unit in ('day','month','year')),
  end_date_rule text,
  end_date date,
  status text not null default 'draft' check (status in ('draft','active','expired','terminated')),
  owner_sales_id bigint references public.sales(id),
  notes text,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  -- OPEN (Joe+Eddie): pricing / partner terms are free-text stubs, not interpreted
  pricing_terms_stub text,
  partner_terms_stub text,
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);
create index eos_contracts_company_idx on public.eos_contracts(company_id);

create table public.eos_contract_obligations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.eos_contracts(id),
  contract_version integer not null default 1,
  company_id bigint references public.companies(id),
  type text not null check (type in ('fee_step_up','review','renewal','notice','threshold','scope_addendum')),
  title text not null,
  source_excerpt text,
  source_page text,
  owner_sales_id bigint references public.sales(id),
  offset_quantity integer,
  offset_unit text check (offset_unit in ('day','business_day','month','year')),
  anchor text check (anchor in ('contract_start','contract_end','period_start','period_end','invoice_date','scope_event')),
  anchor_date date,           -- manual anchor value for invoice_date / scope_event / period_*
  due_rule text,
  computed_due_date date,
  due_date date,              -- effective date; computed unless due_confirmed
  due_confirmed boolean not null default false,
  timezone text not null default 'America/Los_Angeles',
  business_calendar text,     -- OPEN: holiday calendar/jurisdiction; no silent calendar-day substitute
  lead_days integer[] not null default '{30,14,3}',
  status text not null default 'proposed'
    check (status in ('proposed','open','upcoming','fulfilled','missed','waived','not_applicable')),
  needs_review boolean not null default true,
  review_reason text,
  -- private amount impact (always an estimate flag, never an invoice/legal determination)
  amount_impact numeric(14,2),
  amount_currency text default 'USD',
  amount_basis text,
  amount_estimated boolean not null default true,
  threshold_metric text,
  threshold_comparator text check (threshold_comparator in ('>','>=','=','<=','<')),
  threshold_value numeric,
  evidence text,
  confirmed_by bigint references public.sales(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz
);
create index eos_obligations_contract_idx on public.eos_contract_obligations(contract_id);
create index eos_obligations_due_idx on public.eos_contract_obligations(due_date);

create table public.eos_contract_occurrences (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.eos_contract_obligations(id),
  occurrence_key text not null,
  rule_version integer not null default 1,
  due_date date,
  status text not null default 'open' check (status in ('open','fulfilled','missed','waived','not_applicable')),
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  revision integer not null default 1,
  archived_at timestamptz,
  unique (obligation_id, occurrence_key)
);

-- generic standard columns
create or replace function public.eos_private_before_write()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.eos_current_sales_id());
    new.revision := 1; new.created_at := now();
  else
    new.id := old.id; new.created_at := old.created_at; new.created_by := old.created_by;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- contract rules: confirmed (non-draft) contract needs a link or upload; end date from term when possible
create or replace function public.eos_contract_rules()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'draft' and jsonb_array_length(new.links) = 0 and jsonb_array_length(new.attachments) = 0 then
    raise exception 'EOS: a confirmed contract needs an upload or link';
  end if;
  if new.end_date is null and new.start_date is not null and new.term_quantity is not null and new.term_unit is not null then
    new.end_date := (new.start_date + make_interval(
        days => case when new.term_unit = 'day' then new.term_quantity else 0 end,
        months => case when new.term_unit = 'month' then new.term_quantity else 0 end,
        years => case when new.term_unit = 'year' then new.term_quantity else 0 end))::date - 1;
  end if;
  return new;
end $$;

-- obligation date rules (spec §8 / A12). Ambiguity => needs_review, no guessed date.
create or replace function public.eos_obligation_rules()
returns trigger language plpgsql set search_path = ''
as $$
declare c record; base date; d date; reasons text[] := '{}';
begin
  select company_id, start_date, end_date into c from public.eos_contracts where id = new.contract_id;
  new.company_id := c.company_id;
  base := case new.anchor
    when 'contract_start' then c.start_date
    when 'contract_end' then c.end_date
    else new.anchor_date end;
  if new.anchor is null then reasons := reasons || 'missing anchor'::text;
  elsif base is null then reasons := reasons || ('missing ' || new.anchor || ' date')::text; end if;
  if new.offset_unit = 'business_day' and new.business_calendar is null then
    reasons := reasons || 'business-day calendar OPEN'::text;
  end if;
  if new.type = 'threshold' and (new.threshold_metric is null or new.threshold_comparator is null or new.threshold_value is null) then
    reasons := reasons || 'threshold metric/comparator/value missing'::text;
  end if;
  if new.type = 'review' and not new.due_confirmed then
    reasons := reasons || 'review date/window must be confirmed from clause'::text;
  end if;
  if new.type = 'scope_addendum' and new.anchor_date is null then
    reasons := reasons || 'needs confirmed marketplace/brand event'::text;
  end if;
  d := null;
  if base is not null and new.offset_quantity is not null and new.offset_unit in ('day','month','year') then
    d := (base + make_interval(
        days => case when new.offset_unit = 'day' then new.offset_quantity else 0 end,
        months => case when new.offset_unit = 'month' then new.offset_quantity else 0 end,
        years => case when new.offset_unit = 'year' then new.offset_quantity else 0 end))::date;
    -- calendar-month clamp (e.g. Jan 31 + 1 month) must be human-confirmed
    if new.offset_unit in ('month','year') and extract(day from d) <> extract(day from base) then
      reasons := reasons || 'month-end clamp needs confirmation'::text;
    end if;
  elsif base is not null and new.offset_quantity is null then
    reasons := reasons || 'missing offset'::text;
  end if;
  new.computed_due_date := d;
  if not new.due_confirmed then new.due_date := d; end if;
  if new.due_confirmed and new.due_date is not null then
    new.needs_review := false; new.review_reason := null;
  else
    new.needs_review := array_length(reasons, 1) is not null or new.status = 'proposed';
    new.review_reason := nullif(array_to_string(reasons, '; '), '');
  end if;
  return new;
end $$;

create trigger eos_contracts_before before insert or update on public.eos_contracts for each row execute function public.eos_private_before_write();
create trigger eos_contracts_rules before insert or update on public.eos_contracts for each row execute function public.eos_contract_rules();
create trigger eos_obligations_before before insert or update on public.eos_contract_obligations for each row execute function public.eos_private_before_write();
create trigger eos_obligations_rules before insert or update on public.eos_contract_obligations for each row execute function public.eos_obligation_rules();
create trigger eos_occurrences_before before insert or update on public.eos_contract_occurrences for each row execute function public.eos_private_before_write();

-- RLS: private members only
do $$
declare t text;
begin
  foreach t in array array['eos_contracts','eos_contract_obligations','eos_contract_occurrences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.eos_is_private_member()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.eos_is_private_member()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.eos_is_private_member())) with check ((select public.eos_is_private_member()))', t||'_update', t);
  end loop;
end $$;

-- private signal view (invoker rights => same RLS). Computed on load; no closed-app alerts.
create view public.eos_contract_signals with (security_invoker = on) as
select o.id, o.contract_id, o.company_id, o.type, o.title, o.due_date, o.status, o.needs_review, o.review_reason,
  o.owner_sales_id, o.lead_days,
  (o.due_date - (now() at time zone 'America/Los_Angeles')::date) as days_until,
  case
    when o.status in ('fulfilled','waived','not_applicable') then 'closed'
    when o.due_date is null then 'needs_review'
    when o.due_date < (now() at time zone 'America/Los_Angeles')::date then 'missed'
    when (o.due_date - (now() at time zone 'America/Los_Angeles')::date) <= (select max(x) from unnest(o.lead_days) x) then 'upcoming'
    else 'later' end as signal
from public.eos_contract_obligations o
where o.archived_at is null;
revoke all on public.eos_contract_signals from anon;
grant select on public.eos_contract_signals to authenticated;

-- Membership API for the UI (boolean only, no member list)
-- eos_is_private_member() already granted to authenticated in v1a.
