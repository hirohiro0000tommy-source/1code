# Prelaunch checklist

Use this before sharing 1code with real users.

## Required

- Run `npm install`.
- Run `npm run secrets` if production secret values have not been generated yet.
- Fill hosting environment variables using `docs/env-setup-checklist.md`.
- Run `npm run beta:prelaunch` before inviting beta testers.
- Set `ADMIN_PIN` to a private value.
- Set `ADMIN_ACCOUNT_IDS` to at least one trusted admin account ID.
- Set `MODERATOR_ACCOUNT_IDS` if anyone besides admins will help with moderation.
- Set `SESSION_SECRET` to a long private random value.
- Confirm `SESSION_SECRET` is at least 32 characters.
- Set `NODE_ENV=production` on the public server.
- Set `STORAGE_DRIVER=postgres` for public production.
- Set `DATABASE_URL`.
- Set `DATABASE_SSL` for the production Postgres provider.
- Set `PUBLIC_BASE_URL` to the public `https://` URL, not localhost.
- Set `DISCORD_CLIENT_ID`.
- Set `DISCORD_CLIENT_SECRET`.
- Set `BETA_ACCESS_CODE` if this is a closed beta.
- Set `PUBLIC_WRITE_PAUSED=false` before public launch.
- Confirm `render.yaml` or the hosting dashboard includes every key from `.env.example`.
- Register `/auth/discord/callback` in the Discord Developer Portal.
- Apply `db/schema.sql`.
- Apply `db/rls.sql`.
- Run `npm run admin:roles:write`, review `db/generated-admin-roles.sql`, and apply it.
- Confirm `npm run postgres:check` catches unreplaced staff-role placeholder account IDs.
- Confirm the `moderation_events` table exists after applying the schema.
- Confirm the `deleted_items` table exists after applying the schema.
- Import `db/import-from-json.sql` only if you want to carry local demo data into production.
- Run `npm run preflight`.
- Run `npm run public:prelaunch` before a wider public release.
- Run `npm run postgres:check` after `DATABASE_URL` is set.
- After deployment, set `LIVE_BASE_URL` to the public URL and run `npm run deploy:verify`.
- Run `npm run smoke`.
- Create a fresh backup.
- Confirm `/healthz` returns `ok`.
- Confirm `/readyz` returns readiness JSON.
- Confirm `/status.json` returns `open`, `beta`, or `paused`.
- Confirm `/api/health` returns `ready`, memory, runtime, and data counts.
- Confirm `npm run deploy:verify` passes against the deployed `https://` URL before sharing it.
- Confirm `docs/public-operations-runbook.md` is available before launch week.

## Admin setup

- Open the admin tab.
- Confirm the dashboard loads.
- Confirm `運用ダイジェスト` loads and shows priority actions.
- Confirm an account listed in `ADMIN_ACCOUNT_IDS` can open admin data without using the shared PIN.
- Confirm an account listed in `MODERATOR_ACCOUNT_IDS` can open reports but cannot open system settings.
- Confirm reports load.
- Confirm reply reports load and a reported reply can be deleted without deleting the whole post.
- Confirm DM reports load, show a message preview and conversation ID, and can be rejected or handled.
- Confirm a reported DM can be hidden, appears in deleted items as `DM`, and can be restored.
- Confirm a harmless report can be rejected and recorded in audit logs.
- Confirm a temporary suspension expires correctly and internal notes are visible only in admin views.
- Confirm ad slots load.
- Confirm `広告未差替` is 0 before public launch.
- Confirm unsafe ad URLs and ad HTML are not accepted as executable content.
- Confirm moderation events load.
- Confirm deleted items load and a deleted reply can be restored.
- Confirm backup export works.
- Confirm audit logs record admin actions.

## User experience

