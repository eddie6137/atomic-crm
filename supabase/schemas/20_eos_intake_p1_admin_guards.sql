-- Intake P1 admin guards: admin-only company attribution fields; fixture RPC limited to admin/service_role.
-- insert_fixture itself (guard + grants) is defined in 19_eos_intake_p1.sql.

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
