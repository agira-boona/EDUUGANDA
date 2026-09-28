# EduUganda

EduUganda is a mobile-first YouTube-style school learning platform for Nursery, Primary and Secondary students.

## Student flow

After a student completes the term-fee payment, the application immediately opens the student dashboard shown in the supplied EduUganda reference: greeting/level card, Watch Videos, Class Notes, Discussion Groups, Live Classes, Recommended for You, Your Subjects, Upcoming Live Classes and Recent Activity. The `/admin` route is a separate administrator-only interface and is never used as the post-payment student landing page.

## Included

- Registration, login, logout and password recovery flow
- Dynamic level/class selection
- Term-fee payment page with MTN MoMo, Airtel Money and Visa/Mastercard test UI
- Student dashboard inspired by the supplied EduUganda dashboard image
- Search, level/class/subject/topic navigation
- Video grid and video player page
- Notes download and next-video navigation
- Watch progress tracking
- Separate `/admin` route with admin login
- User management and disable/enable controls
- Video/notes upload management
- Subject and class management
- Editable MTN, Airtel and bank receiving-account settings
- Revenue overview
- Netlify-ready SPA routing
- Supabase configuration hook; blank configuration uses local persistence so the project can be reviewed and hosted immediately

## Backend

This app is wired to Supabase (Auth + Postgres + Row Level Security). Run `supabase-schema.sql` in your project's SQL Editor to create or update the tables, security policies and starter content, then create your administrator account (see below). If the database was already set up, run the file again so the live-class settings columns are added.

## Administrator account

There is no seeded admin password anymore. To create one:

1. Register a normal student account through the app (or Supabase Dashboard → Authentication → Users → Add user) using the email you want for admin, e.g. `admin@eduuganda.ug`.
2. In the Supabase SQL Editor, run:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'admin@eduuganda.ug');
   ```
3. Sign in at `/admin` with that email and password.

If Supabase reports `Invalid login credentials`, the password is wrong or the Auth user does not exist. Reset it from Supabase Dashboard → Authentication → Users → the admin user → Reset password. The `is_admin` value in `public.profiles` cannot change an Auth password.

## Hosting

Upload the contents of this folder to Netlify, or connect the folder as a Git repository. `netlify.toml` provides the SPA fallback.

## Supabase connection

Open `supabase-config.js` and set:

- `supabaseUrl` — your project's URL, e.g. `https://xxxxx.supabase.co`
- `supabasePublishableKey` — the **publishable / anon** key (never the secret/service_role key)

Registration, login, payments, videos, notes, settings and admin actions are all read from and written to Supabase.

## Payments (disabled at launch)

Payments are off by default so early users can access the dashboard without paying. The payment UI and code stay fully in place — an admin can turn `payments_enabled` on later from the admin dashboard's Payments card, once a real payment provider is verified and tested. This is enforced both in the UI and at the database level (RLS on the `videos` table), so it can't be bypassed from the browser.

## Payment integration

The payment page contains a test payment interface. To process real UGX payments, connect the payment buttons to your chosen Flutterwave/Stripe or Mobile Money backend endpoint. Never put secret payment keys in client-side JavaScript.

## Content

The initial catalog contains educational placeholder/sample lesson records and public educational YouTube links. Admin can add or replace lessons from the admin panel.
