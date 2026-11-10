-- Intake P1 admin guards: attribution columns on companies are admin-only; fixture RPC is admin/service_role only.
-- Self-rolling-back: always ends by raising. PASS = message starts with 'EOS_INTAKE_ADMIN_TESTS PASS'; any 'FAIL' = failure.
-- Run on STAGING only: psql "$STAGING_DB_URL" -f supabase/tests/eos_intake_p1_admin.sql
-- Needs pat.demo@example.invalid (member, not admin), eos-test@example.invalid (admin) and at least one company.
do $$
declare pat uuid; adm uuid; comp bigint; n int; passed int := 0; f text := '';
  slug text := 'synth-intake-p1-test-slug';
begin
  select user_id into pat from public.sales where email = 'pat.demo@example.invalid' and not administrator;
  select user_id into adm from public.sales where email = 'eos-test@example.invalid' and administrator;
  select id into comp from public.companies order by id limit 1;
  if pat is null or adm is null or comp is null then
    raise exception 'EOS_INTAKE_ADMIN_TESTS FAIL missing fixtures (member, admin or company)';
  end if;

  -- member
  perform set_config('request.jwt.claims', json_build_object('sub', pat, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin update public.companies set domains = array['member-should-fail.example'] where id = comp;
    f := f || ' FAIL member domains update allowed';
  exception when others then
    if sqlerrm like '%only admins can edit company attribution%' then passed := passed + 1;
    else f := f || ' FAIL member domains msg: ' || sqlerrm; end if; end;
  begin update public.companies set plus_slug = slug where id = comp;
    f := f || ' FAIL member plus_slug update allowed';
  exception when others then
    if sqlerrm like '%only admins can edit company attribution%' then passed := passed + 1;
    else f := f || ' FAIL member plus_slug msg: ' || sqlerrm; end if; end;
  begin update public.companies set name = name where id = comp; get diagnostics n = row_count;
    if n = 1 then passed := passed + 1; else f := f || ' FAIL member name-only update affected ' || n; end if;
  exception when others then f := f || ' FAIL member name-only update: ' || sqlerrm; end;
  begin insert into public.companies(name, aliases) values ('synth-intake-p1-member', array['x']);
    f := f || ' FAIL member insert with aliases allowed';
  exception when others then
    if sqlerrm like '%only admins can edit company attribution%' then passed := passed + 1;
    else f := f || ' FAIL member insert msg: ' || sqlerrm; end if; end;
  begin perform public.eos_intake_insert_fixture('admin-t-pat', 's', null, 'member attempt', comp);
    f := f || ' FAIL member fixture insert allowed';
  exception when others then
    if sqlerrm like '%admin or service_role only%' then passed := passed + 1;
    else f := f || ' FAIL member fixture msg: ' || sqlerrm; end if; end;

  -- admin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin update public.companies
      set domains = array['synth-intake-p1.example'], aliases = array['Synth Intake P1'], plus_slug = slug
      where id = comp;
    select count(*) into n from public.companies
      where id = comp and plus_slug = slug and domains = array['synth-intake-p1.example'];
    if n = 1 then passed := passed + 1; else f := f || ' FAIL admin attribution update not applied'; end if;
  exception when others then f := f || ' FAIL admin attribution update: ' || sqlerrm; end;
  begin perform public.eos_intake_insert_fixture('admin-t-adm', 's', null, 'admin insert', comp);
    select count(*) into n from public.eos_intake_items where source_ref = 'admin-t-adm';
    if n = 1 then passed := passed + 1; else f := f || ' FAIL admin fixture not inserted'; end if;
  exception when others then f := f || ' FAIL admin fixture insert: ' || sqlerrm; end;

  reset role;
  raise exception '%', case when f = '' then 'EOS_INTAKE_ADMIN_TESTS PASS ' || passed else 'EOS_INTAKE_ADMIN_TESTS FAIL' || f end;
end $$;
