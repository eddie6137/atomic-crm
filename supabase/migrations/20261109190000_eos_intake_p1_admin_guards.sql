-- Intake P1 admin guards: admin-only company attribution fields; fixture RPC limited to admin/service_role.
begin;

-- ---------- admin-only company attribution fields (domains, aliases, plus_slug) ----------
-- Members and admins share the `authenticated` role, so column GRANTs cannot separate them: use a trigger.
create or replace function public.eos_companies_attribution_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin') or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.domains is distinct from old.domains or new.aliases is distinct from old.aliases
       or new.plus_slug is distinct from old.plus_slug then
      if not public.is_admin() then
        raise exception 'EOS: only admins can edit company attribution fields (domains, aliases, plus_slug)';
      end if;
    end if;
  elsif new.domains is not null or new.aliases is not null or new.plus_slug is not null then
    if not public.is_admin() then
      raise exception 'EOS: only admins can edit company attribution fields (domains, aliases, plus_slug)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists eos_companies_attribution_admin_only on public.companies;
create trigger eos_companies_attribution_admin_only
  before insert or update on public.companies
  for each row execute function public.eos_companies_attribution_guard();

create or replace function public.eos_intake_insert_fixture(
  p_source_ref text, p_subject text, p_from_addr text, p_excerpt text,
  p_company_id bigint default null, p_needs_client boolean default null,
  p_suggested_title text default null, p_suggested_owner_sales_id bigint default null,
  p_suggested_due_date date default null, p_triage_label text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare sid bigint; fp text; v_id uuid;
begin
  -- Guard: service_role, or a direct superuser session with no JWT role (migrations / psql), may insert
  -- (created_by stays null). NOTE: current_user is always the definer (postgres) inside SECURITY DEFINER,
  -- so the superuser path checks session_user + an empty JWT role; a PostgREST caller has session_user
  -- 'authenticator' and always carries a JWT role.
  if coalesce(auth.role(), '') = 'service_role'
     or (coalesce(auth.role(), '') = '' and session_user in ('postgres', 'supabase_admin')) then
    sid := public.eos_current_sales_id();
  else
    sid := public.eos_intake_require_member();
    if not public.is_admin() then raise exception 'EOS: fixture insert is admin or service_role only'; end if;
  end if;
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

-- Members and admins share the Postgres role `authenticated`, so EXECUTE cannot be revoked from
-- `authenticated` without also locking out admins (the Inbox stub button uses an admin JWT).
-- Enforcement is the guard above; EXECUTE is revoked from public/anon and granted to service_role + authenticated.
revoke all on function public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text) from public, anon;
grant execute on function public.eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text) to service_role, authenticated;
commit;
