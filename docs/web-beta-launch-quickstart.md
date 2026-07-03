# Web beta launch quickstart

Use this when you want to publish the PC browser beta with the least extra work.

## Goal

Publish a closed beta of 1code that:

- runs on a public `https://` URL
- uses Postgres/Supabase instead of local JSON
- accepts posts only from people with `BETA_ACCESS_CODE`
- lets you operate reports, DMs, inquiries, beta feedback, ads, backups, and daily beta checks from the admin tab

## 0. Do not broaden scope

For this beta, postpone:

- smartphone polish
- payment
- large public launch
- custom domain
- full ad monetization review

Use placeholder ads or safe affiliate links only.

## 1. Local final check

From this folder:

```powershell
cd C:\Users\hiroy\Documents\Codex\2026-06-15\new-chat\outputs\partyfinder-production
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\beta-prelaunch-check.js
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\generate-secrets.js
```

Keep the generated values for:

- `ADMIN_PIN`
- `SESSION_SECRET`
- `BETA_ACCESS_CODE`

## 2. Create Supabase/Postgres

1. Create a Supabase project or managed Postgres database.
2. Copy the production connection string.
3. Open the SQL editor and run these files in order:
   1. `db/schema.sql`
   2. `db/rls.sql`
   3. `db/import-from-json.sql` only if you want current local demo data
   4. `db/generated-admin-roles.sql` after running `npm run admin:roles:write`

If you do not know your Discord account ID yet, you can launch with a private `ADMIN_PIN`, then add `ADMIN_ACCOUNT_IDS` after your first Discord login.

## 3. Create Discord app

In the Discord Developer Portal:

1. Create or open an application.
2. Add this redirect URL after Render gives you the public URL:

```text
https://YOUR-RENDER-URL/auth/discord/callback
```

3. Copy:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`

Discord login is optional for ordinary testers, but production startup currently requires these values.

## 4. Deploy to Render

Create a Render Web Service from this project folder or use `render.yaml`.

Use:

```text
Build command: npm install
Start command: node server.js
```

Set environment variables:

```text
PORT=8787
NODE_ENV=production
ADMIN_PIN=<generated private value>
ADMIN_ACCOUNT_IDS=
MODERATOR_ACCOUNT_IDS=
BETA_ACCESS_CODE=<generated invite code>
BETA_WRITE_PAUSED=false
ENABLE_SEED_DATA=false
SESSION_SECRET=<generated long value>
STORAGE_DRIVER=postgres
DATABASE_URL=<Supabase/Postgres connection string>
DATABASE_SSL=true
PUBLIC_BASE_URL=https://YOUR-RENDER-URL
DISCORD_CLIENT_ID=<Discord client ID>
DISCORD_CLIENT_SECRET=<Discord client secret>
```

After Render creates the first URL, update `PUBLIC_BASE_URL` to that URL and add the Discord redirect URL.

## 5. First production checks

Open:

```text
https://YOUR-RENDER-URL/api/health
```

Then open the site:

```text
https://YOUR-RENDER-URL/
```

Check:

- top page loads
- beta access panel appears
- posting without beta code is blocked
- posting with beta code works
- recruitment, free-talk, reply, like, DM, report, and inquiry work
- admin tab opens with `ADMIN_PIN`
- `β公開判定` has no `停止` items before inviting testers
- `β投稿停止` is `通常`
- `β日次レポート` shows `優先対応キュー`
- `バックアップ取得` works

## 6. Invite only a small beta group

Use the admin tab:

1. Open `管理`.
2. Open `β公開判定`.
3. Copy `招待文テンプレート`.
4. Send the `BETA_ACCESS_CODE` separately.

Recommended first group:

- 3 to 5 trusted people
- PC browser users
- people who can report bugs calmly

## 7. Daily operation while you are away

Once per day:

1. Open `管理`.
2. Check `優先対応キュー` in `β日次レポート`.
3. Clear `高` items first.
4. Check `未対応DM通報`.
5. Check `β改善バックログ`.
6. Export a backup if `バックアップ` is missing or older than 7 days.

## 8. Stop conditions

Pause inviting new testers if:

- reports or DM reports cannot be handled within 24 hours
- high-priority beta feedback keeps increasing
- backup export fails
- `/api/health` is not ready
- users report login/session problems

For an emergency pause, set `BETA_WRITE_PAUSED=true` in Render. This keeps browsing, reports, inquiries, and admin actions available while blocking ordinary posts, replies, likes, joins, and DMs.

## Current status

The local beta gate currently passes:

```text
npm run beta:prelaunch
```

The remaining work is mostly external setup: Supabase/Postgres, Render, Discord OAuth, and real public URL verification.
