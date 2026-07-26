# Adding the Leads Feature — Deployment Guide

This is an addition to the original `README.md`. Do this after your CRM is already live and working.

---

## Part 1 — Get a Google Places API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in (a normal Google account is fine).
2. Create a new project (top-left project dropdown → **New Project**) — name it anything, e.g. `natluc-leads`.
3. In the search bar at the top, search for **"Places API"** and open it → click **Enable**.
4. Go to **APIs & Services → Credentials → Create Credentials → API key**. Copy the key it generates.
5. **Important — restrict the key** so it can't be abused if it ever leaks: click into the new key, under "API restrictions" select **Restrict key**, and tick only **Places API**. Save.
6. Google requires a billing account on file to use this, even though your usage here will sit well within the free monthly credit. Add a card under **Billing** if you haven't already — you're extremely unlikely to be charged anything at this scale, but you can also set a budget alert (Billing → Budgets & alerts) if you'd like a safety net.

---

## Part 2 — Add the leads table

1. In Supabase → **SQL Editor → New query**.
2. Paste in the contents of `leads_schema.sql` and click **Run**.

---

## Part 3 — Deploy the Edge Function

1. In Supabase, go to **Edge Functions** in the left sidebar.
2. Click **Create a new function** (or **Deploy a new function**).
3. Name it exactly: `find-leads`
4. It'll open a code editor in the browser — delete whatever's there and paste in the entire contents of `supabase/functions/find-leads/index.ts`.
5. Click **Deploy**.
6. Still in Edge Functions, find **Secrets** (sometimes under a "Manage secrets" link or a separate Secrets tab). Add one:
   - Name: `GOOGLE_PLACES_API_KEY`
   - Value: the key you copied in Part 1.
   
   You don't need to add `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` — Supabase provides those to every Edge Function automatically.

---

## Part 4 — Update the live site

1. In GitHub, open your repo and upload/replace `app.js` with the updated version from this package (it now includes the Leads tab).
2. Commit the change. GitHub Pages redeploys automatically within a minute or so.
3. Hard-refresh your CRM (Ctrl/Cmd+Shift+R) and log in — you should now see a **Leads** tab in the navigation.

---

## Part 5 — Try it

1. Click the **Leads** tab.
2. Leave the scope on **Local** for a first test (faster, cheaper) and click **Find Leads Now**.
3. It'll take anywhere from several seconds to a minute or two — it's making a series of real API calls in the background.
4. Once done, you'll see a summary ("searched X queries, found Y businesses, added Z new leads") and the results appear in the table below.
5. For each lead you can **Mark Contacted**, **Add as Customer** (which creates a proper Customer record you can then log follow-ups against, same as any other customer), or **Dismiss**.

---

## Part 6 — Optional: run it automatically on a schedule

If you'd like new leads to appear on their own without anyone clicking the button:

1. In Supabase, look for **Integrations → Cron Jobs** (or **Database → Cron Jobs**, naming varies by dashboard version).
2. Create a new scheduled job that calls your `find-leads` function — e.g. weekly, alternating scope between `local` and `national` if you like, or just running `local` weekly and `national` monthly.
3. Supabase's Cron Jobs UI will show you exactly how to point it at your function's URL — it's a normal HTTPS POST to `https://<your-project>.supabase.co/functions/v1/find-leads` with a JSON body like `{"scope": "local"}`.

This part is genuinely optional — the manual "Find Leads Now" button works standalone and costs nothing extra to leave as the only way it runs, if you'd rather stay in control of when it happens.

---

## A note on cost and scope

The function is deliberately capped (a handful of search categories, a handful of cities, a small results limit per search) so that even a "national" run stays fast and well within Google's free monthly credit. If this proves useful and you want deeper coverage — more cities, more product-specific search terms, higher result limits — that's a matter of editing the `SEARCH_TERMS` and `NATIONAL_LOCATIONS` lists at the top of `index.ts` and redeploying the function. Happy to help expand it once you've seen how the first batch of leads looks.
