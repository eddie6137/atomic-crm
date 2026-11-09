-- Rollback for migrations/20261108230000_eos_commitment_comments.sql (v1d U1b).
-- Drops the comments table (and any staging test comments in it), its trigger function and policies.
-- Not applied by the Supabase CLI (lives outside supabase/migrations). Run by hand only on CTO direction.
--
-- Migration history note (CE nit 4, 2026-11-08):
-- Staging oqtshkqtjtqbhnfhvkpd was applied via Supabase connector apply_migration, which
-- records its OWN version timestamp — NOT the filename prefix 20261108230000.
-- Confirmed via list_migrations 2026-11-08 ~11:50 PM PT:
--   version = 20261109071310, name = eos_commitment_comments
-- After dropping the objects, also delete that history row so a later re-apply / db push
-- does not see a phantom applied migration. Do NOT run this file against prod unless
-- the prod apply recorded a matching row (check list_migrations first; prod may get a
-- different connector timestamp).
drop table if exists public.eos_commitment_comments;
drop function if exists public.eos_comment_before_insert();
-- Staging history row recorded by apply_migration (connector timestamp, not file prefix):
delete from supabase_migrations.schema_migrations
  where version = '20261109071310' and name = 'eos_commitment_comments';
