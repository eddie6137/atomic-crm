-- EOS v1c A5/C2: drop the force_fail test hook from the runner before/at prod. Body otherwise identical to 20261105210000.
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
    select count(*) into n_obl from public.eos_contract_obligations where archived_at is null;
    with src as (
      select o.id, o.date_rule_version, o.status, o.timezone, o.fulfilled_through, g.i,
        (o.due_date + make_interval(months => coalesce(o.recurrence_interval_months, 0) * g.i))::date as due
      from public.eos_contract_obligations o
      cross join lateral generate_series(0, coalesce(o.recurrence_count, 1) - 1) g(i)
      where o.archived_at is null and o.due_date is not null
    ), up as (
      insert into public.eos_contract_occurrences(obligation_id, occurrence_key, rule_version, due_date, status, status_source)
      select s.id, 'n:' || s.i, s.date_rule_version, s.due,
        case when s.status in ('waived','not_applicable') then s.status
             when s.status = 'fulfilled' and s.due <= s.fulfilled_through then 'fulfilled'
             when s.due < (now() at time zone s.timezone)::date then 'missed' else 'open' end, 'runner'
      from src s
      on conflict (obligation_id, occurrence_key) do update
        set due_date = excluded.due_date, rule_version = excluded.rule_version, status = excluded.status, status_source = 'runner', archived_at = null
        where public.eos_contract_occurrences.status in ('open','missed')
           or public.eos_contract_occurrences.status_source = 'runner'
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

