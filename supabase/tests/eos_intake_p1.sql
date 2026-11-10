-- Intake & Triage P1: SQL-level tests (fixture insert, fingerprint uniqueness, source CHECK incl. 'email',
-- RLS write denial, Needs client blocking, accept/reject/FYI, quick-add audit idempotency).
-- Self-rolling-back: always ends by raising. PASS = message starts with 'EOS_INTAKE_TESTS PASS'; any 'FAIL' = failure.
-- Run on STAGING only: psql "$STAGING_DB_URL" -f supabase/tests/eos_intake_p1.sql
-- Needs the synthetic users pat.demo@example.invalid (member) and eos-test@example.invalid (admin; fixture inserts
-- are admin/service_role only) and at least one company.
do $$
declare team uuid; sid bigint; comp bigint; i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; cm uuid; cm2 uuid; a uuid; b uuid;
  adm uuid; n int; st text; ok text; f text := ''; passed int := 0; today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  select user_id, id into team, sid from public.sales where email = 'pat.demo@example.invalid';
  select user_id into adm from public.sales where email = 'eos-test@example.invalid';
  select id into comp from public.companies order by id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- fixture insert is idempotent on fingerprint (same source_ref + normalized excerpt -> same id)
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  i1 := public.eos_intake_insert_fixture('t-1', 'Subj', 'x@client.test', 'Please send the deck', null, null, 'Send deck', sid, today + 3);
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  i2 := public.eos_intake_insert_fixture('t-1', 'Subj', 'x@client.test', '  please SEND the deck ', null);
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  select count(*) into n from public.eos_intake_items where source_ref = 't-1';
  if i1 = i2 and n = 1 then passed := passed + 1; else f := f || ' FAIL fixture-dedupe n=' || n; end if;
  select needs_client into st from public.eos_intake_items where id = i1;
  if st = 'true' or st = 't' then passed := passed + 1; else f := f || ' FAIL needs_client default for null company'; end if;

  -- browser cannot insert / update / delete ingest tables
  begin insert into public.eos_intake_items(source, source_ref, excerpt, fingerprint) values ('fixture','t-x','e','fp-x');
    f := f || ' FAIL browser insert allowed';
  exception when insufficient_privilege then passed := passed + 1; end;
  begin update public.eos_intake_items set triage_status = 'rejected' where id = i1; get diagnostics n = row_count;
    f := f || ' FAIL browser update allowed';
  exception when insufficient_privilege then passed := passed + 1; end;
  begin delete from public.eos_intake_items where id = i1; f := f || ' FAIL browser delete allowed';
  exception when insufficient_privilege then passed := passed + 1; end;

  -- proposals.source accepts 'email', still rejects unknown sources
  begin insert into public.eos_proposals(source, source_ref, excerpt, target_table, payload, extraction_version, fingerprint)
    values ('email', 't-p1', 'e', 'eos_commitments', '{}', 'v', 'fp-email-t1'); passed := passed + 1;
  exception when others then f := f || ' FAIL proposals email source: ' || sqlerrm; end;
  begin insert into public.eos_proposals(source, source_ref, excerpt, target_table, payload, extraction_version, fingerprint)
    values ('carrier-pigeon', 't-p2', 'e', 'eos_commitments', '{}', 'v', 'fp-bogus-t2'); f := f || ' FAIL bogus source allowed';
  exception when check_violation then passed := passed + 1; end;

  -- Needs client blocks Accept Action until an account is chosen
  begin perform public.eos_intake_accept_action(i1, '{}'); f := f || ' FAIL accept without account';
  exception when others then if sqlerrm like '%Needs client%' then passed := passed + 1; else f := f || ' FAIL needs-client msg: ' || sqlerrm; end if; end;
  -- owner and due date are required
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  i3 := public.eos_intake_insert_fixture('t-3', 'S3', null, 'no owner no due', comp);
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  begin perform public.eos_intake_accept_action(i3, '{"title":"T3"}'); f := f || ' FAIL accept without owner';
  exception when others then if sqlerrm like '%owner required%' then passed := passed + 1; else f := f || ' FAIL owner msg: ' || sqlerrm; end if; end;
  begin perform public.eos_intake_accept_action(i3, json_build_object('title','T3','owner_sales_id',sid)::jsonb); f := f || ' FAIL accept without due';
  exception when others then if sqlerrm like '%due date required%' then passed := passed + 1; else f := f || ' FAIL due msg: ' || sqlerrm; end if; end;

  -- Accept Action with edits: commitment + proposal linked, idempotent on retry
  cm := public.eos_intake_accept_action(i1, json_build_object('company_id', comp, 'title', 'Send deck v2')::jsonb);
  cm2 := public.eos_intake_accept_action(i1, '{}');
  select triage_status, (commitment_id = cm and proposal_id is not null and decided_by = sid and not needs_client)::text into st, ok
    from public.eos_intake_items where id = i1;
  select count(*) into n from public.eos_commitments where id = cm and title = 'Send deck v2' and company_id = comp and owner_sales_id = sid;
  if cm = cm2 and st = 'accepted' and ok = 'true' and n = 1 then passed := passed + 1; else f := f || ' FAIL accept action st=' || st; end if;

  -- Reject sets status + server-side decided_by; an accepted item cannot be rejected
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  i4 := public.eos_intake_insert_fixture('t-4', 'S4', null, 'noise', comp);
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  perform public.eos_intake_reject(i4);
  select triage_status into st from public.eos_intake_items where id = i4 and decided_by = sid and decided_at is not null;
  if st = 'rejected' then passed := passed + 1; else f := f || ' FAIL reject'; end if;
  begin perform public.eos_intake_reject(i1); f := f || ' FAIL reject accepted';
  exception when others then passed := passed + 1; end;

  -- Accept FYI writes eos_account_fyi once
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  i5 := public.eos_intake_insert_fixture('t-5', 'S5', null, 'FYI: they renewed', comp);
  perform set_config('request.jwt.claims', json_build_object('sub', team, 'role', 'authenticated')::text, true);
  a := public.eos_intake_accept_fyi(i5, '{}'); b := public.eos_intake_accept_fyi(i5, '{}');
  select count(*) into n from public.eos_account_fyi where intake_id = i5 and company_id = comp and created_by = sid;
  if a = b and n = 1 then passed := passed + 1; else f := f || ' FAIL fyi n=' || n; end if;

  -- Quick-add audit: one accepted audit row per commitment, idempotent
  insert into public.eos_commitments(company_id, title, owner_sales_id) values (comp, 'QA audit', sid) returning id into cm;
  a := public.eos_intake_audit_quick_add(cm); b := public.eos_intake_audit_quick_add(cm);
  select count(*) into n from public.eos_intake_items where source = 'quick_add' and commitment_id = cm and triage_status = 'accepted' and company_id = comp;
  if a = b and n = 1 then passed := passed + 1; else f := f || ' FAIL quick-add audit n=' || n; end if;

  reset role;
  raise exception '%', case when f = '' then 'EOS_INTAKE_TESTS PASS ' || passed else 'EOS_INTAKE_TESTS FAIL' || f end;
end $$;
