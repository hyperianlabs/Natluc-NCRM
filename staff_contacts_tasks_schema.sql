-- ============================================================
-- Natluc Trading CRM — Staff directory, extra contacts, tasks
-- Run this in Supabase SQL Editor (in addition to the earlier
-- schema.sql and leads_schema.sql)
-- ============================================================

-- ------------------------------------------------------------
-- Staff directory — used so tasks can be assigned to a real
-- person and "My Tasks" can reliably match who's logged in.
-- Add your 3 staff here once (name + the same email they log
-- in with).
-- ------------------------------------------------------------
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  created_at timestamptz default now()
);

alter table staff enable row level security;

create policy "Authenticated staff can manage staff list"
  on staff for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Additional contacts per customer. The customer's original
-- contact_person/position/contact_number/email fields still
-- work as-is and represent the primary contact — this table is
-- for any extra people at that company (e.g. a second buyer,
-- a workshop foreman, an accounts contact).
-- ------------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  name text not null,
  position text,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now()
);

alter table contacts enable row level security;

create policy "Authenticated staff can manage contacts"
  on contacts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Tasks — flag something for a staff member to do, optionally
-- tied to a customer. assigned_to stores the staff member's
-- email (matched against the staff table above and against
-- whoever is logged in, for the "My Tasks" view).
-- ------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to text not null,
  created_by text,
  customer_id uuid references customers(id) on delete set null,
  due_date date,
  status text default 'open', -- 'open' | 'done'
  created_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "Authenticated staff can manage tasks"
  on tasks for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Optional: pre-fill your 3 staff members now so the assignee
-- dropdown isn't empty on first use. Replace with real names
-- and the exact emails they log in with, then run just this
-- part (or add more staff later from within the app instead).
-- ------------------------------------------------------------
-- insert into staff (name, email) values
--   ('Staff Member One', 'one@natluc.net'),
--   ('Staff Member Two', 'two@natluc.net'),
--   ('Staff Member Three', 'three@natluc.net');
