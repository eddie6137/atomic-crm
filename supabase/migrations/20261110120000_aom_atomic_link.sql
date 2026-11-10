-- AOM → Atomic action link (isolate, addendum Rev 0.2.1). Additive only; no earlier object is altered
-- except one extra BEFORE UPDATE guard trigger on eos_commitments. Kill switch is enforced in the
-- edge function BEFORE this RPC is reachable (ATOMIC_AOM_LINK_ENABLED, default OFF); nothing here
-- is called by the browser. Wire contract: see docs/AOM_LINK.md.

-- ---------- internal-writer check (deliberately NOT security definer: current_user is the caller's) ----------
-- True only inside eos_aom_link_apply (it sets the txn-local marker AND runs as the definer role).
-- Browser roles and service_role can never satisfy it, whatever they SET.
create or replace function public.eos_aom_link_internal()
returns boolean language sql stable set search_path = ''
as $$
  select coalesce(current_setting('eos.aom_link_rpc', true), '') = '1'
     and current_user not in ('authenticated', 'anon', 'service_role');
$$;
revoke all on function public.eos_aom_link_internal() from public, anon;
grant execute on function public.eos_aom_link_internal() to authenticated, service_role;

-- ---------- eos_aom_client_map: AOM client id <-> Atomic company (authoritative; admin-written only) ----------
create table public.eos_aom_client_map (
  aom_client_id uuid primary key,
  company_id bigint not null unique references public.companies(id),
  created_at timestamptz not null default now(),
  created_by bigint references public.sales(id)
);

-- is_admin() guard with NO postgres / supabase_admin / service_role bypass (MF4). The ingress RPC only reads.
create or replace function public.eos_aom_client_map_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'EOS: only admins can write the AOM client map';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, public.eos_current_sales_id()); end if;
  return new;
end $$;
revoke all on function public.eos_aom_client_map_guard() from public, anon, authenticated;
create trigger eos_aom_client_map_guard_trg
  before insert or update or delete on public.eos_aom_client_map
  for each row execute function public.eos_aom_client_map_guard();

-- ---------- eos_action_source_map: (namespace, source_key) -> commitment (written only by the ingress RPC) ----------
create table public.eos_action_source_map (
  id uuid primary key default gen_random_uuid(),
  namespace text not null check (namespace ~ '^[a-z][a-z0-9_-]{0,31}$'),
  source_key text not null,
  commitment_id uuid not null unique references public.eos_commitments(id),
  kind text not null check (kind in ('assignment', 'custom')),
  aom_client_id uuid not null,
  deep_link_path text not null check (deep_link_path like '/%' and deep_link_path not like '//%'),
  last_aom_revision text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eos_action_source_map_ns_key_unique unique (namespace, source_key),
  constraint eos_action_source_map_key_matches check (source_key = kind || ':' || commitment_id::text)
);
create index eos_action_source_map_client_idx on public.eos_action_source_map (aom_client_id);

create or replace function public.eos_action_source_map_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.eos_aom_link_internal() then
    raise exception 'EOS: action source map is written only by the AOM link ingress';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger eos_action_source_map_guard_trg
  before insert or update or delete on public.eos_action_source_map
  for each row execute function public.eos_action_source_map_guard();

