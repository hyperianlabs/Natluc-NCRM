-- ============================================================
-- Natluc Trading CRM — Automatic lead expiry
--
-- Deletes leads older than 30 days (based on when they were
-- first found) automatically, once a week. Complements the
-- "Clear All Leads" button in the app, which wipes everything
-- on demand instead.
--
-- SETUP (one-time):
-- 1. In Supabase dashboard: Database -> Extensions -> search
--    "pg_cron" -> enable it.
-- 2. Come back to SQL Editor -> New query -> paste everything
--    below -> Run.
-- ============================================================

select cron.schedule(
  'clear-old-leads',            -- job name
  '0 3 * * 0',                  -- every Sunday at 03:00 UTC
  $$ delete from leads where found_at < now() - interval '30 days' $$
);

-- ------------------------------------------------------------
-- To check it's registered:
--   select * from cron.job;
--
-- To change how long leads are kept, re-run this whole file
-- after first unscheduling the old job:
--   select cron.unschedule('clear-old-leads');
-- then adjust the interval above (e.g. '14 days', '60 days')
-- and run the cron.schedule(...) block again.
--
-- To stop automatic clearing entirely:
--   select cron.unschedule('clear-old-leads');
-- ------------------------------------------------------------
