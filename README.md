# Natluc Trading CRM — Deployment Guide

**Stack:** Supabase (database + login) + GitHub Pages (free static hosting) + your existing `natluc.net` domain from Wix.

No server to manage. Once set up, updating the app is just editing files and pushing to GitHub.

---

## Part 1 — Set up Supabase (the database + login system)

1. Go to [supabase.com](https://supabase.com), sign up, and create a **New Project**.
   - Pick any name (e.g. `natluc-crm`) and a strong database password (save it somewhere safe — you likely won't need it again day-to-day).
   - Pick a region close to South Africa if offered (e.g. `eu-west` / `af-south`).
2. Once the project is ready, open **SQL Editor** (left sidebar) → **New query**.
3. Paste in the entire contents of `schema.sql` (included in this package) and click **Run**. This creates the `customers` and `interactions` tables and locks them down so only logged-in users can touch them.
4. Go to **Authentication → Providers → Email**, and turn **OFF** "Allow new users to sign up." This is important — it means no one can create their own account; only you can add staff.
5. Go to **Authentication → Users → Add user**, and create one login per staff member (email + password). Do this 3 times. You can change these passwords later from the same screen.
6. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key — you'll need both next.

---

## Part 2 — Connect the app to Supabase

1. Open `config.js` in this package.
2. Replace the two placeholder values with what you copied in step 6 above:
   ```js
   const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
3. Save the file. That's the only code edit required — everything else works as-is.

*(The anon key is meant to be public/visible in frontend code — it can't read or write anything by itself because of the security policies from `schema.sql`. Only a logged-in staff account can.)*

---

## Part 3 — Put the code on GitHub and turn on GitHub Pages

1. Create a free GitHub account if you don't have one, then create a **new repository** — e.g. `natluc-crm`. Keep it private if you'd rather staff not browse the raw code (this has no bearing on whether the *site* is public).
2. Upload all 5 files from this package into the repository (`index.html`, `styles.css`, `app.js`, `config.js` with your real keys, `schema.sql`). Easiest way: on the repo page, click **Add file → Upload files**, drag them in, and commit.
3. Go to the repo's **Settings → Pages**.
   - Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
   - GitHub will publish the site at `https://<your-username>.github.io/natluc-crm/` within a minute or two — check it loads and shows the login screen before continuing.
4. Still on the **Pages** settings screen, under **Custom domain**, type `natluc.net` and save. GitHub will add a `CNAME` file to your repo automatically.

---

## Part 4 — Point your Wix domain at GitHub

Your domain stays registered with Wix — you're just telling it where to send visitors.

1. Log in to Wix → **Domains** → select `natluc.net` → **DNS Records** (sometimes called "Manage DNS" or "Advanced DNS").
2. Add these **A records** for the root domain (`@` or blank host):
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
3. Add a **CNAME record** for `www` pointing to:
   ```
   <your-username>.github.io
   ```
4. Remove/leave alone any conflicting default Wix "parking page" A records for the root domain — Wix sometimes has one preset which needs to be deleted so it doesn't clash.
5. DNS changes can take anywhere from a few minutes to a few hours to propagate.
6. Back in GitHub → **Settings → Pages**, once the domain shows as verified, tick **Enforce HTTPS**. GitHub issues a free SSL certificate automatically — give it a little time after DNS propagates.

Once that's done, `https://natluc.net` (and `www.natluc.net`) will load your CRM login screen directly.

---

## Part 5 — Test it

1. Visit `natluc.net`.
2. Log in with one of the 3 staff accounts you created in Part 1, step 5.
3. Add a test customer and a follow-up action, confirm it saves.
4. Log in as a different staff member (or open an incognito window) and confirm they see the same data — it's shared across the team, as intended.

---

## Ongoing maintenance (should be minimal)

- **Adding/removing staff:** Supabase dashboard → Authentication → Users. No code changes needed.
- **Changing a password:** same screen.
- **Updating the app itself:** edit the file in GitHub (or push from your computer) — GitHub Pages redeploys automatically within a minute.
- **Backups:** Supabase takes automatic daily backups on the free tier for a short retention window; for extra peace of mind you can manually export your data occasionally from the Supabase Table Editor.
- **Costs:** both Supabase and GitHub Pages have free tiers that comfortably cover 3 users and this amount of data. If you ever outgrow Supabase's free tier, it's a paid upgrade within the same dashboard — no migration needed.

---

## If something doesn't work

- **Login screen shows but login fails:** double check the email/password in Supabase → Authentication → Users, and that `config.js` has the correct URL/key (no extra quotes or spaces).
- **Blank page / console errors:** open browser dev tools (F12) → Console tab, and check for a red error — most commonly a typo in `config.js`.
- **Site loads on `github.io` but not `natluc.net`:** DNS hasn't propagated yet, or the CNAME/A records aren't quite right — recheck Part 4.
