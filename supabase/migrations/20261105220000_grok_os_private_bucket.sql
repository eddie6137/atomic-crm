-- Grok OS Web: private bucket readable only by signed-in Atomic users. Writes via service role (publish.mjs) only.
insert into storage.buckets (id, name, public) values ('grok-os', 'grok-os', false)
on conflict (id) do update set public = false;

create policy "grok_os_authenticated_read" on storage.objects
  for select to authenticated using (bucket_id = 'grok-os');
