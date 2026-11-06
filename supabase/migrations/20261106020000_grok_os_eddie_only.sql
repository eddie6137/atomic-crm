-- Grok OS standalone: Eddie-only read on private bucket `grok-os`.
-- PENDING prod apply until HoD confirms EOS promotion verified.
-- Eddie uid: 5ac9214c-7835-4748-9543-da9c37297fc4 (eddie@amplifyecomm.com)

drop policy if exists "grok_os_authenticated_read" on storage.objects;

create policy "grok_os_eddie_only_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'grok-os'
    and auth.uid() = '5ac9214c-7835-4748-9543-da9c37297fc4'::uuid
  );

-- Rollback:
-- drop policy if exists "grok_os_eddie_only_read" on storage.objects;
-- create policy "grok_os_authenticated_read" on storage.objects
--   for select to authenticated using (bucket_id = 'grok-os');
