-- Intake & Triage P1 (declarative copy of migrations/20261109180000_eos_intake_p1.sql;
-- companies columns live in 01_tables.sql, proposals source check in 10_eos_v1b.sql).
-- ---------- eos_intake_items (spec §3.1) ----------
create table public.eos_intake_items (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('email','slack','fireflies','quick_add','fixture')),
  source_ref text not null check (char_length(btrim(source_ref)) > 0),
  source_url text,
  subject text,
  from_addr text,
  excerpt text not null check (char_length(btrim(excerpt)) between 1 and 8000),
  raw_storage_path text,
  payload jsonb not null default '{}'::jsonb,
  fingerprint text not null unique,
  company_id bigint references public.companies(id),
  needs_client boolean not null default false,
  attribution_step text check (attribution_step in ('a','b','c','d','e')),
  attribution_evidence jsonb,
  suggested_owner_sales_id bigint references public.sales(id),
  suggested_due_date date,
  suggested_title text,
  triage_label text check (triage_label in ('action','fyi','noise')),
  triage_status text not null default 'raw'
    check (triage_status in ('raw','triaged','accepted','rejected','merged','archived')),
  triage_confidence numeric check (triage_confidence between 0 and 1),
  extraction_version text,
  merge_of uuid references public.eos_intake_items(id),
  proposal_id uuid references public.eos_proposals(id),
  commitment_id uuid references public.eos_commitments(id),
  decided_by bigint references public.sales(id),
  decided_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references public.sales(id),
  -- a commitment link exists only on an accepted item
  constraint eos_intake_items_commitment_only_accepted
    check (commitment_id is null or triage_status = 'accepted')
);
create index eos_intake_items_status_idx on public.eos_intake_items (triage_status, created_at desc);
create index eos_intake_items_company_idx on public.eos_intake_items (company_id);
create index eos_intake_items_open_idx on public.eos_intake_items (created_at desc) where archived_at is null;

