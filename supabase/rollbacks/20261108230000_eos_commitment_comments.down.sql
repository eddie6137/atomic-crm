-- Rollback for migrations/20261108230000_eos_commitment_comments.sql (v1d U1b).
-- Drops the comments table (and any staging test comments in it), its trigger function and policies.
-- Not applied by the Supabase CLI (lives outside supabase/migrations). Run by hand only on CTO direction.
drop table if exists public.eos_commitment_comments;
drop function if exists public.eos_comment_before_insert();