- Confirm the beta access panel appears when `BETA_ACCESS_CODE` is set.
- Confirm the in-app beta checklist appears after the beta access code is accepted.
- Confirm `βクイックスタート` appears after the beta access code is accepted.
- Confirm the admin panel shows `β公開判定`.
- Confirm the admin panel shows `一般公開判定`.
- Confirm `β公開判定` shows `βテスター進捗` and `招待URL訪問`.
- Confirm `β公開判定` shows `バックアップ経過`.
- Confirm `一般公開判定` shows `一般公開モード`, `シード投稿`, `未対応通報`, `バックアップ`, and `広告枠`.
- Confirm `一般公開判定` shows `投稿停止` as `通常`.
- Confirm the admin system panel shows `β公開準備`.
- Confirm the admin system panel shows `セッション鍵長` and `DB SSL`.
- Confirm the admin system panel shows `ログ保持`.
- Confirm the admin panel shows `β日次レポート`.
- Confirm `β日次レポート` has a copyable `日次メモ`.
- Confirm `β日次レポート` shows `優先対応キュー`.
- Confirm `β日次レポート` shows `対応待ち24h+`.
- Confirm the admin panel shows `β改善バックログ`.
- Confirm `β改善バックログ` shows `次の修正候補`.
- Confirm `β改善バックログ` shows `対応状況` and `優先度別`.
- Confirm testers can submit `βフィードバック` inquiries.
- Confirm the beta feedback prompt opens the inquiry form.
- Confirm the post-created message can open the `βフィードバック` form during beta.
- Confirm an error toast can open the inquiry form with the error ID and a bug-report draft filled in.
- Confirm beta feedback can be classified and prioritized without resolving.
- Confirm recruitment template buttons fill the form correctly.
- Confirm free-talk template buttons fill the form correctly.
- Confirm unfinished recruitment and free-talk drafts restore after reloading.
- Confirm drafts are cleared after successful posting.
- Confirm game activity chips filter recruitments correctly.
- Confirm free-talk activity chips filter categories correctly.
- Confirm share links copy from the post-created message and from each post.
- Confirm shared recruitment and free-talk pages include OGP image metadata.
- Confirm the safety guidance strip is visible near the top of the app.
- Confirm `利用規約` explains prohibited conduct, DM/contact caution, moderation, deletion requests, ads, and external links.
- Confirm `プライバシー` explains saved data, Discord login, DM/report handling, data export, deletion requests, ads/Cookie, and retention.
- Confirm the footer links open terms, privacy, inquiry, admin, and RSS without hiding the main posting flow.
- Confirm sending a DM from a recruiter profile creates a My Page message thread.
- Confirm the My Page DM badge appears for new DM conversations and clears after opening My Page.
- Confirm マイページの `データ確認` shows the user's own data counts.
- Confirm `データを保存` downloads a JSON file for the current browser account.
- Confirm `削除依頼へ` opens the inquiry form with account information filled in.
- Confirm submitted deletion requests appear under `未対応削除依頼` in the admin inquiry queue.
- Confirm `対象データ確認` shows the target account's data counts before resolving the deletion request.
- Confirm `データ処理` requires the exact account ID and then removes that account's posts, replies, visible DMs, likes, and join entries.
- Confirm resolving a deletion request records a short 対応メモ and keeps it visible in the resolved inquiry list.
- Confirm DM forms show a short reminder not to share unnecessary external IDs or personal information.
- Confirm users can report received DMs but cannot report their own sent DM.

## Ads and monetization

- Replace placeholder ad text before public launch.
- Confirm `β公開判定` shows `広告差し替え` as OK before public launch.
- Confirm `一般公開判定` shows `広告枠` as OK before public launch.
- Confirm `公開運用レポート` shows `広告URL確認` as 0 before public launch.
- Confirm `β成功指標` is at least `継続検証`; if it remains `初期検証`, invite fewer new testers and focus on replies, participation, and feedback collection first.
- Confirm `β日次レポート` shows `伸びている投稿`; if it is empty, prompt testers to react to existing posts before increasing traffic.
- Use only affiliate programs that allow your site category and region.
- Make sponsored links obvious to users.
- Confirm ad HTML does not require inline scripts or unsafe embeds.
- Use only public `https://` ad target URLs; local, http, javascript, data, file, and script-based targets must stay rejected.
- Keep backup copies of ad slot settings.

## Moderation

- Decide who can access the admin PIN.
- Review reports daily during launch week.
- Reject harmless reports instead of deleting content, so the audit trail stays clear.
- Review reply reports carefully before banning users.
- Review DM reports carefully; use `DMを非表示` before suspending an account unless the account clearly needs immediate action.
- Restore hidden DMs from deleted items when a moderation action was mistaken.
- Review `注意アカウント` in the beta daily report before suspending anyone.
- Review deleted items before permanent data cleanup.
- Check `ログ保持` before relying on old moderation or audit history.
- Review automatic moderation events daily during launch week.
- Tune rate limits if legitimate users are blocked too often.
- Do not delete audit logs during disputes.
- Keep the restore guide available before making large changes.

## Closed beta

- Prepare `docs/beta-test-guide.md` before inviting testers.
- Share the beta code only with invited testers.
- Confirm no-code write attempts return 403.
- Confirm valid-code posts, replies, reports, and inquiries work.
- Confirm valid-code DM sending and DM reporting work.
- Confirm closed beta `robots.txt` disallows indexing while `BETA_ACCESS_CODE` is set.
- Confirm the system panel shows `429制限` and can list `直近429制限`.
- Confirm the admin dashboard shows `未対応βFB`, `高優先未対応`, `高優先βFB`, and `24hβFB`.
- Confirm `β日次レポート` shows `反応率` and `反応なし`.
- Confirm `β日次レポート` shows `テスターへの声かけ`.
- Confirm `β日次レポート` shows long-open reports and inquiries in `対応待ち24h+`.
- Confirm `β公開判定` has no `停止` items before sharing the URL.
- Confirm `β公開判定` shows `βテスター進捗`, `招待URL訪問`, and visit-to-action conversion after inviting testers.
- Confirm `β公開判定` shows `進捗の詰まり` for invite dropoff and missing tester actions.
- Confirm `β公開判定` shows a recent backup export.
- Confirm the backup is less than 7 days old before inviting testers.
- Confirm the `β公開判定` invite template does not include the access code.
- Confirm the invite template URL includes `?ref=beta-invite`.
- Confirm `β公開判定` shows copyable `テスターへの追いメッセージ`.
- Review `βフィードバック` inquiries daily and prioritize fixes as `高`, `中`, or `低`.
- Record repeated complaints as product tasks before broad launch.

## Go/no-go

Launch only when:

- smoke test passes
- preflight passes
- public prelaunch check passes
- live smoke check passes against the deployed URL
- `運用ダイジェスト` has no high-priority unresolved launch blockers
- `一般公開判定` has no stop items for a public launch
- duplicate and spam-like test posts are blocked
- backup exists
- admin PIN is not the default
- admin account IDs are configured
- session secret is not the local default
- Discord OAuth opens from the login button
- database is not local JSON storage
