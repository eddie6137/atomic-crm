-- Company relationship backfill (DATA ONLY; run AFTER migration 20261105230000_company_relationship.sql).
-- Values per Eddie via CTO, 2026-11-05 2:19 PM PT. Exact name match, UPDATE only (never inserts),
-- idempotent (only touches rows whose value differs). Returns per-value counts + unmatched names.
-- Prod: run only with CTO approval. Dry run = the read-only SELECT at the bottom.
with wanted(name, relationship) as (values
  ('G2 Marketing', 'client'), ('Timecap Labs', 'client'),
  ('Ascensia', 'prospect'), ('INVAFARM', 'prospect'), ('Nature''s Way', 'prospect'),
  ('Beyond Nature', 'lead'), ('Prospin', 'lead'), ('Trilogy Products', 'lead')
), upd as (
  update public.companies c set relationship = w.relationship
    from wanted w
   where c.name = w.name and c.relationship is distinct from w.relationship
  returning c.id
)
select 'updated_now' as kind, null::text as value, (select count(*) from upd)::bigint as n
union all
select 'matched_per_value', w.relationship, count(c.id) from wanted w left join public.companies c on c.name = w.name group by w.relationship
union all
select 'unmatched', w.name, 0 from wanted w where not exists (select 1 from public.companies c where c.name = w.name)
union all
select 'duplicate_name', w.name, count(*) from wanted w join public.companies c on c.name = w.name group by w.name having count(*) > 1;

-- READ-ONLY DRY RUN (prod-safe):
-- with wanted(name) as (values ('G2 Marketing'),('Timecap Labs'),('Ascensia'),('INVAFARM'),('Nature''s Way'),
--   ('Beyond Nature'),('Prospin'),('Trilogy Products'))
-- select w.name, count(c.id) as matches from wanted w left join public.companies c on c.name = w.name group by w.name order by w.name;