-- ---------- delivery results: idempotent replay (a replay must never UPDATE the commitment) ----------
create table public.eos_aom_link_deliveries (
  delivery_id text primary key,
  commitment_id uuid,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- RLS / grants ----------
alter table public.eos_aom_client_map enable row level security;
alter table public.eos_action_source_map enable row level security;
alter table public.eos_aom_link_deliveries enable row level security;
revoke all on public.eos_aom_client_map, public.eos_action_source_map, public.eos_aom_link_deliveries from anon;
revoke truncate on public.eos_aom_client_map, public.eos_action_source_map, public.eos_aom_link_deliveries
  from authenticated, service_role;  -- TRUNCATE skips row triggers
revoke all on public.eos_aom_link_deliveries from authenticated, service_role;
revoke insert, update, delete on public.eos_action_source_map from authenticated, service_role;
grant select on public.eos_action_source_map to authenticated;
grant select, insert, update, delete on public.eos_aom_client_map to authenticated;
create policy eos_action_source_map_select on public.eos_action_source_map
  for select to authenticated using ((select public.eos_is_member()));
create policy eos_aom_client_map_select on public.eos_aom_client_map
  for select to authenticated using ((select public.eos_is_member()));
create policy eos_aom_client_map_admin_insert on public.eos_aom_client_map
  for insert to authenticated with check ((select public.is_admin()));
create policy eos_aom_client_map_admin_update on public.eos_aom_client_map
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy eos_aom_client_map_admin_delete on public.eos_aom_client_map
  for delete to authenticated using ((select public.is_admin()));

-- ---------- eos_commitments: AOM-originated rows are SoT-owned by the ingress RPC ----------
-- Named zz_ so it fires AFTER eos_before_write (which may back-fill company_id from a project).
create or replace function public.eos_commitments_aom_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.status, new.status_reason, new.company_id, new.needs_review, new.blocker, new.title)
       is distinct from (old.status, old.status_reason, old.company_id, old.needs_review, old.blocker, old.title)
     and exists (select 1 from public.eos_action_source_map m where m.commitment_id = old.id and m.namespace = 'aom')
     and not public.eos_aom_link_internal() then
    raise exception 'EOS: status, company and title of an AOM-originated commitment are owned by AOM';
  end if;
  return new;
end $$;
create trigger eos_commitments_zz_aom_guard
  before update on public.eos_commitments
  for each row execute function public.eos_commitments_aom_guard();

