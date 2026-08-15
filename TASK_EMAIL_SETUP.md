# Task Assignment Emails — Setup Guide

Everything on the code/database side is already built and deployed:
- Edge Function `notify-task-assigned` is live.
- The database trigger (`notify_task_assigned.sql`) is applied — every new
  task insert already calls the function. Verified end-to-end with a test
  row (got the expected "Server not configured" response, since the last
  step below hasn't been done yet).

What's left is entirely on the Resend side — an account only you can create.

---

## 1. Create a Resend account

Go to [resend.com](https://resend.com) and sign up (their free tier — 3,000
emails/month — comfortably covers a 3-person team).

## 2. Verify a sending domain

In Resend: **Domains → Add Domain** → enter `natluctrading.co.za` (or a
subdomain like `notify.natluctrading.co.za`, which is often simpler if you'd
rather not touch records on the root domain).

Resend gives you 3 DNS records (SPF, DKIM, and usually a tracking/return-path
CNAME) to add wherever `natluctrading.co.za`'s DNS is managed. Verification
in Resend's dashboard usually completes within minutes once the records are
live.

*(If you're not sure where that domain's DNS is hosted, check the registrar
account it was bought through, or run `dig NS natluctrading.co.za` — happy
to help once you know.)*

## 3. Generate an API key

Resend dashboard → **API Keys → Create API Key**. Sending-only permission is
enough — no need for full access.

## 4. Set the two secrets — in the Supabase dashboard, not here

**Supabase dashboard → Edge Functions → `notify-task-assigned` → Secrets**,
add:

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 3 |
| `RESEND_FROM_EMAIL` | an address on your verified domain, e.g. `tasks@natluctrading.co.za` |

Setting these directly in the Supabase dashboard (rather than pasting the
key into chat) keeps the Resend key out of this conversation entirely.

## 5. Test it

Once both secrets are set, assign yourself a task in the CRM (Tasks tab →
Assign a Task) and check your inbox. No redeploy needed — the function reads
secrets fresh on each call.

---

### To turn this off later

Run in Supabase SQL Editor:
```sql
drop trigger if exists on_task_assigned on tasks;
```
Task assignment keeps working exactly as before (in-app only) — this only
removes the email step.
