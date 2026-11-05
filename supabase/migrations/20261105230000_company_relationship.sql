-- Company relationship (Client / Prospect / Lead / Partner / Past client).
-- Values are configurable in Settings (like companySectors / dealStages), so this is free text,
-- not a DB enum. Schema only: NO values are set; existing rows stay NULL.
-- Data backfill lives separately in supabase/scripts/2026-11-05-company-relationship-backfill.sql.
alter table public.companies add column if not exists relationship text;
create index if not exists companies_relationship_idx on public.companies (relationship);

create or replace view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    count(distinct d.id) as nb_deals,
    count(distinct co.id) as nb_contacts,
    c.relationship
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;
