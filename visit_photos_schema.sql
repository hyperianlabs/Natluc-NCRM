-- ============================================================
-- Natluc Trading CRM — Photos on logged visits
--
-- Adds a photo_urls array to `interactions` and a public storage
-- bucket to hold the images. Uploads are restricted to logged-in
-- staff; viewing the photos (via their URL, which is unguessable)
-- is public so <img> tags work without extra auth plumbing.
--
-- Run this in Supabase SQL Editor (already applied directly to
-- the live project — kept here so it's reproducible / documented
-- alongside the other schema scripts in this repo).
-- ============================================================

alter table interactions add column if not exists photo_urls text[] default '{}';

insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', true)
on conflict (id) do nothing;

create policy "Authenticated staff can upload visit photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'visit-photos');

create policy "Authenticated staff can delete visit photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'visit-photos');

create policy "Anyone with the link can view visit photos"
  on storage.objects for select
  to public
  using (bucket_id = 'visit-photos');
