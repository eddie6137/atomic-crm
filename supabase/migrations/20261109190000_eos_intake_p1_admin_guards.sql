-- Intake P1 admin guards: admin-only company attribution fields; fixture RPC limited to admin/service_role.
begin;

-- ---------- admin-only company attribution fields (domains, aliases, plus_slug) ----------
-- Admin-only demo path (Inbox stub button). SECURITY DEFINER owned by postgres, so it may call
-- insert_fixture even though `authenticated` has no EXECUTE on it.
create or replace function public.eos_intake_insert_fixture_admin(
  p_source_ref text, p_subject text, p_from_addr text, p_excerpt text,
  p_company_id bigint default null, p_needs_client boolean default null,
  p_suggested_title text default null, p_suggested_owner_sales_id bigint default null,
  p_suggested_due_date date default null, p_triage_label text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  perform public.eos_intake_require_member();
  if not public.is_admin() then raise exception 'EOS: fixture insert is admin or service_role only'; end if;
  return public.eos_intake_insert_fixture(p_source_ref, p_subject, p_from_addr, p_excerpt, p_company_id,
    p_needs_client, p_suggested_title, p_suggested_owner_sales_id, p_suggested_due_date, p_triage_label);
end $$;

revoke all on function public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text) from public, anon, authenticated;
grant execute on function public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text) to service_role;
revoke all on function public.eos_intake_insert_fixture_admin(text,text,text,text,bigint,boolean,text,bigint,date,text) from public, anon;
grant execute on function public.eos_intake_insert_fixture_admin(text,text,text,text,bigint,boolean,text,bigint,date,text) to authenticated, service_role;
commit;
