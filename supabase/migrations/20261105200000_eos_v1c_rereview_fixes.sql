-- EOS Light v1c: Goldfish RE-REVIEW conditions (@ede3cb65), staging first.
-- N1 live occurrence dates in the view; N2 date_rule_version; N3 orphan archive + per-occurrence fulfilment;
-- N4 failure-logged runs (subtransaction) + status for a stale badge; N5 advisory lock; N6 runner no longer
-- touches contracts; N7 idempotent cron; N8 holidays through 2031 + coverage end on runs; F6 nit (no NULL lead days).

-- ---------- N2: date rule version ----------
alter table public.eos_contract_obligations add column date_rule_version integer not null default 1;
alter table public.eos_contract_obligations drop constraint eos_obligations_lead_days_valid;
alter table public.eos_contract_obligations add constraint eos_obligations_lead_days_valid
  check (cardinality(lead_days) > 0 and array_position(lead_days, null) is null and 0 < all(lead_days));

create or replace function public.eos_obligation_date_rule_version()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.date_rule_version := 1;
  elsif (new.anchor, new.anchor_date, new.offset_quantity, new.offset_unit, new.recurrence_interval_months,
         new.recurrence_count, new.due_date, new.due_confirmed, new.business_calendar, new.jurisdiction, new.timezone)
        is distinct from
        (old.anchor, old.anchor_date, old.offset_quantity, old.offset_unit, old.recurrence_interval_months,
         old.recurrence_count, old.due_date, old.due_confirmed, old.business_calendar, old.jurisdiction, old.timezone) then
    new.date_rule_version := old.date_rule_version + 1;
  else
    new.date_rule_version := old.date_rule_version;
  end if;
  return new;
end $$;
-- runs after eos_obligations_rules (trigger names fire alphabetically: _before, _rules, _zz_date_rule)
create trigger eos_obligations_zz_date_rule before insert or update on public.eos_contract_obligations
  for each row execute function public.eos_obligation_date_rule_version();

-- ---------- N8: calendar through 2031 ----------
insert into public.eos_holidays(jurisdiction,holiday,name) values
('US-federal','2030-01-01','New Year''s Day (observed 2030)'),
('US-federal','2030-01-21','Birthday of Martin Luther King Jr. (observed 2030)'),
('US-federal','2030-02-18','Washington''s Birthday (observed 2030)'),
('US-federal','2030-05-27','Memorial Day (observed 2030)'),
('US-federal','2030-06-19','Juneteenth (observed 2030)'),
('US-federal','2030-07-04','Independence Day (observed 2030)'),
('US-federal','2030-09-02','Labor Day (observed 2030)'),
('US-federal','2030-10-14','Columbus Day (observed 2030)'),
('US-federal','2030-11-11','Veterans Day (observed 2030)'),
('US-federal','2030-11-28','Thanksgiving Day (observed 2030)'),
('US-federal','2030-12-25','Christmas Day (observed 2030)'),
('US-federal','2031-01-01','New Year''s Day (observed 2031)'),
('US-federal','2031-01-20','Birthday of Martin Luther King Jr. (observed 2031)'),
('US-federal','2031-02-17','Washington''s Birthday (observed 2031)'),
('US-federal','2031-05-26','Memorial Day (observed 2031)'),
('US-federal','2031-06-19','Juneteenth (observed 2031)'),
('US-federal','2031-07-04','Independence Day (observed 2031)'),
('US-federal','2031-09-01','Labor Day (observed 2031)'),
('US-federal','2031-10-13','Columbus Day (observed 2031)'),
('US-federal','2031-11-11','Veterans Day (observed 2031)'),
('US-federal','2031-11-27','Thanksgiving Day (observed 2031)'),
('US-federal','2031-12-25','Christmas Day (observed 2031)')
on conflict do nothing;

-- ---------- N1 + N3: live view ----------
-- Occurrence dates are computed live from the obligation (so edits show immediately and cleared dates clear);
-- stored occurrence rows only contribute per-occurrence status (fulfilled/waived/not_applicable) and ids.
drop view if exists public.eos_contract_signals;
create view public.eos_contract_signals with (security_invoker = on) as
with occ as (
  select o.*, g.i,
    (o.due_date + make_interval(months => coalesce(o.recurrence_interval_months, 0) * g.i))::date as occ_due
  from public.eos_contract_obligations o
  cross join lateral generate_series(0, coalesce(o.recurrence_count, 1) - 1) g(i)
  where o.archived_at is null and o.due_date is not null
), base as (
  select oc.id::text || ':n:' || oc.i as id, oc.id as obligation_id, so.id as occurrence_id, 'n:' || oc.i as occurrence_key,
    oc.contract_id, oc.company_id, oc.type, oc.title, oc.occ_due as due_date, oc.computed_due_date, oc.due_confirmed,
    oc.status as obligation_status, so.status as occurrence_status, oc.needs_review, oc.review_reason,
    oc.owner_sales_id, oc.lead_days, oc.timezone
  from occ oc
  left join public.eos_contract_occurrences so
    on so.obligation_id = oc.id and so.occurrence_key = 'n:' || oc.i and so.archived_at is null
  union all
  select o.id::text || ':-', o.id, null, null, o.contract_id, o.company_id, o.type, o.title, null::date, o.computed_due_date,
    o.due_confirmed, o.status, null, o.needs_review, o.review_reason, o.owner_sales_id, o.lead_days, o.timezone
  from public.eos_contract_obligations o
  where o.archived_at is null and o.due_date is null
), t as (
  select b.*, (b.due_date - (now() at time zone b.timezone)::date) as days_until from base b
)
select t.id, t.obligation_id, t.occurrence_id, t.occurrence_key, t.contract_id, t.company_id, t.type, t.title,
  t.due_date, t.computed_due_date, t.due_confirmed, t.obligation_status as status, t.occurrence_status,
  t.needs_review, t.review_reason, t.owner_sales_id, t.lead_days, t.days_until,
  (t.obligation_status = 'proposed') as unconfirmed,
  (select min(l) from unnest(t.lead_days) l where t.days_until >= 0 and t.days_until <= l) as lead_bucket,
  case
    when t.occurrence_status in ('fulfilled','waived','not_applicable') then 'closed'
    when t.obligation_status in ('waived','not_applicable') then 'closed'
    -- N3: fulfilling the clause closes only occurrences already due, not future repeats
    when t.obligation_status = 'fulfilled' and (t.days_until is null or t.days_until <= 0) then 'closed'
    when t.due_date is null then 'needs_review'
    when t.days_until < 0 then 'missed'
    when t.days_until <= (select max(l) from unnest(t.lead_days) l) then 'upcoming'
    else 'later' end as signal,
  now() as evaluated_at
