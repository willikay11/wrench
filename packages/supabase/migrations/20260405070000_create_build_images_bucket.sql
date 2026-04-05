insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'build-images',
  'build-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view build images" on storage.objects;
create policy "Public can view build images"
on storage.objects
for select
using (bucket_id = 'build-images');

drop policy if exists "Authenticated users can upload build images" on storage.objects;
create policy "Authenticated users can upload build images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'build-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Authenticated users can update their build images" on storage.objects;
create policy "Authenticated users can update their build images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'build-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'build-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Authenticated users can delete their build images" on storage.objects;
create policy "Authenticated users can delete their build images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'build-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
