-- Storage bucket for item photos (BRIEF §6: items.image_path).
-- Public read so the <img src> URLs work without signed URLs (no per-request
-- cost on free tier). Writes require an authenticated session.

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- Reset the per-bucket policies in case this migration is re-run.
drop policy if exists "item_photos_public_read"  on storage.objects;
drop policy if exists "item_photos_auth_insert"  on storage.objects;
drop policy if exists "item_photos_auth_update"  on storage.objects;
drop policy if exists "item_photos_auth_delete"  on storage.objects;

create policy "item_photos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'item-photos');

create policy "item_photos_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos');

create policy "item_photos_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'item-photos')
  with check (bucket_id = 'item-photos');

create policy "item_photos_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-photos');
