-- EOS Light v1c: Goldfish review fixes (status/evals/2026-11-05-eos-v1c-egm-review.md), staging first.
-- F1 anchor recompute, F2 end-date clamp/derived flag, F3 occurrences + lead-alert dedupe,
-- F4 no-date flag, F6 lead_days validation, F7 per-clause timezone + server evaluated_at,
-- F9 contract_id immutable + version check, F10 sales.user_id not updatable by app roles.

-- ---------- columns ----------
alter table public.eos_contracts
  add column end_date_derived boolean not null default false,
  add column end_date_review_reason text;
alter table public.eos_contract_obligations
  add column anchor_changed_at timestamptz,
  add column recurrence_interval_months integer check (recurrence_interval_months > 0),
  add column recurrence_count integer check (recurrence_count between 1 and 120);
update public.eos_contract_obligations set lead_days = '{30,14,3}' where lead_days is null or cardinality(lead_days) = 0;
alter table public.eos_contract_obligations
  add constraint eos_obligations_lead_days_valid check (cardinality(lead_days) > 0 and 0 < all(lead_days));

-- ---------- F2: contract end date ----------
create or replace function public.eos_contract_rules()
returns trigger language plpgsql set search_path = ''
as $$
declare calc date; anniv date; manual boolean;
begin
  if new.status <> 'draft' and jsonb_array_length(new.links) = 0 and jsonb_array_length(new.attachments) = 0 then
    raise exception 'EOS: a confirmed contract needs an upload or link';
  end if;
  calc := null; anniv := null;
  if new.start_date is not null and new.term_quantity is not null and new.term_unit is not null then
    anniv := (new.start_date + make_interval(
        days => case when new.term_unit = 'day' then new.term_quantity else 0 end,
        months => case when new.term_unit = 'month' then new.term_quantity else 0 end,
        years => case when new.term_unit = 'year' then new.term_quantity else 0 end))::date;
    calc := anniv - 1;
  end if;
  -- manual = user typed an end date (insert with value, or update that changed it)
  manual := new.end_date is not null and (
    tg_op = 'INSERT' or new.end_date is distinct from old.end_date or not old.end_date_derived);
  if manual then
    new.end_date_derived := false; new.end_date_review_reason := null;
  else
    new.end_date := calc;
    new.end_date_derived := calc is not null;
    new.end_date_review_reason := case when calc is null then null else
      'end date derived (start + term − 1 day), not confirmed from clause'
      || case when new.term_unit in ('month','year') and extract(day from anniv) <> extract(day from new.start_date)
              then '; month-end clamp needs confirmation' else '' end end;
  end if;
  return new;
end $$;