-- ---------- eos_account_fyi (spec §3.3) ----------
create table public.eos_account_fyi (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  intake_id uuid not null unique references public.eos_intake_items(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  source_url text,
  created_by bigint references public.sales(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index eos_account_fyi_company_idx on public.eos_account_fyi (company_id, created_at desc);

-- ---------- eos_slack_channel_map (spec §2.5 step b; schema only, written by P4) ----------
create table public.eos_slack_channel_map (
  channel_id text primary key check (char_length(btrim(channel_id)) > 0),
  company_id bigint not null references public.companies(id),
  created_by bigint references public.sales(id),
  created_at timestamptz not null default now()
);

-- ---------- RLS: members read; no browser writes; no hard delete ----------
do $$ declare t text; begin
  foreach t in array array['eos_intake_items','eos_account_fyi','eos_slack_channel_map'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using ((select public.eos_is_member()))', t);
  end loop;
end $$;

-- ---------- internal helper: common caller check ----------
create or replace function public.eos_intake_require_member()
returns bigint language plpgsql stable security definer set search_path = ''
as $$
declare sid bigint;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'EOS: authenticated caller required';
  end if;
  if not public.eos_is_member() then raise exception 'EOS: not a member'; end if;
  sid := public.eos_current_sales_id();
  if sid is null then raise exception 'EOS: no sales profile'; end if;
  return sid;
end $$;
revoke all on function public.eos_intake_require_member() from public, anon, authenticated;

-- ---------- fixture helper (proofs / tests): source is forced to 'fixture' ----------
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

-- ---------- Accept Action: owner + account + due_date required; reuses eos_confirm_proposal ----------
create or replace function public.eos_intake_accept_action(p_id uuid, p_fields jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare sid bigint := public.eos_intake_require_member();
  it public.eos_intake_items; f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_title text; v_company bigint; v_owner bigint; v_due date; v_prop uuid; v_commit uuid;
begin
  select * into it from public.eos_intake_items where id = p_id for update;
  if not found then raise exception 'EOS: intake item not found'; end if;
  if it.triage_status = 'accepted' and it.commitment_id is not null then return it.commitment_id; end if;  -- idempotent
  if it.triage_status not in ('raw','triaged') or it.archived_at is not null then
    raise exception 'EOS: intake item is not open';
  end if;
  if it.source not in ('email','slack','fireflies','fixture') then raise exception 'EOS: source cannot be accepted'; end if;
  v_title := coalesce(nullif(btrim(f->>'title'), ''), nullif(btrim(it.suggested_title), ''), nullif(btrim(it.subject), ''));
  v_company := coalesce(nullif(f->>'company_id', '')::bigint, it.company_id);
  v_owner := coalesce(nullif(f->>'owner_sales_id', '')::bigint, it.suggested_owner_sales_id);
  v_due := coalesce(nullif(f->>'due_date', '')::date, it.suggested_due_date);
  if v_title is null then raise exception 'EOS: title required'; end if;
  if v_company is null then
    raise exception 'EOS: %', case when it.needs_client then 'Needs client: choose an account before accepting' else 'account required' end;
  end if;
  if v_owner is null then raise exception 'EOS: owner required'; end if;
  if v_due is null then raise exception 'EOS: due date required'; end if;
  if not exists (select 1 from public.companies c where c.id = v_company) then raise exception 'EOS: unknown account'; end if;
  if not exists (select 1 from public.sales s where s.id = v_owner and s.disabled = false) then raise exception 'EOS: unknown owner'; end if;

  insert into public.eos_proposals(source, source_ref, source_url, excerpt, target_table, payload, confidence,
      extraction_version, fingerprint)
  values (case when it.source = 'email' then 'email' else it.source end, it.id::text, it.source_url,
      left(it.excerpt, 8000), 'eos_commitments',
      jsonb_build_object('title', v_title, 'company_id', v_company, 'owner_sales_id', v_owner,
        'due_date', v_due, 'is_verbatim', false, 'intake_id', it.id),
      it.triage_confidence, coalesce(it.extraction_version, 'intake-p1'), 'intake:' || it.id::text)
  returning id into v_prop;

  v_commit := public.eos_confirm_proposal(v_prop,
    jsonb_build_object('title', v_title, 'company_id', v_company, 'owner_sales_id', v_owner, 'due_date', v_due));

  update public.eos_intake_items
     set triage_status = 'accepted', triage_label = 'action', company_id = v_company, needs_client = false,
         proposal_id = v_prop, commitment_id = v_commit, decided_by = sid, decided_at = now(), updated_at = now()
   where id = p_id;
  return v_commit;
end $$;

-- ---------- Accept FYI: account + body (1-2000) -> eos_account_fyi ----------
create or replace function public.eos_intake_accept_fyi(p_id uuid, p_fields jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare sid bigint := public.eos_intake_require_member();
  it public.eos_intake_items; f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_company bigint; v_body text; v_fyi uuid;
begin
  select * into it from public.eos_intake_items where id = p_id for update;
  if not found then raise exception 'EOS: intake item not found'; end if;
  if it.triage_status = 'accepted' then
    select y.id into v_fyi from public.eos_account_fyi y where y.intake_id = p_id;
    if v_fyi is not null then return v_fyi; end if;  -- idempotent
    raise exception 'EOS: intake item already accepted as an action';
  end if;
  if it.triage_status not in ('raw','triaged') or it.archived_at is not null then
    raise exception 'EOS: intake item is not open';
  end if;
  if it.source = 'quick_add' then raise exception 'EOS: source cannot be accepted'; end if;
  v_company := coalesce(nullif(f->>'company_id', '')::bigint, it.company_id);
  v_body := coalesce(nullif(btrim(f->>'body'), ''), left(btrim(it.excerpt), 2000));
  if v_company is null then
    raise exception 'EOS: %', case when it.needs_client then 'Needs client: choose an account before accepting' else 'account required' end;
  end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'EOS: FYI body must be 1-2000 characters'; end if;
  if not exists (select 1 from public.companies c where c.id = v_company) then raise exception 'EOS: unknown account'; end if;
  insert into public.eos_account_fyi(company_id, intake_id, body, source_url, created_by)
  values (v_company, p_id, v_body, it.source_url, sid)
  returning id into v_fyi;
  update public.eos_intake_items
     set triage_status = 'accepted', triage_label = 'fyi', company_id = v_company, needs_client = false,
         decided_by = sid, decided_at = now(), updated_at = now()
   where id = p_id;
  return v_fyi;
end $$;

-- ---------- Reject ----------
create or replace function public.eos_intake_reject(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare sid bigint := public.eos_intake_require_member(); it public.eos_intake_items;
begin
  select * into it from public.eos_intake_items where id = p_id for update;
  if not found then raise exception 'EOS: intake item not found'; end if;
  if it.triage_status = 'rejected' then return; end if;  -- idempotent
  if it.triage_status not in ('raw','triaged') or it.archived_at is not null then
    raise exception 'EOS: intake item is not open';
  end if;
  update public.eos_intake_items
     set triage_status = 'rejected', decided_by = sid, decided_at = now(), updated_at = now()
   where id = p_id;
end $$;

-- ---------- U4 quick-add audit row (audit-only; spec §2.4, Q5 = yes) ----------
create or replace function public.eos_intake_audit_quick_add(p_commitment_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare sid bigint := public.eos_intake_require_member(); c public.eos_commitments; fp text; v_id uuid;
begin
  select * into c from public.eos_commitments where id = p_commitment_id;
  if not found then raise exception 'EOS: commitment not found'; end if;
  -- only the creator audits their own quick-add
  if c.created_by is distinct from sid then raise exception 'EOS: not the creator of this commitment'; end if;
  fp := encode(sha256(convert_to('quick_add|' || p_commitment_id::text, 'UTF8')), 'hex');
  insert into public.eos_intake_items(source, source_ref, subject, excerpt, fingerprint, company_id, needs_client,
      suggested_title, suggested_owner_sales_id, suggested_due_date, triage_label, triage_status,
      commitment_id, decided_by, decided_at, created_by)
  values ('quick_add', p_commitment_id::text, left(c.title, 500), left(c.title, 8000), fp, c.company_id, false,
      c.title, c.owner_sales_id, c.due_date, 'action', 'accepted', p_commitment_id, sid, now(), sid)
  on conflict (fingerprint) do nothing
  returning id into v_id;
  if v_id is null then select i.id into v_id from public.eos_intake_items i where i.fingerprint = fp; end if;
  return v_id;
end $$;

do $$ declare r text; begin
  foreach r in array array[
    'eos_intake_insert_fixture(text,text,text,text,bigint,boolean,text,bigint,date,text)',
    'eos_intake_accept_action(uuid,jsonb)', 'eos_intake_accept_fyi(uuid,jsonb)',
    'eos_intake_reject(uuid)', 'eos_intake_audit_quick_add(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', r);
    execute format('grant execute on function public.%s to authenticated', r);
  end loop;
end $$;
