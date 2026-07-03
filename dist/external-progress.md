# 1code external setup progress

Updated: 2026-07-04

## Supabase

- Project: `hirohiro0000tommy-source's Project`
- Project ref: `cxpivolfcnhgploptwym`
- Public project URL: `https://cxpivolfcnhgploptwym.supabase.co`
- `db/schema.sql`: applied successfully
- `db/rls.sql`: applied successfully
- Table Editor verified these application tables exist:
  - `ad_slots`
  - `announcements`
  - `audit_logs`
  - `deleted_items`
  - `direct_messages`
  - `inquiries`
  - `likes`
  - `moderation_events`
  - `profiles`
  - `recruitments`
  - `replies`
  - `reports`
  - `threads`

## Next External Steps

1. Connect Render to the GitHub repository that contains this project.
2. Create a Render Web Service.
3. Set `DATABASE_URL` only in the hosting dashboard.
4. Set `DATABASE_SSL=true`, `STORAGE_DRIVER=postgres`, and the remaining production environment variables from `dist/render-env-fill-sheet.md`.
5. Configure Discord OAuth after the public URL is known.

Do not paste database passwords, full connection strings, admin pins, session secrets, beta access codes, or Discord client secrets into chat or committed files.

## Render

- Dashboard: logged in
- GitHub repository: `https://github.com/hirohiro0000tommy-source/1code`
- Service: `1code`
- Service ID: `srv-d941nv57vvec73e11ai0`
- Public URL: `https://onecode-cngg.onrender.com`
- Instance: Free
- First deploy: live
- Current blocker: production environment variables, Discord OAuth app, and production database password are still needed
- Fill sheet: `dist/render-env-fill-sheet.md`