-- ---------- obligation rules (F1/F2/F4/F6/F7/F9) ----------
create or replace function public.eos_obligation_rules()
returns trigger language plpgsql set search_path = ''
as $$
declare c record; base date; d date; reasons text[] := '{}'; cal text;
begin
  if tg_op = 'UPDATE' and new.contract_id is distinct from old.contract_id then
    raise exception 'EOS: contract_id is immutable on a clause';
  end if;
  select company_id, start_date, end_date, end_date_derived, end_date_review_reason, version into c
    from public.eos_contracts where id = new.contract_id;
  if new.contract_version > c.version then
    raise exception 'EOS: clause contract_version % exceeds contract version %', new.contract_version, c.version;
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'EOS: unknown timezone %', new.timezone;
  end if;
  if new.lead_days is null or cardinality(new.lead_days) = 0 then new.lead_days := '{30,14,3}'; end if;
  new.company_id := c.company_id;
  base := case new.anchor
    when 'contract_start' then c.start_date
    when 'contract_end' then c.end_date
    else new.anchor_date end;
  if new.anchor is null then reasons := reasons || 'missing anchor'::text;
  elsif base is null then reasons := reasons || ('missing ' || new.anchor || ' date')::text; end if;
  if new.anchor = 'contract_end' and c.end_date_derived then
    reasons := reasons || ('contract ' || c.end_date_review_reason)::text;
  end if;
  cal := coalesce(new.business_calendar, new.jurisdiction);
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
  if base is not null and new.offset_quantity is not null and new.offset_unit is null then
    reasons := reasons || 'missing offset unit'::text;
  elsif base is not null and new.offset_quantity is not null and new.offset_unit = 'business_day' then
    d := public.eos_add_business_days(base, new.offset_quantity, cal);
    if d is null then reasons := reasons || ('business-day calendar "' || coalesce(cal,'?') || '" unknown or out of coverage')::text; end if;
  elsif base is not null and new.offset_quantity is not null then
    d := (base + make_interval(
        days => case when new.offset_unit = 'day' then new.offset_quantity else 0 end,
        months => case when new.offset_unit = 'month' then new.offset_quantity else 0 end,
        years => case when new.offset_unit = 'year' then new.offset_quantity else 0 end))::date;
    if new.offset_unit in ('month','year') and extract(day from d) <> extract(day from base) then
      reasons := reasons || 'month-end clamp needs confirmation'::text;
    end if;
  elsif base is not null and new.offset_quantity is null then
    reasons := reasons || 'missing offset'::text;
  end if;
  new.computed_due_date := d;
  if not new.due_confirmed then new.due_date := d; end if;
  -- confirmation bookkeeping (F1): (re)confirming stamps confirmed_at
  if new.due_confirmed and (tg_op = 'INSERT' or not old.due_confirmed or new.due_date is distinct from old.due_date) then
    new.confirmed_at := clock_timestamp(); new.confirmed_by := coalesce(public.eos_current_sales_id(), new.confirmed_by);
  end if;
  if new.due_confirmed and new.anchor_changed_at is not null and (new.confirmed_at is null or new.anchor_changed_at > new.confirmed_at) then
    reasons := reasons || 'contract anchor changed after confirmation'::text;
  end if;
  if new.due_date is null and array_length(reasons, 1) is null then
    reasons := reasons || 'no due date computed'::text;  -- F4
  end if;
  if new.due_confirmed and new.due_date is not null then
    reasons := array_remove(reasons, 'review date/window must be confirmed from clause');
    reasons := array_remove(reasons, 'month-end clamp needs confirmation');
    reasons := array(select x from unnest(reasons) x where x not like 'contract end date derived%');
  end if;
  new.needs_review := array_length(reasons, 1) is not null or new.status = 'proposed' or new.due_date is null;
  new.review_reason := nullif(array_to_string(reasons, '; '), '');
  return new;
end $$;

-- ---------- F1: contract anchor change recomputes clauses ----------
create or replace function public.eos_contract_anchor_changed()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
     or new.term_quantity is distinct from old.term_quantity or new.term_unit is distinct from old.term_unit then
    update public.eos_contract_obligations o
       set anchor_changed_at = case when o.due_confirmed then clock_timestamp() else o.anchor_changed_at end
     where o.contract_id = new.id and o.archived_at is null
       and o.anchor in ('contract_start','contract_end');
  end if;
  return null;
end $$;
create trigger eos_contracts_anchor_changed after update on public.eos_contracts
  for each row execute function public.eos_contract_anchor_changed();

-- ---------- F3: lead alerts (dedupe occurrence × lead_day × rule_version) ----------
alter table public.eos_contract_occurrences add column lead_bucket integer;
update public.eos_contract_occurrences set occurrence_key = 'n:0' where occurrence_key = 'primary';
create table public.eos_contract_lead_alerts (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.eos_contract_occurrences(id),
  lead_day integer not null,
  rule_version integer not null,
  fired_at timestamptz not null default now(),
  run_id uuid references public.eos_contract_runs(id),
  unique (occurrence_id, lead_day, rule_version)
);
alter table public.eos_contract_lead_alerts enable row level security;
revoke all on public.eos_contract_lead_alerts from anon;
revoke insert, update, delete, truncate on public.eos_contract_lead_alerts from authenticated;
create policy eos_contract_lead_alerts_select on public.eos_contract_lead_alerts for select to authenticated using ((select public.eos_is_private_member()));

