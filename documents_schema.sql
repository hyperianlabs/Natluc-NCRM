-- ============================================================
-- Natluc Trading CRM — Shared document library + email history
--
-- Lets staff upload company documents once (price lists,
-- brochures, T&Cs, catalogues) and then tick which ones to email
-- to any customer from the customer's detail view. Reuses the
-- RESEND_API_KEY / RESEND_FROM_EMAIL secrets already set up for
-- task-assignment emails (see TASK_EMAIL_SETUP.md) — no new
-- secrets needed.
--
-- Run this in Supabase SQL Editor (in addition to the earlier
-- schema.sql, leads_schema.sql, staff_contacts_tasks_schema.sql).
-- ============================================================

-- ------------------------------------------------------------
-- Document library — one row per uploaded file.
-- ------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  file_path text not null,   -- path inside the 'documents' storage bucket
  file_url text not null,    -- public URL, cached at upload time
  file_name text not null,   -- original filename, used for the emailed attachment
  file_size bigint,
  uploaded_by text,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "Authenticated staff can manage documents"
  on documents for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Storage bucket for the actual files. Public read (same pattern
-- as visit-photos) so Resend can fetch attachments by URL
-- server-side; uploads/deletes restricted to logged-in staff.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "Authenticated staff can upload documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "Authenticated staff can delete documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');

create policy "Anyone with the link can view documents"
  on storage.objects for select
  to public
  using (bucket_id = 'documents');

-- ------------------------------------------------------------
-- Send history — audit trail of what was emailed to whom, so a
-- customer's detail view can show past document sends the same
-- way it shows follow-up history. Written by the send-documents
-- edge function after a successful Resend call.
-- ------------------------------------------------------------
create table if not exists document_sends (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  to_email text not null,
  document_names text[] not null default '{}',
  subject text,
  sent_by text,
  created_at timestamptz default now()
);

alter table document_sends enable row level security;

create policy "Authenticated staff can manage document sends"
  on document_sends for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
