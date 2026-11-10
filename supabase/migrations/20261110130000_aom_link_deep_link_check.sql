-- ============================================================================================
-- LOCAL-ONLY. NOT APPLIED ANYWHERE. For the NEXT APPROVED STAGING WINDOW.
-- DO NOT APPLY in this isolate. NOT for prod project qkbpucqbncnqajpyfxlu.
-- (Do not run supabase db push / migrate. 20261110120000_aom_atomic_link.sql is already on staging
--  and is deliberately not amended; this is a new forward migration.)
-- ============================================================================================
-- Tightens eos_action_source_map.deep_link_path to match the shared helper
-- (supabase/functions/_shared/deepLink.ts): starts with '/', not '//', not '/\', length <= 2048,
-- no C0/DEL control characters, no leading/trailing whitespace. Rollback:
-- supabase/rollbacks/20261110130000_aom_link_deep_link_check.down.sql
-- Fails loudly if existing rows violate the rule (no NOT VALID, no silent trim).
alter table public.eos_action_source_map
  add constraint eos_action_source_map_deep_link_path_strict check (
    deep_link_path like '/%'
    and deep_link_path not like '//%'
    and left(deep_link_path, 2) <> ('/' || chr(92))
    and length(deep_link_path) <= 2048
    and deep_link_path !~ '[\u0001-\u001f\u007f]'
    and deep_link_path !~ '^\s|\s$'
  );
