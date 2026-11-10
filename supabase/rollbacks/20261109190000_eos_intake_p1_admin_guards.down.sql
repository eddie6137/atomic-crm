-- Rollback for migrations/20261109190000_eos_intake_p1_admin_guards.sql.
-- Drops the attribution guard trigger/function and restores the P1 member-callable fixture RPC.
-- Does NOT drop P1 tables or columns. Run by hand only on CTO direction.
begin;
drop trigger if exists eos_companies_attribution_admin_only on public.companies;
drop function if exists public.eos_companies_attribution_guard();
create or replace function public.eos_intake_insert_fixture(
  p_source_ref text, p_subject text, p_from_addr text, p_excerpt text,
  p_company_id bigint default null, p_needs_client boolean default null,
  p_suggested_title text default null, p_suggested_owner_sales_id bigint default null,
  p_suggested_due_date date default null, p_triage_label text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare sid bigint := public.eos_intake_require_member(); fp text; v_id uuid;
begin
  if coalesce(btrim(p_source_ref), '') = '' then raise exception 'EOS: source_ref required'; end if;
  fp := encode(sha256(convert_to('fixture|' || p_source_ref || '|' || lower(btrim(coalesce(p_excerpt, ''))), 'UTF8')), 'hex');
  insert into public.eos_intake_items(source, source_ref, subject, from_addr, excerpt, fingerprint, company_id,
      needs_client, suggested_title, suggested_owner_sales_id, suggested_due_date, triage_label, triage_status,
      extraction_version, created_by)
  values ('fixture', p_source_ref, p_subject, p_from_addr, p_excerpt, fp, p_company_id,
      coalesce(p_needs_client, p_company_id is null), p_suggested_title, p_suggested_owner_sales_id,
      p_suggested_due_date, p_triage_label, case when p_triage_label is null then 'raw' else 'triaged' end,
      'fixture-v1', sid)
  on conflict (fingerprint) do nothing
  returning id into v_id;
  if v_id is null then select i.id into v_id from public.eos_intake_items i where i.fingerprint = fp; end if;
  return v_id;
end $$;

revoke all on function public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text) from public, anon;
grant execute on function public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text) to authenticated;
commit;
