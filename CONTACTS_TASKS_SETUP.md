# Adding Customer Editing, Extra Contacts & Tasks — Deployment Guide

Same pattern as before: one SQL script in Supabase, one file update on GitHub.

---

## Part 1 — Run the new database schema

1. Supabase → **SQL Editor → New query**.
2. Open `staff_contacts_tasks_schema.sql` from this package, copy the whole thing, paste it in, click **Run**.

This creates 3 new tables:
- **staff** — the directory tasks get assigned from
- **contacts** — extra contacts per customer, beyond the main one
- **tasks** — the actual task/flagging feature

---

## Part 2 — Add your 3 staff members

You need this done before you can assign any tasks.

1. In Supabase, **Table Editor → staff**.
2. Click **Insert → Insert row**, three times, once per staff member:
   - `name`: their full name
   - `email`: **the exact email they log in with** — this has to match exactly, since that's how the app knows which tasks are "mine" when someone logs in.
3. Save each.

*(Alternative: once `app.js` is updated in Part 3, there's also an "Add Staff Member" form right inside the new Tasks tab — you can do it there instead of in Supabase directly, if you'd rather.)*

---

## Part 3 — Update the live site

1. GitHub → your repo → `app.js` → pencil icon (Edit) → select all, delete → paste in the new `app.js` from this package → **Commit changes**.
2. Hard-refresh your CRM (Ctrl/Cmd+Shift+R) and log in.

---

## What's new

**Editing a customer** — open any customer, click **Edit Customer** where the details used to be read-only, change what you need, **Save Changes**. Cancel discards without saving.

**Multiple contacts per customer** — still on the customer's page. The original contact fields (name, position, phone, email) remain the *primary* contact, shown at the top as before. Below that is a new **Additional Contacts** section — add as many extra people as you like (e.g. a second buyer, a workshop foreman), each editable/removable individually.

**Assigning a task to a staff member** — two ways in:
- From a customer's page: **"Assign a Task for This Customer"** button at the bottom.
- From the new **Tasks** tab: **"Assign a Task"**, with an optional link to a customer.

Fill in what needs doing, who it's for, and optionally a due date. The person it's assigned to will see it:
- On their **Dashboard**, under a new **"My Open Tasks"** panel — so they don't have to go looking for it.
- In the **Tasks** tab, filterable between **My Tasks** and **All Staff** (useful for you to see what everyone's got on, or to double check something got assigned correctly).

Tasks get marked **Done** (moves to a collapsed "Done" list, reopenable if needed) or deleted outright.

---

## A note on how "flagging" works here

This doesn't send an email or a push notification — there's no messaging infrastructure wired up for that. It surfaces the moment that staff member next logs into the CRM and looks at their dashboard. For a 3-person team checking the CRM regularly, that's usually enough — but if you'd want an actual email or SMS alert the moment a task is assigned, that's a further addition (Supabase can trigger emails via its own infrastructure, or a service like Resend/Twilio) — happy to build that next if it'd be useful once you've tried this version out.
