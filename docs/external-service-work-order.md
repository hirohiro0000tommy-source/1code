# External service work order

Use this while moving 1code from local beta work to a hosted public beta.

This file is intentionally written as a handoff sheet. Do not paste private values into this file, screenshots, chat, or source code.

## Stop before secrets

Stop and confirm before any of these actions:

- Creating or changing a Supabase, Render, Discord, domain, payment, or ad account.
- Pasting `DATABASE_URL`, `ADMIN_PIN`, `SESSION_SECRET`, `BETA_ACCESS_CODE`, or `DISCORD_CLIENT_SECRET` into a dashboard.
- Making a deployment public.
- Sharing the live URL outside a small test group.

Safe values to share in chat:

- Public site URL.
- `RELEASE_VERSION` and short `COMMIT_SHA`.
- Discord numeric user ID for admin setup.
- Whether each SQL file has been applied.
- Whether each dashboard setting is complete.

Private values not to share in chat:

- Database password or full `DATABASE_URL`.
- Discord client secret.
- Admin PIN.
- Session secret.
- Beta access code.

## 1. Supabase or Postgres

Goal: prepare the production database.

Checklist:

- Create the production database project.
- Keep the database password private.
- Apply `db/schema.sql`.
- Apply `db/rls.sql` when using Supabase.
- Set `ADMIN_ACCOUNT_IDS` and `MODERATOR_ACCOUNT_IDS` in your local terminal with the same values used in hosting.
- Run `npm run admin:roles:write` and review `db/generated-admin-roles.sql`.
- Apply `db/generated-admin-roles.sql`.
- Store the production connection string only in the hosting dashboard as `DATABASE_URL`.
- Set `DATABASE_SSL=true` in the hosting dashboard.

Local verification after `DATABASE_URL` is available in the terminal environment:

```powershell
npm run postgres:check
```

## 2. Hosting environment

Goal: deploy the app with production settings.

Checklist:

- Create a web service from the project repository.
- If the provider supports a root directory, point it to `outputs/partyfinder-production`.
- Use `npm install` as the build command.
- Use `node server.js` as the start command.
- Use the environment values from `docs/env-setup-checklist.md`.
- Set `NODE_ENV=production`.
- Set `STORAGE_DRIVER=postgres`.
- Set `PUBLIC_SECURITY_CONTACT` to a real public `mailto:` or `https://` contact.
- Set `RELEASE_VERSION` to a short deployment label and `COMMIT_SHA` to the deployed commit when available.
- Set `ENABLE_SEED_DATA=false`.
- Set `PUBLIC_WRITE_PAUSED=false` for launch, or `true` if posting must stay paused.
- Set `BETA_ACCESS_CODE` blank when the site should be open publicly.

Run before deploying:

```powershell
npm run launch:today
npm run deploy:plan
npm run release:final
npm run config:check
```

## 3. Discord Developer Portal

Goal: enable optional Discord login and stable account IDs.

Checklist:

- Create or open the Discord application for 1code.
- Set the OAuth redirect URL to:

```text
${PUBLIC_BASE_URL}/auth/discord/callback
```

- `PUBLIC_BASE_URL` must be the bare public origin, for example `https://your-domain.example`. Do not include `/app`, query strings, or Discord callback paths in the environment value.
- Copy the client ID into the hosting dashboard as `DISCORD_CLIENT_ID`.
- Copy the client secret into the hosting dashboard as `DISCORD_CLIENT_SECRET`.
- Get the site owner's Discord numeric user ID.
- Set `ADMIN_ACCOUNT_IDS=discord:YOUR_NUMERIC_USER_ID`.
- Set `MODERATOR_ACCOUNT_IDS=` blank until a trusted helper exists.

## 4. First login and staff SQL

Goal: connect the production admin account to database roles.

Checklist:

- Open the public URL after the first deploy.
- Log in with Discord once.
- Confirm your account appears in the data store as `discord:YOUR_NUMERIC_USER_ID`.
- Set the same ID in the hosting dashboard as `ADMIN_ACCOUNT_IDS`.
- Re-run `npm run admin:roles:write` locally with the same staff IDs.
- Apply `db/generated-admin-roles.sql` to the production database.

## 5. Live verification

Run after the public URL exists:

```powershell
$env:LIVE_BASE_URL="https://YOUR-PUBLIC-URL"
npm run deploy:verify
```

## 6. First production admin pass

Goal: confirm the deployed app is controllable before inviting testers.

Checklist:

- Open the public URL.
- Open `/status.json` and confirm the public mode is expected.
- Run `npm run deploy:verify` with `LIVE_BASE_URL` and confirm public status responses include request IDs.
- Log in with Discord.
- Open `管理`.
- Confirm `一般公開判定` has no stop items.
- Confirm `公開直前チェック` has no unresolved host, database, Discord, backup, or safety items.
- Export the first production backup from `管理`.
- Manually test one recruitment, one free-talk thread, one reply, one like, one DM, one report, and one inquiry.

## 7. Small public share

Goal: keep the first traffic controlled.

Checklist:

- Share to a small group first.
- Watch `運用ダイジェスト`.
- Watch `公開運用レポート`.
- Watch `インシデント共有`.
- Keep the hosting dashboard open.
- Pause posting with `PUBLIC_WRITE_PAUSED=true` if spam, unsafe content, DM trouble, or server errors appear.

## 8. Handoff values

Fill these only with non-secret status notes.

```text
Public URL:
Database schema applied: yes/no
RLS applied: yes/no/not using Supabase
Admin roles applied: yes/no
Discord redirect set: yes/no
Hosting env complete: yes/no
Deploy verify passed: yes/no
First backup exported: yes/no
Status check passed: yes/no
Live smoke passed: yes/no
```
