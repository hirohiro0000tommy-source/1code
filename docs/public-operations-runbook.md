# Public operations runbook

Use this during beta and the first public launch week.

## Daily 5-minute check

1. Open `管理`.
2. Check `運用ダイジェスト` first.
3. Handle `優先対応` from top to bottom.
4. Check `インシデント共有`; copy `共有メモ`, `利用者向けお知らせ`, or `内部引き継ぎ` if a public status update or handoff is needed.
5. If `投稿停止` is `ON`, confirm whether `BETA_WRITE_PAUSED` or `PUBLIC_WRITE_PAUSED` should stay enabled.
6. If `未対応通報`, `未対応DM通報`, or `対応待ち24h+` is above 0, handle moderation before inviting more users.
7. Check `バックアップ状況`; if it is `未取得` or `要更新`, run `バックアップ取得` and compare the displayed `照合ID`.
8. Check `公開運用レポート` for traffic, 5xx, 429, silent posts, `広告未差替`, and `広告URL確認`. For repeated 429 reports, use the response `Retry-After` value and the admin recent 429 list to decide whether users should wait or a limit needs adjustment.
9. Check `β改善バックログ` before adding new features.
10. Open `/status` and run `npm run deploy:verify` with `LIVE_BASE_URL` when the site is deployed. This also confirms the public status responses include `x-request-id` for support tracing.

## First 30-minute watch

Use `管理` -> `公開運用レポート` -> `公開直後の監視` during the first small public share.

1. Keep `/healthz`, `/readyz`, `/status.json`, and `公開運用レポート` open.
2. In the first 10 minutes, confirm one recruitment, one free-talk thread, one reply, one like, one join, and one DM.
3. In the first 30 minutes, watch reports, DM reports, inquiries, 5xx, 429, and `広告URL確認`.
4. If you are unsure whether the site is safe to keep writable, set `PUBLIC_WRITE_PAUSED=true` and keep browsing, reports, inquiries, and admin actions available.

## Go slow conditions

Do not increase traffic or post public announcements when any of these are true:

- `運用ダイジェスト` shows high-priority moderation items.
- `インシデント共有` shows `要対応`.
- `運用ダイジェスト` or `お問い合わせ` shows unresolved deletion requests.
- `一般公開判定` has a `停止` item.
- `β公開判定` has a `停止` item during closed beta.
- `deploy:verify` fails against the deployed URL.
- `広告URL確認` is above 0, or a newly enabled ad slot still appears as `広告未差替`.

- Open reports or DMs have waited more than 24 hours.
- The latest backup is missing or older than 7 days.
- Users report login, posting, DM, or report submission failures.

## Deletion request handling

Use this when `お問い合わせ` shows `削除依頼`.

1. Open the inquiry and confirm the submitted account ID, request ID or error ID, and message.
2. Click `内部メモ` and keep the copied text with the support note or external issue tracker.
3. Click `返信下書き` if you need to acknowledge receipt to the user.
4. Click `対象データ確認` before changing anything.
5. Check the counts for posts, replies, visible DMs, likes, joins, reports, and inquiries.
6. Export a backup when the request affects real user content.
7. Click `データ処理` only after the target account is confirmed.
8. Type the exact account ID when asked. A mismatched ID must be treated as a stop signal.
9. Leave a short 対応メモ explaining what was processed.
10. Reopen `対象データ確認` and confirm remaining counts are expected.

The account erasure action removes owned recruitments, owned free-talk threads, replies, visible DM history, likes, join entries, active bans, and direct account links from reports or inquiries. It keeps a summary-only admin record for audit purposes. That summary cannot restore the erased content, so use it only after the target is clear.

## Emergency pause

For closed beta:

1. Set `BETA_WRITE_PAUSED=true`.
2. Keep `BETA_ACCESS_CODE` private or rotate it.
3. Add an admin announcement that posting is temporarily paused.
4. Confirm the public service-status strip says `投稿一時停止中`.
5. Export a backup before editing data.
6. Resolve reports, DM reports, and high-priority inquiries.
7. Run `npm run deploy:verify` after the fix.
8. Set `BETA_WRITE_PAUSED=false` only when posting, replies, DMs, reports, and backups work again.

For public release:

1. Set `PUBLIC_WRITE_PAUSED=true`.
2. Keep browsing, reports, inquiries, and admin actions open.
3. Add an admin announcement explaining that posting is paused.
4. Confirm the public service-status strip says `投稿一時停止中`.
5. Open `バックアップ状況`, export a backup, and keep the `照合ID`.
6. Handle `運用ダイジェスト` high-priority items.
7. Copy `インシデント共有` before and after the fix so the pause reason and recovery state are clear. Use `利用者向けお知らせ` for public posts and `内部引き継ぎ` when another operator takes over.
8. Run `npm run public:prelaunch` locally after the fix.
9. Run `npm run deploy:verify` against the deployed URL.
10. Set `PUBLIC_WRITE_PAUSED=false` only after both checks pass.

## Redeploy notes

- Hosting redeploys should send `SIGTERM`; the server stops accepting new requests and exits after existing requests finish.
- If a deploy hangs longer than the host timeout, check `/healthz`, `/readyz`, `/status`, and the latest server logs before sharing the URL again.

## Response targets

- Unsafe content or harassment report: same day.
- DM report: same day, preferably before more invitations.
- Login or posting failure: same day during beta. Use `リクエスト照合`, `内部メモ`, and `返信下書き` on the inquiry card so the user-facing reply and operator handoff stay consistent.
- High-priority beta feedback: triage within 24 hours.
- Deletion request: review identity and target within 24 hours.
- Ordinary feature request: batch into `β改善バックログ`.
- Backup: at least once before inviting testers and once per week after.

## Launch-week rhythm

- Day 1: invite 3 to 5 trusted testers only.
- Day 2: fix high-priority confusion before adding testers.
- Day 3: invite a few more testers only if `運用ダイジェスト` is calm.
- Day 4 to 7: keep traffic small until reports, DMs, feedback, and backups feel routine.

The site can grow after the moderation and backup routine feels boring. Boring is good here.