-- ---------- ingress RPC ----------
create or replace function public.eos_aom_link_apply(p_delivery_id text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := p_event ->> 'source_key';
  v_kind text := p_event ->> 'kind';
  v_cid uuid;
  v_client uuid;
  v_rev text := p_event ->> 'aom_revision';
  v_type text := p_event ->> 'event_type';
  v_aom_status text := p_event ->> 'aom_status';
  v_title text := p_event ->> 'title';
  v_path text := p_event ->> 'deep_link_path';
  v_prev jsonb;
  v_map public.eos_action_source_map;
  v_ex public.eos_commitments;
  v_company bigint;
  v_status text;
  v_reason text;
  v_holding boolean;
  v_archived timestamptz;
  v_res jsonb;
  v_ex_found boolean;
begin
  -- shape (the edge function validates too; this is the DB's own fail-closed copy)
  begin
    v_cid := (p_event ->> 'commitment_id')::uuid;
    v_client := (p_event ->> 'aom_client_id')::uuid;
  exception when others then
    return jsonb_build_object('result', 'conflict', 'reason', 'invalid_event');
  end;
  if p_delivery_id is null or p_event ->> 'namespace' is distinct from 'aom'
     or v_kind not in ('assignment', 'custom') or v_key is distinct from v_kind || ':' || v_cid::text
     or v_type not in ('upsert', 'archive') or coalesce(v_rev, '') = '' or coalesce(btrim(v_title), '') = ''
     or v_aom_status not in ('planned', 'in_progress', 'completed', 'skipped', 'cancelled')
     or v_path is null or v_path not like '/%' or v_path like '//%'
     or p_delivery_id is distinct from 'aom:' || v_key || ':' || v_type || ':' || v_rev then
    return jsonb_build_object('result', 'conflict', 'reason', 'invalid_event');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aom-link:' || v_key, 0));

  -- idempotent replay: return the original outcome, touch nothing (revision must not move)
  select d.result into v_prev from public.eos_aom_link_deliveries d where d.delivery_id = p_delivery_id;
  if found then
    return jsonb_build_object('result', 'replay', 'original_result', v_prev ->> 'result',
                              'commitment_id', v_prev ->> 'commitment_id');
  end if;

  select * into v_map from public.eos_action_source_map m where m.namespace = 'aom' and m.source_key = v_key;
  if found and v_map.commitment_id <> v_cid then
    return jsonb_build_object('result', 'conflict', 'reason', 'map_key_mismatch');
  end if;
  if not found and exists (select 1 from public.eos_action_source_map m where m.commitment_id = v_cid) then
    -- UUID is mapped under another namespace / source key
    if exists (select 1 from public.eos_action_source_map m where m.commitment_id = v_cid and m.namespace <> 'aom') then
      return jsonb_build_object('result', 'conflict', 'reason', 'uuid_non_aom');
    end if;
    return jsonb_build_object('result', 'conflict', 'reason', 'map_key_mismatch');
  end if;
  select * into v_ex from public.eos_commitments c where c.id = v_cid;
  v_ex_found := found;
  if v_ex_found and v_map.id is null then
    return jsonb_build_object('result', 'conflict', 'reason', 'uuid_without_map');
  end if;

  -- stale: an older revision than the last one applied for this source key
  if v_map.id is not null and v_rev < v_map.last_aom_revision then
    v_res := jsonb_build_object('result', 'stale', 'commitment_id', v_cid);
    insert into public.eos_aom_link_deliveries(delivery_id, commitment_id, result) values (p_delivery_id, v_cid, v_res);
    return v_res;
  end if;

  perform set_config('eos.aom_link_rpc', '1', true);

  -- company comes ONLY from the authoritative map
  select cm.company_id into v_company from public.eos_aom_client_map cm where cm.aom_client_id = v_client;
  v_status := case v_aom_status when 'planned' then 'open' when 'skipped' then 'cancelled' else v_aom_status end;
  v_reason := case when v_aom_status = 'skipped' then 'skipped' else null end;

  if v_company is null then
    -- unmapped: never guess. Holding row only; no delivery recorded so a later mapped retry re-evaluates.
    v_holding := v_ex_found and v_ex.needs_review and v_ex.status = 'ambiguous' and v_ex.company_id is null;
    if not v_ex_found then
      insert into public.eos_commitments(id, title, status, needs_review, company_id)
      values (v_cid, v_title, 'ambiguous', true, null);
      insert into public.eos_action_source_map(namespace, source_key, commitment_id, kind, aom_client_id, deep_link_path, last_aom_revision)
      values ('aom', v_key, v_cid, v_kind, v_client, v_path, v_rev);
    elsif v_holding then
      if v_ex.title is distinct from v_title then
        update public.eos_commitments set title = v_title where id = v_cid;
      end if;
      if v_map.last_aom_revision < v_rev or v_map.deep_link_path is distinct from v_path then
        update public.eos_action_source_map
           set last_aom_revision = greatest(last_aom_revision, v_rev), deep_link_path = v_path, updated_at = now()
         where id = v_map.id;
      end if;
    end if;
    perform set_config('eos.aom_link_rpc', '', true);
    return jsonb_build_object('result', 'unmapped', 'commitment_id', v_cid, 'holding', v_ex_found and v_holding or not v_ex_found);
  end if;

  v_archived := case when v_type = 'archive' then coalesce(v_ex.archived_at, now()) else v_ex.archived_at end;
  if not v_ex_found then
    insert into public.eos_commitments(id, title, status, status_reason, needs_review, company_id, archived_at)
    values (v_cid, v_title, v_status, v_reason, false, v_company, case when v_type = 'archive' then now() end);
    insert into public.eos_action_source_map(namespace, source_key, commitment_id, kind, aom_client_id, deep_link_path, last_aom_revision)
    values ('aom', v_key, v_cid, v_kind, v_client, v_path, v_rev);
    v_res := jsonb_build_object('result', 'created', 'commitment_id', v_cid);
  elsif (v_ex.title, v_ex.status, v_ex.status_reason, v_ex.company_id, v_ex.needs_review, v_ex.archived_at)
        is not distinct from (v_title, v_status, v_reason, v_company, false, v_archived) then
    update public.eos_action_source_map
       set last_aom_revision = greatest(last_aom_revision, v_rev), deep_link_path = v_path, aom_client_id = v_client, updated_at = now()
     where id = v_map.id;
    v_res := jsonb_build_object('result', 'unchanged', 'commitment_id', v_cid);
  else
    update public.eos_commitments
       set title = v_title, status = v_status, status_reason = v_reason, company_id = v_company,
           needs_review = false, archived_at = v_archived
     where id = v_cid;
    update public.eos_action_source_map
       set last_aom_revision = greatest(last_aom_revision, v_rev), deep_link_path = v_path, aom_client_id = v_client, updated_at = now()
     where id = v_map.id;
    v_res := jsonb_build_object('result', 'updated', 'commitment_id', v_cid);
  end if;
  insert into public.eos_aom_link_deliveries(delivery_id, commitment_id, result) values (p_delivery_id, v_cid, v_res);
  perform set_config('eos.aom_link_rpc', '', true);
  return v_res;
end $$;
revoke all on function public.eos_aom_link_apply(text, jsonb) from public, anon, authenticated;
grant execute on function public.eos_aom_link_apply(text, jsonb) to service_role;