from t;
revoke all on public.eos_contract_signals from anon;
grant select on public.eos_contract_signals to authenticated;

-- ---------- N4/N5/N6/N8: runner ----------
alter table public.eos_contract_runs
  add column status text not null default 'ok' check (status in ('running','ok','failed','skipped')),
  add column occurrences_archived integer,
  add column calendar_coverage_end date;

create or replace function public.eos_contract_nightly_run(p_trigger text default 'cron')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare rid uuid; n_obl integer; n_occ integer; n_arch integer; n_sig integer; n_alert integer; cov date;
begin
  insert into public.eos_contract_runs(trigger, status) values (p_trigger, 'running') returning id into rid;
  -- N5: one run at a time
  if not pg_try_advisory_xact_lock(hashtext('eos_contract_nightly_run')) then
    update public.eos_contract_runs set status = 'skipped', finished_at = clock_timestamp(),
      error = 'another run holds the lock' where id = rid;
    return rid;
  end if;
  begin  -- N4: subtransaction; on error only this block rolls back and the failed run row survives
    if p_trigger = 'force_fail' then raise exception 'forced failure (test hook)'; end if;
    select count(*) into n_obl from public.eos_contract_obligations where archived_at is null;
    with src as (
      select o.id, o.date_rule_version, o.status, o.timezone, g.i,
        (o.due_date + make_interval(months => coalesce(o.recurrence_interval_months, 0) * g.i))::date as due
      from public.eos_contract_obligations o
      cross join lateral generate_series(0, coalesce(o.recurrence_count, 1) - 1) g(i)
      where o.archived_at is null and o.due_date is not null
    ), up as (
      insert into public.eos_contract_occurrences(obligation_id, occurrence_key, rule_version, due_date, status)
      select s.id, 'n:' || s.i, s.date_rule_version, s.due,
        case when s.status in ('waived','not_applicable') then s.status
             when s.status = 'fulfilled' and s.due <= (now() at time zone s.timezone)::date then 'fulfilled'
             when s.due < (now() at time zone s.timezone)::date then 'missed' else 'open' end
      from src s
      on conflict (obligation_id, occurrence_key) do update
        set due_date = excluded.due_date, rule_version = excluded.rule_version, status = excluded.status, archived_at = null
        where public.eos_contract_occurrences.status in ('open','missed')
           or public.eos_contract_occurrences.archived_at is not null
      returning 1)
    select count(*) into n_occ from up;
    -- N3: archive occurrences no longer produced by the clause (count lowered, date cleared, clause archived)
    with arch as (
      update public.eos_contract_occurrences oc set archived_at = now()
      where oc.archived_at is null and oc.status in ('open','missed') and not exists (
        select 1 from public.eos_contract_obligations o
        cross join lateral generate_series(0, coalesce(o.recurrence_count, 1) - 1) g(i)
        where o.id = oc.obligation_id and o.archived_at is null and o.due_date is not null
          and oc.occurrence_key = 'n:' || g.i)
      returning 1)
    select count(*) into n_arch from arch;
    -- lead alerts keyed on date_rule_version (N2) via occurrence.rule_version
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
    select max(holiday) into cov from public.eos_holidays where jurisdiction = 'US-federal';
    -- N6: no writes to eos_contracts (last-evaluated lives on the runs table)
    update public.eos_contract_runs set status = 'ok', finished_at = clock_timestamp(), obligations = n_obl,
      occurrences_upserted = n_occ, occurrences_archived = n_arch, signals = n_sig, alerts_fired = n_alert,
      calendar_coverage_end = cov
    where id = rid;
  exception when others then
    update public.eos_contract_runs set status = 'failed', finished_at = clock_timestamp(), error = left(sqlerrm, 500)
    where id = rid;
  end;
  return rid;
end $$;
revoke all on function public.eos_contract_nightly_run(text) from public, anon, authenticated;

-- ---------- N7: idempotent cron (exactly one job) ----------
select cron.unschedule(jobid) from cron.job where jobname = 'eos-contract-signals-nightly';
select cron.schedule('eos-contract-signals-nightly', '0 10 * * *', $$select public.eos_contract_nightly_run('cron')$$);
