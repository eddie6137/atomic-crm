-- Rollback for migrations/20261110130000_aom_link_deep_link_check.sql (LOCAL-ONLY, not applied anywhere).
-- Drops only the strict deep_link_path CHECK; the original like '/%' / not like '//%' check stays.
-- Run by hand only on CTO direction. Not for prod qkbpucqbncnqajpyfxlu.
alter table public.eos_action_source_map
  drop constraint if exists eos_action_source_map_deep_link_path_strict;
