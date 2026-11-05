-- EOS Light v1c follow-up (CTO 2026-11-05 3:11 PM PT), staging first:
-- (1) private contract-files bucket, (2) US federal holiday calendar + jurisdiction,
-- (3) nightly pg_cron signal runner writing stored occurrence + signal rows. No notifications (v1d).

-- ---------- (1) private contract files ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('eos-contract-files', 'eos-contract-files', false, 10485760)
on conflict (id) do nothing;
create policy "eos contract files select" on storage.objects for select to authenticated
  using (bucket_id = 'eos-contract-files' and (select public.eos_is_private_member()));
create policy "eos contract files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'eos-contract-files' and (select public.eos_is_private_member()));
-- no update/delete policy: soft-delete only

-- ---------- (2) holiday calendar ----------
create table public.eos_holidays (
  jurisdiction text not null,
  holiday date not null,
  name text not null,
  primary key (jurisdiction, holiday)
);
alter table public.eos_holidays enable row level security;
revoke all on public.eos_holidays from anon;
revoke insert, update, delete, truncate on public.eos_holidays from authenticated;
create policy eos_holidays_select on public.eos_holidays for select to authenticated using ((select public.eos_is_member()));
insert into public.eos_holidays(jurisdiction,holiday,name) values
('US-federal','2026-01-01','New Year''s Day (observed 2026)'),
('US-federal','2026-01-19','Birthday of Martin Luther King Jr. (observed 2026)'),
('US-federal','2026-02-16','Washington''s Birthday (observed 2026)'),
('US-federal','2026-05-25','Memorial Day (observed 2026)'),
('US-federal','2026-06-19','Juneteenth (observed 2026)'),
('US-federal','2026-07-03','Independence Day (observed 2026)'),
('US-federal','2026-09-07','Labor Day (observed 2026)'),
('US-federal','2026-10-12','Columbus Day (observed 2026)'),
('US-federal','2026-11-11','Veterans Day (observed 2026)'),
('US-federal','2026-11-26','Thanksgiving Day (observed 2026)'),
('US-federal','2026-12-25','Christmas Day (observed 2026)'),
('US-federal','2027-01-01','New Year''s Day (observed 2027)'),
('US-federal','2027-01-18','Birthday of Martin Luther King Jr. (observed 2027)'),
('US-federal','2027-02-15','Washington''s Birthday (observed 2027)'),
('US-federal','2027-05-31','Memorial Day (observed 2027)'),
('US-federal','2027-06-18','Juneteenth (observed 2027)'),
('US-federal','2027-07-05','Independence Day (observed 2027)'),
('US-federal','2027-09-06','Labor Day (observed 2027)'),
('US-federal','2027-10-11','Columbus Day (observed 2027)'),
('US-federal','2027-11-11','Veterans Day (observed 2027)'),
('US-federal','2027-11-25','Thanksgiving Day (observed 2027)'),
('US-federal','2027-12-24','Christmas Day (observed 2027)'),
('US-federal','2027-12-31','New Year''s Day (observed 2028)'),
('US-federal','2028-01-17','Birthday of Martin Luther King Jr. (observed 2028)'),
('US-federal','2028-02-21','Washington''s Birthday (observed 2028)'),
('US-federal','2028-05-29','Memorial Day (observed 2028)'),
('US-federal','2028-06-19','Juneteenth (observed 2028)'),
('US-federal','2028-07-04','Independence Day (observed 2028)'),
('US-federal','2028-09-04','Labor Day (observed 2028)'),
('US-federal','2028-10-09','Columbus Day (observed 2028)'),
('US-federal','2028-11-10','Veterans Day (observed 2028)'),
('US-federal','2028-11-23','Thanksgiving Day (observed 2028)'),
('US-federal','2028-12-25','Christmas Day (observed 2028)'),
('US-federal','2029-01-01','New Year''s Day (observed 2029)'),
('US-federal','2029-01-15','Birthday of Martin Luther King Jr. (observed 2029)'),
('US-federal','2029-02-19','Washington''s Birthday (observed 2029)'),
('US-federal','2029-05-28','Memorial Day (observed 2029)'),
('US-federal','2029-06-19','Juneteenth (observed 2029)'),
('US-federal','2029-07-04','Independence Day (observed 2029)'),
('US-federal','2029-09-03','Labor Day (observed 2029)'),
('US-federal','2029-10-08','Columbus Day (observed 2029)'),
('US-federal','2029-11-12','Veterans Day (observed 2029)'),
('US-federal','2029-11-22','Thanksgiving Day (observed 2029)'),
('US-federal','2029-12-25','Christmas Day (observed 2029)')
on conflict do nothing;

alter table public.eos_contract_obligations
  add column jurisdiction text not null default 'US-federal';
alter table public.eos_contract_obligations
  alter column business_calendar set default 'US-federal';
update public.eos_contract_obligations set business_calendar = 'US-federal' where business_calendar is null;

