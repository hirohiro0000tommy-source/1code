# Launch day runbook

Use this on the day you publish 1code to real users.

## Stop points

Do not share the URL publicly when any of these are true:

- `npm run release:final` fails.
- `npm run deploy:verify` fails against the deployed URL.
- `管理` -> `一般公開判定` shows a `停止` item.
- `管理` -> `公開直前チェック` shows unresolved hosting, backup, Discord, or safety items.
- `管理` -> `インシデント共有` shows `要対応`.
- There are unresolved reports, DM reports, deletion requests, or high-priority beta feedback.
- You cannot access the admin screen with the production admin account.

## Before deployment

1. Run `npm run launch:today`.
2. Open `管理` -> `公開設定ハンドオフ` and copy the memo.
3. Open `docs/external-service-work-order.md` and follow the same order: DB, hosting environment, Discord OAuth, first login, Staff SQL, live verification, first backup, small public share.
4. Run `npm run secrets` if final secrets are not prepared.
5. Confirm the production database has `db/schema.sql` and `db/rls.sql` applied.
6. Confirm the hosting environment values match `docs/env-setup-checklist.md`.
7. Confirm the Discord redirect URL is `${PUBLIC_BASE_URL}/auth/discord/callback`.
8. Run `npm run admin:roles:write` and confirm `db/generated-admin-roles.sql` has the expected account IDs.
9. Keep `PUBLIC_WRITE_PAUSED=true` ready as the emergency brake, but set it to `false` for launch.

## After deployment

1. Open `/healthz`, `/readyz`, `/status`, `/status.json`, and `/api/health`.
2. Open `/guidelines.html` and confirm the public rules page loads.
3. Run:

```powershell
$env:LIVE_BASE_URL="https://YOUR-PUBLIC-URL"
npm run deploy:verify
```

4. Confirm `deploy:verify` checks `/api/state` ad slots and `security.txt` public contact.
5. Log in with Discord.
6. Open `管理`.
7. Export the first production backup.
8. Open `一般公開判定` and confirm no `停止` items.
9. Open `公開直前チェック` and copy the memo.
10. Open `インシデント共有` and confirm it is not `要対応`.
11. Create or enable a short public announcement.
12. Manually test one recruitment, one free-talk thread, one reply, one like, one DM, one report, and one inquiry.

## First public share

Share to a small audience first. Use the `X告知` or `Discord告知` template from `一般公開判定`.

For the first 30 minutes:

- Watch `運用ダイジェスト`.
- Watch `インシデント共有`; use `利用者向けお知らせ` for public status posts if launch issues appear.
- Watch `公開運用レポート`.
- Watch `/healthz`, `/readyz`, `/status`, `/status.json`, and `/api/health`.
- Keep the hosting dashboard open.
- Do not increase traffic while errors, reports, DM reports, deletion requests, or login problems are unresolved.

## Emergency brake

If posting, DM, spam, unsafe content, or server errors become hard to control:

1. Set `PUBLIC_WRITE_PAUSED=true` in the hosting environment.
2. Add an admin announcement that posting is temporarily paused.
3. Export a backup.
4. Copy `インシデント共有` so the pause reason is preserved. Keep `内部引き継ぎ` with the operator notes.
5. Handle reports, DM reports, and deletion requests.
6. Run `npm run deploy:verify` after the fix.
7. Copy `インシデント共有` again and confirm it no longer shows `要対応`; if users were notified, post the updated `利用者向けお知らせ`.
8. Set `PUBLIC_WRITE_PAUSED=false` only after posting, replies, likes, DMs, reports, inquiries, and backups work again.

## If Codex is unavailable

Use these documents in order:

1. `docs/env-setup-checklist.md`
2. `docs/public-release-final-checklist.md`
3. `docs/launch-day-runbook.md`
4. `docs/public-operations-runbook.md`
5. `docs/restore-guide.md`