-- signals read occurrences; undated obligations fall back to the obligation row
drop view if exists public.eos_contract_signals;
create view public.eos_contract_signals with (security_invoker = on) as
with base as (
  select o.id::text || ':' || oc.occurrence_key as id, o.id as obligation_id, oc.id as occurrence_id, oc.occurrence_key,
    o.contract_id, o.company_id, o.type, o.title, oc.due_date, o.computed_due_date, o.due_confirmed,
    o.status as obligation_status, oc.status as occurrence_status, o.needs_review, o.review_reason,
    o.owner_sales_id, o.lead_days, o.timezone
  from public.eos_contract_occurrences oc
  join public.eos_contract_obligations o on o.id = oc.obligation_id
  where o.archived_at is null and oc.archived_at is null
  union all
  select o.id::text || ':-', o.id, null, null, o.contract_id, o.company_id, o.type, o.title, o.due_date, o.computed_due_date, o.due_confirmed,
    o.status, null, o.needs_review, o.review_reason, o.owner_sales_id, o.lead_days, o.timezone
  from public.eos_contract_obligations o
  where o.archived_at is null
    and not exists (select 1 from public.eos_contract_occurrences oc where oc.obligation_id = o.id and oc.archived_at is null)
), t as (
  select b.*, (b.due_date - (now() at time zone b.timezone)::date) as days_until from base b
)
select t.id, t.obligation_id, t.occurrence_id, t.occurrence_key, t.contract_id, t.company_id, t.type, t.title,
  t.due_date, t.computed_due_date, t.due_confirmed, t.obligation_status as status, t.occurrence_status,
  t.needs_review, t.review_reason, t.owner_sales_id, t.lead_days, t.days_until,
  (t.obligation_status = 'proposed') as unconfirmed,
  (select min(l) from unnest(t.lead_days) l where t.days_until >= 0 and t.days_until <= l) as lead_bucket,
  case
    when t.obligation_status in ('fulfilled','waived','not_applicable')
      or t.occurrence_status in ('fulfilled','waived','not_applicable') then 'closed'
    when t.due_date is null then 'needs_review'
    when t.days_until < 0 then 'missed'
    when t.days_until <= (select max(l) from unnest(t.lead_days) l) then 'upcoming'
    else 'later' end as signal,
  now() as evaluated_at
from t;
revoke all on public.eos_contract_signals from anon;
grant select on public.eos_contract_signals to authenticated;

-- stored signal rows: one per occurrence (or undated obligation)
drop table public.eos_contract_signal_rows;
create table public.eos_contract_signal_rows (
  id text primary key,
  obligation_id uuid not null references public.eos_contract_obligations(id),
  occurrence_id uuid references public.eos_contract_occurrences(id),
  occurrence_key text,
  run_id uuid not null references public.eos_contract_runs(id),
  contract_id uuid not null,
  company_id bigint,
  type text not null,
  title text not null,
  due_date date,
  days_until integer,
  lead_bucket integer,
  signal text not null,
  unconfirmed boolean not null,
  needs_review boolean not null,
  review_reason text,
  owner_sales_id bigint,
  computed_at timestamptz not null default now()
);
alter table public.eos_contract_signal_rows enable row level security;
revoke all on public.eos_contract_signal_rows from anon;
revoke insert, update, delete, truncate on public.eos_contract_signal_rows from authenticated;
create policy eos_contract_signal_rows_select on public.eos_contract_signal_rows for select to authenticated using ((select public.eos_is_private_member()));
alter table public.eos_contract_runs add column alerts_fired integer;

