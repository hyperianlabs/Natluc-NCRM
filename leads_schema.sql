-- ============================================================
-- Natluc Trading CRM — Leads table
-- Run this in Supabase SQL Editor (in addition to schema.sql)
-- ============================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  place_id text unique not null,
  name text,
  address text,
  phone text,
  website text,
  matched_category text,   -- which search term found this business
  search_location text,    -- which city/area it was found in
  status text default 'new', -- 'new' | 'contacted' | 'converted' | 'dismissed'
  found_at timestamptz default now(),
  last_seen timestamptz default now()
);

alter table leads enable row level security;

create policy "Authenticated staff can manage leads"
  on leads for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
