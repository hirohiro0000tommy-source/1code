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
- New Web Service screen: opened
- Current blocker: GitHub provider connection or public repository URL is required
- Fill sheet: `dist/render-env-fill-sheet.md`
