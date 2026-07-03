# Restore guide

This guide explains how to restore a 1code backup safely.

## Before restoring

1. Stop public traffic if the site is already live.
2. Create a fresh backup of the current data.
3. Confirm the backup file has:
   - `format: "partyfinder-backup-v1"`
   - `checksum: "sha256:..."`
   - `data.recruitments`
   - `data.threads`
   - `data.messages`
   - `data.reports`
   - `data.adSlots`
4. If the backup was exported from the admin panel, compare the first characters of `checksum` with the displayed `照合ID`.
5. Verify the checksum before restoring:

```powershell
npm run backup:verify -- backups\backup-file.json
```

6. Confirm the backup workflow can create and verify a fresh file:

```powershell
npm run backup:drill
```

7. Keep a copy of both the old and new backup files.

## Local JSON restore

For local JSON storage, replace:

```text
data/db.json
```

with the `data` object inside the backup file.

Do not copy the whole backup wrapper into `db.json`. Only copy the value under `data`.

Restart the server after restoring.

## Postgres/Supabase restore

For production Postgres/Supabase, prefer importing through SQL rather than editing tables by hand.

Recommended flow:

1. Restore to a staging database first.
2. Run the app against staging.
3. Run the smoke test.
4. Confirm admin stats, reports, ad slots, bans, and audit logs.
5. Confirm DM conversations, hidden DM records, and deleted item history are present.
6. Only then restore production.

## Moderation restore checks

After restoring any backup that includes moderation activity:

1. Open the admin panel.
2. Confirm `削除履歴` includes deleted replies and hidden DMs.
3. Confirm hidden DMs appear as `DM`, not as recruitment posts.
4. Restore one hidden DM in staging and confirm it returns to the related users' My Page message thread.
5. Confirm unresolved DM reports still appear in reports, and resolved hidden-DM reports stay resolved.

## What not to do

- Do not restore directly over production without a fresh backup.
- Do not mix rows from different backup files unless you know the IDs are compatible.
- Do not delete audit logs before investigating a moderation issue.
- Do not manually remove hidden DM rows before confirming whether a report or deleted item record still references them.

## Retention notes

- The app keeps the newest 500 audit logs, 500 moderation events, and 500 deleted item records.
- Admin screens show the newest 100 records in those lists.
- Export a backup before making moderation cleanup decisions that may need older history later.
