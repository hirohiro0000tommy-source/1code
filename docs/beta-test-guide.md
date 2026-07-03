# Beta test guide

Use this when inviting a small group to test 1code before public launch.

## Message for testers

1code is a game-friend recruiting board currently in beta.

Please try:

- Complete the in-app beta checklist.
- Use `βクイックスタート` if you are unsure where to begin.
- Create a recruitment post.
- Reply to another post.
- Like and unlike a post.
- Join and leave a recruitment.
- Open a recruiter profile from a recruitment and send a DM if you are comfortable testing messages.
- Confirm the My Page badge appears when there is a new DM, then clears after opening My Page.
- Open the free-talk page and create a thread.
- Use search and filters to find posts.
- Open the site on mobile if possible.
- Report anything that feels unsafe or confusing.
- Send feedback from the inquiry page using the `βフィードバック` category.

If an error message appears, copy the error ID and include it in the inquiry form.
If the error message shows `問い合わせへ`, use it so the error ID is filled automatically.
After sending feedback, keep the displayed `受付ID` if you need to follow up later.

## What to share

- Site URL:
- Beta access code:
- Test period:
- Contact point:

## What to ask

- Was it easy to understand where to post?
- Was it easy to find a game or category?
- Did any text feel unclear?
- Did anything feel unsafe?
- Did DM feel easy to find, reply to, and report if needed?
- Did any button or page feel hard to use on mobile?
- Would you use this to find people to play with?

## Operator checklist

- Set `BETA_ACCESS_CODE`.
- Run `npm run secrets` if you need fresh values for `ADMIN_PIN`, `SESSION_SECRET`, or `BETA_ACCESS_CODE`.
- Confirm hosting env vars include `NODE_ENV`, `ADMIN_ACCOUNT_IDS`, `SESSION_SECRET`, `PUBLIC_BASE_URL`, and `BETA_ACCESS_CODE`.
- Run `npm run beta:prelaunch` before inviting testers.
- Run `node scripts/beta-readiness-check.js`.
- Confirm closed beta pages return `noindex` while `BETA_ACCESS_CODE` is set.
- Confirm posting without the code is blocked.
- Confirm posting with the code works.
- Confirm `βクイックスタート` appears after the beta access code is accepted.
- Confirm the post-created message includes `感想を送る` during beta.
- Confirm `感想を送る` opens a beta feedback draft with `分かりやすかった点` and `迷った点` prompts.
- Confirm an error toast can open the inquiry form with the error ID and a bug-report draft filled in.
- Confirm the admin inquiry queue shows `βフィードバック`.
- Confirm unresolved beta feedback appears above other inquiries.
- Confirm the admin stats show `未対応βFB`, `高優先未対応`, `高優先βFB`, and `24hβFB`.
- Confirm the beta feedback prompt opens the inquiry form with `βフィードバック` selected.
- Confirm the inquiry form shows a `受付ID` after feedback is sent.
- Confirm the admin panel shows `β公開判定`.
- Confirm the admin system panel shows `β公開準備`.
- Review the `β日次レポート` panel after each test day.
- Copy `日次メモ` from `β日次レポート` into your private operator notes or Discord admin channel.
- Start from `優先対応キュー` in `β日次レポート`; clear `高` items before asking testers for more actions.
- Start with `今日の確認`, then handle reports, beta feedback, and blocked content in that order.
- For DM reports, review the DM preview and conversation ID, then choose reject, account stop, or `DMを非表示`.
- Confirm hidden DMs appear in `削除履歴` as `DM` and can be restored when a moderation action was mistaken.
- Keep the restore guide open before restoring backups that include DM reports, hidden DMs, or deleted items.
- Confirm the My Page DM badge clears after opening My Page and appears again only for newer conversations.
- Use `テスターへの声かけ` to decide the next short request to send to testers.
- Check `対応待ち24h+` and clear any report or inquiry that has been open for more than one day.
- Check `反応率` and `反応なし` to see whether new posts are getting replies, likes, or participation.
- Use `反応なし投稿` as the list of posts to boost or ask testers to reply to.
- Before inviting testers, open `β公開判定` and clear all `停止` items.
- Check `広告差し替え` in `β公開判定`; placeholder ads are acceptable for closed beta, but not for public launch.
- Use `β成功指標` as the small-beta health score. Before expanding invites, aim for at least `継続検証` with tester actions, posts, responses, participation, and beta feedback moving together.
- Review `伸びている投稿` in `β日次レポート`; use those posts as examples when asking testers to reply, like, or join.
- Use `バックアップ取得` in the admin panel before inviting testers.
- Keep the `バックアップ経過` value in `β公開判定` within 7 days during beta.
- Use the `招待文テンプレート` in `β公開判定`, then send the beta access code separately.
- Use `テスターへの追いメッセージ` in `β公開判定` for the first-day request, reaction boost, and feedback reminder.
- After inviting testers, check `参照元` in the system panel and `招待URL訪問` in `β公開判定` for `beta-invite` visits.
- After inviting testers, check `βテスター進捗` in `β公開判定` to see how many testers created a recruitment, created a free-talk thread, sent beta feedback, and moved from invite visit to action.
- Use `進捗の詰まり` in `β公開判定` to decide whether to ask for recruitment posts, free-talk posts, or beta feedback next.
- Save beta feedback triage as `不具合`, `UI改善`, `要望`, `保留`, or `対応不要`, set priority to `高`, `中`, or `低`, then resolve it only after deciding the next action.
- Use quick triage buttons for common beta feedback, then edit manually only when the note needs more context.
- Check `最近対応したβフィードバック` after resolving items so product decisions do not disappear from the admin workflow.
- Use the admin inquiry search to find feedback by `受付ID`, error ID, name, category, or message; turn on `対応済みも表示` only when checking past decisions.
- Review `β改善バックログ`, `対応状況`, `優先度別`, and `次の修正候補` before deciding the next product fixes.
- Copy `修正候補` from `β改善バックログ` into your operator notes before starting a fix pass.
- Check the `バックアップ` item in `β日次レポート`; use `バックアップ取得` if it is missing or older than 7 days.
- Review reports and inquiries at least once per day during beta.
- Review `注意アカウント` in the daily report when reports or automatic blocks increase.
- Review `429制限` and `直近429制限` in the system panel when testers report posting problems or repeated actions increase.
- Keep a backup before changing beta settings.
