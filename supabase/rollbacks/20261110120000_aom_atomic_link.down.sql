-- Rollback for migrations/20261110120000_aom_atomic_link.sql (AOM link objects only).
-- Count snapshot first (never print row contents). Does not touch earlier EOS objects.
-- Synthetic projected commitments are NOT deleted; they stay as ordinary rows (archive them by hand).
begin;
drop function if exists public.eos_aom_link_apply(text, jsonb);
drop trigger if exists eos_commitments_zz_aom_guard on public.eos_commitments;
drop function if exists public.eos_commitments_aom_guard();
drop table if exists public.eos_aom_link_deliveries;
drop table if exists public.eos_action_source_map;
drop function if exists public.eos_action_source_map_guard();
drop table if exists public.eos_aom_client_map;
drop function if exists public.eos_aom_client_map_guard();
drop function if exists public.eos_aom_link_internal();
commit;