-- n business days after d (weekends + calendar holidays skipped). NULL if beyond calendar coverage or unknown calendar.
create or replace function public.eos_add_business_days(d date, n integer, cal text)
returns date language plpgsql stable set search_path = ''
as $$
declare x date := d; k integer := 0; maxd date; step integer := case when n < 0 then -1 else 1 end;
begin
  select max(holiday) into maxd from public.eos_holidays where jurisdiction = cal;
  if maxd is null then return null; end if;
  while k < abs(n) loop
    x := x + step;
    if extract(isodow from x) < 6 and not exists (select 1 from public.eos_holidays h where h.jurisdiction = cal and h.holiday = x) then
      k := k + 1;
    end if;
  end loop;
  if x > maxd then return null; end if;
  return x;
end $$;

create or replace function public.eos_obligation_rules()
returns trigger language plpgsql set search_path = ''
as $$
declare c record; base date; d date; reasons text[] := '{}'; cal text;
begin
  select company_id, start_date, end_date into c from public.eos_contracts where id = new.contract_id;
  new.company_id := c.company_id;
  base := case new.anchor
    when 'contract_start' then c.start_date
    when 'contract_end' then c.end_date
    else new.anchor_date end;
  if new.anchor is null then reasons := reasons || 'missing anchor'::text;
  elsif base is null then reasons := reasons || ('missing ' || new.anchor || ' date')::text; end if;
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
  if base is not null and new.offset_quantity is not null and new.offset_unit = 'business_day' then
    d := public.eos_add_business_days(base, new.offset_quantity, cal);
    if d is null then reasons := reasons || ('business-day calendar "' || coalesce(cal,'?') || '" unknown or out of coverage')::text; end if;
  elsif base is not null and new.offset_quantity is not null and new.offset_unit in ('day','month','year') then
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
  if new.due_confirmed and new.due_date is not null then
    new.needs_review := false; new.review_reason := null;
  else
    new.needs_review := array_length(reasons, 1) is not null or new.status = 'proposed';
    new.review_reason := nullif(array_to_string(reasons, '; '), '');
  end if;
  return new;
end $$;
update public.eos_contract_obligations set title = title; -- recompute with the calendar

-- ---------- (3) nightly runner ----------
create table public.eos_contract_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'cron',
  obligations integer,
  occurrences_upserted integer,
  signals integer,
  error text
);
create table public.eos_contract_signal_rows (
  obligation_id uuid primary key references public.eos_contract_obligations(id),
  run_id uuid not null references public.eos_contract_runs(id),
  contract_id uuid not null,
  company_id bigint,
  type text not null,
  title text not null,
  due_date date,
  days_until integer,
  signal text not null,
  needs_review boolean not null,
  review_reason text,
  owner_sales_id bigint,
  computed_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['eos_contract_runs','eos_contract_signal_rows'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.eos_is_private_member()))', t||'_select', t);
  end loop;
end $$;

create or replace function public.eos_contract_nightly_run(p_trigger text default 'cron')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare rid uuid; n_obl integer; n_occ integer; n_sig integer; today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  insert into public.eos_contract_runs(trigger) values (p_trigger) returning id into rid;
  select count(*) into n_obl from public.eos_contract_obligations where archived_at is null;
  -- one primary occurrence per dated obligation; future unfulfilled occurrences follow rule changes
  with up as (
    insert into public.eos_contract_occurrences(obligation_id, occurrence_key, rule_version, due_date, status)
    select o.id, 'primary', o.revision, o.due_date,
      case when o.status = 'fulfilled' then 'fulfilled'
           when o.status = 'waived' then 'waived'
           when o.status = 'not_applicable' then 'not_applicable'
           when o.due_date < today then 'missed' else 'open' end
    from public.eos_contract_obligations o
    where o.archived_at is null and o.due_date is not null
    on conflict (obligation_id, occurrence_key) do update
      set due_date = excluded.due_date, rule_version = excluded.rule_version, status = excluded.status
      where public.eos_contract_occurrences.status in ('open','missed')
    returning 1)
  select count(*) into n_occ from up;
  delete from public.eos_contract_signal_rows where true;
  insert into public.eos_contract_signal_rows(obligation_id, run_id, contract_id, company_id, type, title, due_date, days_until, signal, needs_review, review_reason, owner_sales_id)
  select s.id, rid, s.contract_id, s.company_id, s.type, s.title, s.due_date, s.days_until, s.signal, s.needs_review, s.review_reason, s.owner_sales_id
  from public.eos_contract_signals s;
  get diagnostics n_sig = row_count;
  update public.eos_contracts set last_evaluated_at = now() where archived_at is null;
  update public.eos_contract_runs set finished_at = now(), obligations = n_obl, occurrences_upserted = n_occ, signals = n_sig where id = rid;
  return rid;
end $$; -- failures roll back and surface in cron.job_run_details
revoke all on function public.eos_contract_nightly_run(text) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
-- 10:00 UTC = 2:00 AM PST (3:00 AM during PDT). pg_cron schedules are UTC.
select cron.unschedule(jobid) from cron.job where jobname = 'eos-contract-signals-nightly';
select cron.schedule('eos-contract-signals-nightly', '0 10 * * *', $$select public.eos_contract_nightly_run('cron')$$);
