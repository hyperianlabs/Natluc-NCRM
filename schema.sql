-- ============================================================
-- Natluc Trading CRM — Supabase database schema
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste all -> Run)
-- ============================================================

-- Customers table
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  position text,
  contact_number text,
  email text,
  spending_potential text,
  current_supplier text,
  date_added date,
  captured_by text,
  created_at timestamptz default now()
);

-- Follow-up / interaction log
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  date date not null,
  type text not null, -- 'physical' | 'email' | 'call' | 'quote'
  staff text,
  notes text,
  next_follow_up date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Row Level Security: only logged-in users (your 3 staff) can
-- read or write anything. There is no public access at all.
-- ------------------------------------------------------------
alter table customers enable row level security;
alter table interactions enable row level security;

create policy "Authenticated staff can manage customers"
  on customers for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated staff can manage interactions"
  on interactions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- IMPORTANT: after running this, go to
-- Authentication -> Providers -> Email and turn OFF "Allow new
-- users to sign up". Then create your 3 staff logins manually
-- under Authentication -> Users -> Add user. This keeps the
-- login gate closed to only the people you personally add.
-- ------------------------------------------------------------
