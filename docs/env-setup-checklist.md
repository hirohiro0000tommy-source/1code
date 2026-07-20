# Environment setup checklist

Use this while filling environment variables in Render, Supabase hosting, or another production host.

## Generate private values

Run:

```powershell
npm run secrets
npm run secrets -- --write .env.local
npm run deploy:plan
```

Copy the generated values into the host dashboard:

- `ADMIN_PIN`
- `SESSION_SECRET`
- `BETA_ACCESS_CODE`
- `BETA_WRITE_PAUSED`
- `PUBLIC_WRITE_PAUSED`

Do not paste these values into docs, screenshots, chat, or source files.
Use `--write .env.local` when you want to keep the generated values in a local ignored file while filling the hosting dashboard. The command refuses to overwrite an existing file unless `--force` is added for an intentional rotation.

## Required beta / production variables

```text
NODE_ENV=production
STORAGE_DRIVER=postgres
DATABASE_URL=postgres://...
DATABASE_SSL=true
PUBLIC_BASE_URL=https://your-domain.example
PUBLIC_SECURITY_CONTACT=mailto:security@your-domain.example
ADMIN_PIN=generated-private-value
ADMIN_ACCOUNT_IDS=discord:123456789012345678
MODERATOR_ACCOUNT_IDS=
BETA_ACCESS_CODE=generated-beta-code
BETA_WRITE_PAUSED=false
PUBLIC_WRITE_PAUSED=false
HOT_TOPIC_BOT_ENABLED=false
HOT_TOPIC_BOT_INTERVAL_MINUTES=360
HOT_TOPIC_BOT_DAILY_LIMIT=2
ENABLE_SEED_DATA=false
MAX_REQUEST_BODY_BYTES=1000000
SERVER_REQUEST_TIMEOUT_MS=30000
SERVER_HEADERS_TIMEOUT_MS=10000
SERVER_KEEP_ALIVE_TIMEOUT_MS=5000
SESSION_SECRET=generated-session-secret
DISCORD_LOGIN_ENABLED=false
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
RELEASE_VERSION=production
COMMIT_SHA=
```

## Verify before inviting testers

- `PUBLIC_BASE_URL` starts with `https://`, is not localhost, and is the origin only, such as `https://your-domain.example` without a path, query, or trailing app route.
- `PUBLIC_SECURITY_CONTACT` is a public `mailto:` or `https://` contact and does not use `example.com`, `example.org`, or `example.net`.
- `DATABASE_URL` is the real production database URL, not an `example.com` host and not `user:password` placeholder credentials.
- `ADMIN_PIN` is generated, private, and at least 16 characters.
- `SESSION_SECRET` is at least 32 characters.
- `ADMIN_ACCOUNT_IDS` contains your own `discord:numeric-id` account ID, not `discord:your-discord-user-id` or another placeholder.
- `DISCORD_LOGIN_ENABLED=false` is acceptable for the first beta when Discord Developer Portal setup is blocked. Set it to `true` only after Discord OAuth works.
- `BETA_ACCESS_CODE` is shared only with invited testers.
- `BETA_WRITE_PAUSED=false` before inviting testers. Set it to `true` only for an emergency pause.
- `PUBLIC_WRITE_PAUSED=false` before public launch. Set it to `true` only when public posting must be paused.
- `HOT_TOPIC_BOT_ENABLED=false` is safest for the first public share. Set it to `true` only after the manual hot topic button feels right.
- `HOT_TOPIC_BOT_DAILY_LIMIT` keeps automatic topic posts from crowding out real users.
- `ENABLE_SEED_DATA=false` in production so local sample posts are not shown publicly.
- Request and timeout limits can usually stay at their defaults: `MAX_REQUEST_BODY_BYTES=1000000`, `SERVER_REQUEST_TIMEOUT_MS=30000`, `SERVER_HEADERS_TIMEOUT_MS=10000`, and `SERVER_KEEP_ALIVE_TIMEOUT_MS=5000`.
- `DISCORD_CLIENT_ID` is the numeric Discord application client ID, and `DISCORD_CLIENT_SECRET` is the real client secret. Do not leave `your-discord-client-id`, `your-discord-client-secret`, or `...` placeholders.
- Discord redirect URL is `${PUBLIC_BASE_URL}/auth/discord/callback`.
- `DATABASE_SSL=true` is required for production Postgres. Production startup is blocked if it is missing or set to another value.
- `RELEASE_VERSION` and `COMMIT_SHA` are optional public identifiers for checking which deployment is live.
- Hosting health checks use `/healthz`; use `/readyz` only for readiness dashboards because it may return 503 when configuration is incomplete.

## Final command

Run before deployment:

```powershell
npm run deploy:plan
npm run release:final
npm run config:check
```

Do not deploy or invite testers until `release:final` passes. `deploy:plan` and `config:check` print only safe status such as `set` or `missing`, not secret values. `config:check` is advisory on a local machine and strict when `NODE_ENV=production`; it also prints safe next actions and the Discord redirect URL once `PUBLIC_BASE_URL` is valid. For a closed beta-only check, you can also run `npm run beta:prelaunch`.

After the app is deployed, run the live URL check from your local terminal:

```powershell
$env:LIVE_BASE_URL="https://your-domain.example"
npm run deploy:verify
```

You can also run `npm run deploy:verify -- https://your-domain.example`.

`deploy:verify` runs `status:check` for a quick public health check and `live:check` for the fuller deployed-site check. Use the public origin only, with no path, query, or callback URL. `LIVE_BASE_URL` is only needed for these local check commands. It does not need to be saved in the hosting dashboard.
