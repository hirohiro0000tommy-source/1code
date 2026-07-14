# Public release final checklist

Use this after the closed beta is stable and before posting the public URL widely.

For the launch-day sequence, use `docs/launch-day-runbook.md` after this checklist is clear.

## Local final gate

Open `管理` and check `公開直前チェック`. Copy the memo if you want a short launch note for the day.

Run these in `outputs\partyfinder-production`:

```powershell
npm run launch:today
npm run release:final
npm run config:check
npm run backup:drill
```

`launch:today` runs the local final gate, prints the safe environment plan, and shows the remaining manual dashboard steps. `release:final` runs public prelaunch, beta prelaunch, Postgres readiness, and a safe production config advisory. Do not continue if either fails.
When `config:check` shows warnings or failures, follow the printed `Next actions` first. It does not print secret values.

## Hosting settings

- `NODE_ENV=production`
- `STORAGE_DRIVER=postgres`
- `DATABASE_URL` points to the real production database and does not use an `example.com` host or `user:password` placeholder credentials
- `DATABASE_SSL=true`; production startup is blocked if Postgres SSL is missing or false
- `PUBLIC_BASE_URL` is the final public `https://` origin only, such as `https://your-domain.example`, with no path or query
- `PUBLIC_SECURITY_CONTACT` is a real public contact for `security.txt`, not an `example.com`, `example.org`, or `example.net` placeholder
- `ADMIN_PIN` is generated, private, and at least 16 characters
- `ADMIN_ACCOUNT_IDS` contains at least one trusted `discord:numeric-id` account ID
- `MODERATOR_ACCOUNT_IDS` contains only trusted `discord:numeric-id` helper account IDs, if used
- Run `npm run admin:roles:write`, review `db/generated-admin-roles.sql`, and apply it after the production profiles exist
- `SESSION_SECRET` is long and unique
- `BETA_ACCESS_CODE` is blank when public posting should be open
- `BETA_WRITE_PAUSED=false`
- `PUBLIC_WRITE_PAUSED=false`
- `ENABLE_SEED_DATA=false`
- `DISCORD_CLIENT_ID` is the numeric production Discord application client ID and `DISCORD_CLIENT_SECRET` is the real production secret, not a placeholder
- `RELEASE_VERSION` and `COMMIT_SHA` are set when the hosting provider can supply them

## External service checks

Use `docs/external-service-work-order.md` as the account-operation handoff while setting these up.

- Supabase/Postgres schema has been applied from `db/schema.sql`.
- Supabase access rules have been applied from `db/rls.sql`, if using Supabase.
- Staff roles have been applied from the reviewed `db/generated-admin-roles.sql`.
- Discord redirect URL is `${PUBLIC_BASE_URL}/auth/discord/callback`.
- `/.well-known/security.txt` shows the real public security contact.
- `npm run deploy:verify` confirms `security.txt` does not use an example or local contact.
- Render or the hosting service uses the production environment values above.
- `npm run config:check` has been run in the production environment without strict failures.
- The first production backup has been exported from `管理`.
- Ad slots have real labels and `https://` public target URLs, or unused slots are disabled.

## Live URL check

After deployment:

```powershell
$env:LIVE_BASE_URL="https://YOUR-PUBLIC-URL"
npm run deploy:verify
```

Also open the site manually and confirm:

- Home loads without local sample posts.
- `/guidelines.html` opens and explains posting, DM, reporting, and prohibited behavior.
- `/status` opens as a readable public service-status page.
- `npm run deploy:verify` passes with `LIVE_BASE_URL` and confirms status responses include request IDs.
- `npm run deploy:verify` confirms public ad slots from `/api/state` have no placeholder labels, unsafe HTML, or non-https target URLs.
- `/sitemap.xml` includes the home page, guidelines, terms, privacy, and public share pages.
- `/status.json` shows the expected public mode and release identity.
- Discord login returns to the site.
- `公式ボット投稿` can publish `おすすめだけ公開` launch-day examples, and public cards show `見本` and `公式` labels.
- Recruitment post, free-talk thread, reply, like, and DM work.
- Report and inquiry submission work.
- `管理` opens for the configured admin account.
- `一般公開判定` has no `停止` items.
- `公開運用レポート` can be copied.
- `公開運用レポート` shows `広告URL確認` as 0 and `広告未差替` is acceptable for the launch plan.

## First 30 minutes after sharing

- Watch `管理` -> `運用ダイジェスト`.
- If the feed is quiet, use `おすすめだけ公開` first. Add more clearly labeled official examples only when the feed still needs them; do not post as ordinary users.
- Watch `広告未差替` and `広告URL確認`; pause ad rollout if either changes unexpectedly.
- Watch `/api/health`.
- Keep `PUBLIC_WRITE_PAUSED=true` ready as the emergency brake.
- Do not increase traffic while reports, DMs, inquiries, or 5xx errors are unresolved.
