# Beta operator handoff

Use this when Codex cannot continue and the closed PC browser beta needs to be published or operated manually.

## Permission needed

Codex cannot complete these steps without your account login or approval:

- create the Supabase/Postgres project
- create or deploy the Render Web Service
- create the Discord Developer Portal app
- paste secret environment variables into hosting dashboards
- share the beta URL, invite text, or `BETA_ACCESS_CODE` publicly

## Current beta status

The local gate should pass before publication:

```powershell
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\beta-prelaunch-check.js
```

If it passes, the remaining blockers are external setup, real `https://` URL verification, and a small live tester check.

## Minimum launch flow

1. Run `scripts\generate-secrets.js` and save `ADMIN_PIN`, `SESSION_SECRET`, and `BETA_ACCESS_CODE`.
2. Create Supabase/Postgres, then run `db/schema.sql` and `db/rls.sql`.
3. Deploy the app on Render with `STORAGE_DRIVER=postgres`.
4. Create a Discord app and set `https://YOUR-RENDER-URL/auth/discord/callback`.
5. Fill every required environment variable from `docs/env-setup-checklist.md`.
6. Open `/api/health` and `/status.json`; confirm health is ready and status is `beta`.
7. Run `npm run deploy:verify` with `LIVE_BASE_URL=https://YOUR-RENDER-URL`.
8. Open `管理` -> `β公開判定` and confirm there are no stop items.
9. Open `管理` -> `バックアップ取得` and save the first production backup.
10. Invite only 3 to 5 trusted PC browser testers.

## Public release switch

Use this after the small beta has enough real posts, replies, reports, and feedback to judge the service.

1. Resolve open reports and high priority beta feedback.
2. Export a fresh backup.
3. Replace placeholder ad slots or disable them, then confirm `公開運用レポート` shows `広告URL確認` as 0.
4. Remove `BETA_ACCESS_CODE` from the hosting environment when public posting should open.
5. Keep `BETA_WRITE_PAUSED=false`.
6. Keep `PUBLIC_WRITE_PAUSED=false`.
7. Open `管理` -> `一般公開判定` and confirm there are no stop items.
8. Run `npm run deploy:verify` with `LIVE_BASE_URL=https://YOUR-PUBLIC-URL`.
9. Share the public URL only after `一般公開判定`, `/api/health`, `/status.json`, and `deploy:verify` are all clear.

## Tester invite message

```text
1code（ワンコード）のPCブラウザβテストを少人数で始めました。
ゲーム仲間募集とフリートークの掲示板です。

URL: https://YOUR-RENDER-URL/
βコード: 別メッセージで送ります

確認してほしいこと:
- 募集を投稿できるか
- フリートークに投稿・返信できるか
- いいね、返信、DM、通報が使えるか
- わかりにくい場所や不安な場所がないか

不具合はサイト内の「お問い合わせ」から送ってください。
```

Send the beta code separately so the URL alone does not open posting to everyone.

## 5-minute operation

Check these once per day during beta:

- `運用ダイジェスト`: handle the top `優先対応` items first
- `β公開判定`: stop items first
- `一般公開判定`: blockers before moving from beta to public release
- `β日次レポート`: handle `優先対応キュー` from high priority
- `通報` and `未対応DM通報`: respond within 24 hours
- `お問い合わせ`: use `リクエスト照合`, `返信下書き`, and `内部メモ` for support handoff; handle `削除依頼` by opening `対象データ確認`, checking the account counts, exporting a backup, then using `データ処理` only after the exact account ID is confirmed
- `β改善バックログ`: fix high-impact confusion before adding new features
- `バックアップ`: export again if the latest backup is missing or older than 7 days

See `docs/public-operations-runbook.md` for the longer daily and emergency routine.

## Emergency pause

Use this when spam, unsafe DMs, broken login, or data problems appear:

1. Change `BETA_ACCESS_CODE` in Render and do not share the new value.
2. Set `BETA_WRITE_PAUSED=true` in Render to stop ordinary posts, replies, likes, joins, and DMs.
3. Add an admin announcement that beta invitations are paused.
4. Export a backup before editing data.
5. Check reports, DM reports, and recent audit logs.
6. Resume invitations only after `/api/health`, posting, replies, DMs, reports, and backups work again.
7. Set `BETA_WRITE_PAUSED=false` when it is safe to reopen posting.

For a public release emergency, set `PUBLIC_WRITE_PAUSED=true` instead of changing `BETA_ACCESS_CODE`. This keeps browsing, reports, inquiries, and admin actions available while ordinary public posting is paused.
