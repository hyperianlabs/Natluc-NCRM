-- Track mime type so the send-documents function can tell videos
-- (linked, never attached) apart from small files (attached directly).
alter table documents add column if not exists mime_type text;

-- Raise the per-file limit on the documents bucket so the ~150MB
-- website walkthrough video can be uploaded (default is 50MB).
update storage.buckets set file_size_limit = 314572800 -- 300MB
where id = 'documents';
