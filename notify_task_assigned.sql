-- ============================================================
-- Natluc Trading CRM — Email notification on task assignment
--
-- Fires the moment a row is inserted into `tasks`, looks up the
-- assignee/customer/creator names, and calls the
-- `notify-task-assigned` Edge Function, which emails the
-- assignee via Resend.
--
-- SETUP (one-time):
-- 1. Supabase dashboard -> Database -> Extensions -> enable
--    "pg_net" (used to call the Edge Function over HTTP).
-- 2. Supabase dashboard -> Edge Functions -> notify-task-assigned
--    -> Secrets: set RESEND_API_KEY and RESEND_FROM_EMAIL
--    (see TASK_EMAIL_SETUP.md for details). TASK_NOTIFY_SECRET
--    is already set below and matches the deployed function's
--    secret — no need to touch it.
-- 3. SQL Editor -> New query -> paste everything below -> Run.
-- ============================================================

create or replace function notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_name text;
  v_customer_name text;
  v_created_by_name text;
  v_payload jsonb;
begin
  select name into v_assignee_name from staff where email = new.assigned_to;
  select name into v_customer_name from customers where id = new.customer_id;
  select name into v_created_by_name from staff where email = new.created_by;

  v_payload := jsonb_build_object(
    'assignee_name', coalesce(v_assignee_name, new.assigned_to),
    'assignee_email', new.assigned_to,
    'title', new.title,
    'description', new.description,
    'due_date', new.due_date,
    'customer_name', v_customer_name,
    'created_by_name', v_created_by_name
  );

  perform net.http_post(
    url := 'https://ctrehrfvxqpqjynmlssl.supabase.co/functions/v1/notify-task-assigned',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', '8bca76a7e4692ece657f8991cf5e2b211eae0b2c1dcc5f3a'
    ),
    body := v_payload
  );

  return new;
end;
$$;

drop trigger if exists on_task_assigned on tasks;

create trigger on_task_assigned
  after insert on tasks
  for each row
  execute function notify_task_assigned();

-- ------------------------------------------------------------
-- To stop email notifications entirely (in-app task list keeps
-- working as before):
--   drop trigger if exists on_task_assigned on tasks;
-- ------------------------------------------------------------