create or replace function public.eos_contract_nightly_run(p_trigger text default 'cron')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare rid uuid; n_obl integer; n_occ integer; n_sig integer; n_alert integer;
begin
  insert into public.eos_contract_runs(trigger) values (p_trigger) returning id into rid;
  select count(*) into n_obl from public.eos_contract_obligations where archived_at is null;
  -- occurrences: n:0..n:k-1 (k = recurrence_count, default 1); only open/missed ones follow rule changes
  with src as (
    select o.id, o.revision, o.status, o.timezone, g.i,
      (o.due_date + make_interval(months => coalesce(o.recurrence_interval_months, 0) * g.i))::date as due
    from public.eos_contract_obligations o
    cross join lateral generate_series(0, coalesce(o.recurrence_count, 1) - 1) g(i)
    where o.archived_at is null and o.due_date is not null
  ), up as (
    insert into public.eos_contract_occurrences(obligation_id, occurrence_key, rule_version, due_date, status)
    select s.id, 'n:' || s.i, s.revision, s.due,
      case when s.status in ('fulfilled','waived','not_applicable') then s.status
           when s.due < (now() at time zone s.timezone)::date then 'missed' else 'open' end
    from src s
    on conflict (obligation_id, occurrence_key) do update
      set due_date = excluded.due_date, rule_version = excluded.rule_version, status = excluded.status
      where public.eos_contract_occurrences.status in ('open','missed')
    returning 1)
  select count(*) into n_occ from up;
  -- lead alerts: each (occurrence, lead_day, rule_version) fires at most once; catch-up fires skipped buckets
  with fired as (
    insert into public.eos_contract_lead_alerts(occurrence_id, lead_day, rule_version, run_id)
    select oc.id, l, oc.rule_version, rid
    from public.eos_contract_occurrences oc
    join public.eos_contract_obligations o on o.id = oc.obligation_id
    cross join lateral unnest(o.lead_days) l
    where oc.status = 'open' and oc.archived_at is null and o.archived_at is null
      and (oc.due_date - (now() at time zone o.timezone)::date) between 0 and l
    on conflict (occurrence_id, lead_day, rule_version) do nothing
    returning 1)
  select count(*) into n_alert from fired;
  delete from public.eos_contract_signal_rows where true;
  insert into public.eos_contract_signal_rows(id, obligation_id, occurrence_id, occurrence_key, run_id, contract_id, company_id, type, title,
    due_date, days_until, lead_bucket, signal, unconfirmed, needs_review, review_reason, owner_sales_id)
  select s.id, s.obligation_id, s.occurrence_id, s.occurrence_key, rid, s.contract_id, s.company_id, s.type, s.title,
    s.due_date, s.days_until, s.lead_bucket, s.signal, s.unconfirmed, s.needs_review, s.review_reason, s.owner_sales_id
  from public.eos_contract_signals s;
  get diagnostics n_sig = row_count;
  update public.eos_contract_occurrences oc set lead_bucket = s.lead_bucket
    from public.eos_contract_signals s where s.occurrence_id = oc.id and oc.lead_bucket is distinct from s.lead_bucket;
  update public.eos_contracts set last_evaluated_at = now() where archived_at is null;
  update public.eos_contract_runs set finished_at = clock_timestamp(), obligations = n_obl,
    occurrences_upserted = n_occ, signals = n_sig, alerts_fired = n_alert where id = rid;
  return rid;
end $$;
revoke all on function public.eos_contract_nightly_run(text) from public, anon, authenticated;

-- ---------- F10: app roles cannot change sales identity/role columns ----------
revoke update on public.sales from authenticated, anon;
grant update (first_name, last_name, avatar, email, secondary_emails) on public.sales to authenticated;

-- recompute existing rows under the new rules
-- end dates written by the pre-fix trigger were derived: clear so they re-derive with the flag
-- N7 guard: only clear end dates that equal the old derived value (start + term − 1 day); never manual ones
update public.eos_contracts set end_date = null
  where start_date is not null and term_quantity is not null and term_unit is not null
    and end_date = (start_date + make_interval(
        days => case when term_unit = 'day' then term_quantity else 0 end,
        months => case when term_unit = 'month' then term_quantity else 0 end,
        years => case when term_unit = 'year' then term_quantity else 0 end))::date - 1;
update public.eos_contract_obligations set title = title;
