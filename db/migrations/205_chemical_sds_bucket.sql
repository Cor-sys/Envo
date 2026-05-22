-- Storage bucket for Safety Data Sheets (SDS / MSDS PDFs).
-- Public read so <a href> works without signed URLs; authenticated write
-- so any staffer can attach an SDS PDF after downloading from the
-- manufacturer.

insert into storage.buckets (id, name, public)
values ('chemical-sds', 'chemical-sds', true)
on conflict (id) do nothing;

drop policy if exists "chemical_sds_public_read"  on storage.objects;
drop policy if exists "chemical_sds_auth_insert"  on storage.objects;
drop policy if exists "chemical_sds_auth_update"  on storage.objects;
drop policy if exists "chemical_sds_auth_delete"  on storage.objects;

create policy "chemical_sds_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'chemical-sds');

create policy "chemical_sds_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chemical-sds');

create policy "chemical_sds_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'chemical-sds')
  with check (bucket_id = 'chemical-sds');

create policy "chemical_sds_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chemical-sds');
