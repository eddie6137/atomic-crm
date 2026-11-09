-- Rollback for migrations/20261108230000_eos_commitment_comments.sql (v1d U1b).
-- Drops the comments table (and any comments in it), its trigger function and policies.
-- Not applied by the Supabase CLI (lives outside supabase/migrations). Run by hand only on CTO direction.
--
-- History row: connector apply_migration records its OWN version timestamp (≠ file prefix
-- 20261108230000). Staging is 20261109071310; prod will differ. Always delete by NAME so
-- this file is valid on both staging and prod. Never run `supabase db push` / `migration up`.
begin;
drop table if exists public.eos_commitment_comments;
drop function if exists public.eos_comment_before_insert();
delete from supabase_migrations.schema_migrations
  where name = 'eos_commitment_comments';
commit;
