# Postgres / Supabase production checklist

Use this when moving 1code from local JSON storage to a production Postgres or Supabase database.

## 1. Prepare the database

Run these files in order:

1. `db/schema.sql`
2. `db/rls.sql`
3. `db/import-from-json.sql` only if you want to migrate local demo data
4. `db/generated-admin-roles.sql` after running `npm run admin:roles:write`

`npm run postgres:check` uses `db/generated-admin-roles.sql` when it exists, otherwise it checks `db/admin-roles.sql`. It fails if the selected staff-role SQL still contains placeholder admin or moderator account IDs. Generate `db/generated-admin-roles.sql` from `ADMIN_ACCOUNT_IDS` and `MODERATOR_ACCOUNT_IDS` with `npm run admin:roles:write`, then review it before applying.

## 2. Set environment variables

Required for production:

```text
NODE_ENV=production
STORAGE_DRIVER=postgres
DATABASE_URL=postgres://...
DATABASE_SSL=true
PUBLIC_BASE_URL=https://your-domain.example
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_PIN=replace-with-private-admin-pin
ADMIN_ACCOUNT_IDS=discord:123456789012345678
MODERATOR_ACCOUNT_IDS=
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

Use `docs/env-setup-checklist.md` while filling these values in the hosting dashboard.

`ADMIN_ACCOUNT_IDS` and `MODERATOR_ACCOUNT_IDS` should match the account IDs promoted in `db/generated-admin-roles.sql` and must use `discord:numeric-id` values.
`ADMIN_PIN` must be private and at least 16 characters. Prefer `npm run secrets` output.
`DATABASE_URL` must be the real production database URL. Do not leave an `example.com` host or `user:password` placeholder credentials in the hosting settings.
`DATABASE_SSL` must be set to `true` for production Postgres.

## 3. Verify the database

After installing dependencies and setting `DATABASE_URL`, run:

```powershell
npm run postgres:check
```

This checks that:

- all required tables exist
- required columns exist
- inquiry support fields exist, including `request_id`, beta feedback triage fields, and `resolution_note`
- row level security is enabled
- direct message participant and moderation RLS policies exist
- `db/generated-admin-roles.sql` was generated from the same `ADMIN_ACCOUNT_IDS` and `MODERATOR_ACCOUNT_IDS` values used by hosting

## 4. Start production safely

Before launch, run:

```powershell
npm run preflight
npm run smoke
```

The server refuses to start in production when key settings are unsafe.

## 5. First admin login

1. Log in with Discord.
2. Confirm the account ID is listed in `ADMIN_ACCOUNT_IDS`.
3. Open the admin tab.
4. Confirm stats, reports, ad slots, audit logs, deleted items, and system status load.
5. Log in as a moderator account if one is configured.
6. Confirm reports load, but system settings remain blocked.
7. Send a test DM, confirm only the sender, recipient, moderator, or admin can view it, then hide and restore it from admin moderation tools.

Keep the shared `ADMIN_PIN` private. Prefer named admin accounts for daily operation.
