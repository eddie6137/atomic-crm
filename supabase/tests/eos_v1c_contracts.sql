-- EOS v1c contracts: SQL-level tests for date + runner logic.
-- Self-rolling-back: always ends by raising. PASS = message starts with 'EOS_TESTS PASS'; any 'FAIL' = failure.
-- Run on STAGING only: psql "$STAGING_DB_URL" -f supabase/tests/eos_v1c_contracts.sql  (or via the Supabase connector execute_sql)
-- Needs the synthetic users eos-test@example.invalid (private member) and pat.demo@example.invalid (Team).
do $$
declare priv uuid; team uuid; comp bigint; cid uuid; ob uuid; ob2 uuid; v1 int; v2 int; n int; n2 int; rid uuid;
  f text := ''; passed int := 0; d date; s text; h1 text; h2 text; st text; today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  select user_id into priv from public.sales where email = 'eos-test@example.invalid';
  select user_id into team from public.sales where email = 'pat.demo@example.invalid';
  select id into comp from public.companies order by id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', priv, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- F1 regression: start Jan 1 -> Feb 1 moves the Month-6 date
  insert into public.eos_contracts(company_id, title, start_date, term_quantity, term_unit)
    values (comp, 'T-F1', '2026-01-01', 12, 'month') returning id into cid;
  insert into public.eos_contract_obligations(contract_id, type, title, anchor, offset_quantity, offset_unit, status)
    values (cid, 'review', 'T-m6', 'contract_start', 6, 'month', 'open') returning id into ob;
  update public.eos_contracts set start_date = '2026-02-01' where id = cid;
  select due_date into d from public.eos_contract_obligations where id = ob;
  if d = '2026-08-01' then passed := passed + 1; else f := f || ' FAIL F1 m6=' || coalesce(d::text, 'null'); end if;

  -- N1: live dates, no runner needed; clearing clears
  insert into public.eos_contract_obligations(contract_id, type, title, anchor, anchor_date, offset_quantity, offset_unit,
      status, recurrence_interval_months, recurrence_count)
    values (cid, 'notice', 'T-live', 'invoice_date', today + 20, 0, 'day', 'open', 1, 3) returning id into ob2;
  select count(*), min(due_date) into n, d from public.eos_contract_signals where obligation_id = ob2;
  if n = 3 and d = today + 20 then passed := passed + 1; else f := f || ' FAIL N1 insert n=' || n || ' d=' || coalesce(d::text,'null'); end if;
  update public.eos_contract_obligations set anchor_date = today + 10 where id = ob2;
  select min(due_date) into d from public.eos_contract_signals where obligation_id = ob2;
  if d = today + 10 then passed := passed + 1; else f := f || ' FAIL N1 move d=' || coalesce(d::text,'null'); end if;
  update public.eos_contract_obligations set anchor_date = null where id = ob2;
  select count(*), max(due_date)::text, max(signal) into n, s, st from public.eos_contract_signals where obligation_id = ob2;
  if n = 1 and s is null and st = 'needs_review' then passed := passed + 1; else f := f || ' FAIL N1 clear n=' || n || ' d=' || coalesce(s,'null') || ' sig=' || st; end if;
  update public.eos_contract_obligations set anchor_date = today + 5 where id = ob2;

  -- N2: date_rule_version bumps only on date inputs
  select date_rule_version into v1 from public.eos_contract_obligations where id = ob2;
  update public.eos_contract_obligations set title = 'T-live renamed', evidence = 'x' where id = ob2;
  select date_rule_version into v2 from public.eos_contract_obligations where id = ob2;
  if v2 = v1 then passed := passed + 1; else f := f || ' FAIL N2 non-date bump ' || v1 || '->' || v2; end if;
  reset role;
  rid := public.eos_contract_nightly_run('test');
  select count(*) into n from public.eos_contract_lead_alerts a join public.eos_contract_occurrences o on o.id = a.occurrence_id where o.obligation_id = ob2;
  set local role authenticated;
  update public.eos_contract_obligations set title = 'T-live again' where id = ob2;
  reset role;
  rid := public.eos_contract_nightly_run('test');
  select count(*) into n2 from public.eos_contract_lead_alerts a join public.eos_contract_occurrences o on o.id = a.occurrence_id where o.obligation_id = ob2;
  if n > 0 and n2 = n then passed := passed + 1; else f := f || ' FAIL N2 alerts ' || n || '->' || n2; end if;
  set local role authenticated;
  update public.eos_contract_obligations set anchor_date = today + 4 where id = ob2;
  select date_rule_version into v2 from public.eos_contract_obligations where id = ob2;
  if v2 = v1 + 1 then passed := passed + 1; else f := f || ' FAIL N2 date bump ' || v1 || '->' || v2; end if;

  -- N3: lowering the count archives orphans; fulfilling closes only due occurrences
  update public.eos_contract_obligations set recurrence_count = 1 where id = ob2;
  reset role;
  rid := public.eos_contract_nightly_run('test');
  select count(*) into n from public.eos_contract_occurrences where obligation_id = ob2 and archived_at is null;
  if n = 1 then passed := passed + 1; else f := f || ' FAIL N3 orphans live=' || n; end if;
  set local role authenticated;
  update public.eos_contract_obligations set anchor_date = today - 3, recurrence_count = 3, status = 'fulfilled' where id = ob2;
  select string_agg(occurrence_key || '=' || signal, ',' order by occurrence_key) into s from public.eos_contract_signals where obligation_id = ob2;
  if s = 'n:0=closed,n:1=upcoming,n:2=later' then passed := passed + 1; else f := f || ' FAIL N3 fulfil ' || coalesce(s,'null'); end if;

  -- C1 (#19): recurring clause fulfilled on today-35; repeat n:1 (due ~today-10) came due AFTER the fulfilment
  set local role authenticated;
  insert into public.eos_contract_obligations(contract_id, type, title, anchor, anchor_date, offset_quantity, offset_unit,
      status, recurrence_interval_months, recurrence_count, fulfilled_through)
    values (cid, 'notice', 'T-c1', 'invoice_date', today - 40, 0, 'day', 'fulfilled', 1, 3, today - 35) returning id into ob;
  select string_agg(occurrence_key || '=' || signal, ',' order by occurrence_key) into s from public.eos_contract_signals where obligation_id = ob;
  reset role;
  rid := public.eos_contract_nightly_run('test');
  select status into st from public.eos_contract_occurrences where obligation_id = ob and occurrence_key = 'n:1';
  if s like 'n:0=closed,n:1=missed,n:2=%' and s not like '%n:2=closed%' and st = 'missed'
    then passed := passed + 1; else f := f || ' FAIL C1 view=' || coalesce(s,'null') || ' runner_n1=' || coalesce(st,'null'); end if;

  -- N6: runner does not touch contracts
  reset role;
  select md5(string_agg(c::text, '' order by c.id)) into h1 from public.eos_contracts c;
  rid := public.eos_contract_nightly_run('test');
  select md5(string_agg(c::text, '' order by c.id)) into h2 from public.eos_contracts c;
  if h1 = h2 then passed := passed + 1; else f := f || ' FAIL N6 contracts changed'; end if;

  -- N4: forced failure leaves a failed run row and rolls back the run's work
  select count(*) into n from public.eos_contract_signal_rows;
  rid := public.eos_contract_nightly_run('force_fail');
  select status, error into st, s from public.eos_contract_runs where id = rid;
  select count(*) into n2 from public.eos_contract_signal_rows;
  if st = 'failed' and s like '%forced failure%' and n = n2 then passed := passed + 1; else f := f || ' FAIL N4 ' || coalesce(st,'null'); end if;
  select status into st from public.eos_contract_runs where id <> rid order by started_at desc limit 1;
  if st = 'ok' then passed := passed + 1; else f := f || ' FAIL runner ok-status ' || coalesce(st,'null'); end if;

  -- N8: calendar coverage through 2031, recorded on runs
  select max(holiday) into d from public.eos_holidays where jurisdiction = 'US-federal';
  if d >= '2031-12-25' then passed := passed + 1; else f := f || ' FAIL N8 cov=' || d; end if;
  select calendar_coverage_end into d from public.eos_contract_runs where status = 'ok' order by started_at desc limit 1;
  if d >= '2031-12-25' then passed := passed + 1; else f := f || ' FAIL N8 run cov=' || coalesce(d::text,'null'); end if;

  -- N7: exactly one cron job
  select count(*) into n from cron.job where jobname = 'eos-contract-signals-nightly';
  if n = 1 then passed := passed + 1; else f := f || ' FAIL N7 jobs=' || n; end if;

  -- F6 nit: NULL lead day rejected
  begin
    insert into public.eos_contract_obligations(contract_id, type, title, lead_days) values (cid, 'renewal', 'T-null', '{30,null}');
    f := f || ' FAIL F6 null lead day allowed';
  exception when others then passed := passed + 1; end;

  -- F10 + privacy regression: Team user
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.sales set user_id = priv where user_id = team; f := f || ' FAIL F10 user_id writable';
  exception when others then passed := passed + 1; end;
  select count(*) into n from public.eos_contract_signals;
  select count(*) into n2 from public.eos_contracts;
  if n = 0 and n2 = 0 then passed := passed + 1; else f := f || ' FAIL team sees contracts ' || n || '/' || n2; end if;
  reset role;

  if f = '' then raise exception 'EOS_TESTS PASS % checks (rolled back)', passed;
  else raise exception 'EOS_TESTS FAIL (% passed):%', passed, f; end if;
end $$;
