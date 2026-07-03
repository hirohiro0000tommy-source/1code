# 1code

1code（ワンコード）は、ゲーム仲間募集とフリートークを気軽に投稿できる掲示板です。

## What changed from the single HTML demo

- Runs with a small Node.js server.
- Saves recruitments, chat threads, likes, and replies in `data/db.json`.
- Has a storage adapter boundary in `storage/json-store.js`.
- Supports `STORAGE_DRIVER=json` through `storage/index.js`.
- Supports `STORAGE_DRIVER=postgres` through `storage/postgres-store.js`.
- Includes PostgreSQL/Supabase schema draft in `db/schema.sql`.
- Includes Supabase access-rule draft in `db/rls.sql`.
- Can export the local JSON data into `db/import-from-json.sql`.
- Supports one-like-per-account with click again to unlike.
- Recruitment owners can close and reopen their own recruitment posts.
- Recruitments support capacity and join/leave interest.
- Includes a my page for owned recruitments, joined recruitments, and owned chat threads.
- Includes a reminder page for liked or replied items.
- Keeps recruitment and chat as separate pages.
- Uses a backend API so it can later be replaced with Supabase/Postgres.
- Reserves affiliate ad slots on left rail, right rail, and inline feed.
- Admins can inspect reports, suspend users, and edit ad slots from the `管理` tab.
- Admin actions are saved to an audit log.
- Admins can view a compact operations dashboard.
- Admins can view system health, runtime settings, beta launch checks, and public launch checks.
- Admins can view and copy a final public-release checklist from the management screen.
- Health checks expose readiness, memory, data counts, and last read/write timestamps.
- Includes a support inquiry form and admin inquiry queue.
- Lets users review and download their own account data from my page.
- Lets admins inspect deletion-request account data and run confirmed account data erasure.
- Lets admins classify beta feedback, set priority, and review next fix candidates.
- Includes admin-managed public announcements and maintenance notices.
- Shows a small public service-status strip during beta access mode or posting pauses.
- Blocks cross-site write requests for posting and admin actions.
- Validates affiliate ad target URLs and strips unsafe ad HTML.
- Writes local JSON data through an atomic temp-file rename.
- Adds SHA-256 checksums to backups and includes a backup verification script.
- Supports admin access by configured account IDs through `ADMIN_ACCOUNT_IDS`.
- Supports moderator access by configured account IDs through `MODERATOR_ACCOUNT_IDS`.
- Includes OGP/Twitter share metadata and a default share image.
- Shows a user-facing safety strip for privacy and reporting guidance.
- Shows game/category activity chips so active areas can be opened quickly.
- Includes recruitment and free-talk templates to lower the posting barrier.
- Keeps recruitment and free-talk drafts in the browser until successful posting.
- Serves app JS/CSS with `no-cache` so redeploys are picked up quickly.
- Blocks short-window duplicate posts, replies, and direct messages.
- Returns `Retry-After` and `X-RateLimit-*` headers on 429 responses so clients and operators can see when posting can resume.

## Run locally

```powershell
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" outputs\partyfinder-production\server.js
```

Then open:

```text
http://localhost:8787
```

If the server is already running, stop it with `Ctrl + C` in PowerShell, then run the command again so code changes are loaded.

## Local admin

- Open the `管理` tab.
- Enter the admin PIN.
- Local default PIN: `admin`
- In production, set `ADMIN_PIN` as an environment variable.

## Configuration

Copy `.env.example` into your hosting provider's environment settings.

```text
PORT=8787
NODE_ENV=development
ADMIN_PIN=change-this-before-public-release
ADMIN_ACCOUNT_IDS=
MODERATOR_ACCOUNT_IDS=
BETA_ACCESS_CODE=
BETA_WRITE_PAUSED=false
PUBLIC_WRITE_PAUSED=false
ENABLE_SEED_DATA=false
SESSION_SECRET=change-this-random-session-secret
STORAGE_DRIVER=json
DATABASE_URL=postgres://user:password@host:5432/partyfinder
DATABASE_SSL=true
PUBLIC_BASE_URL=http://localhost:8787
PUBLIC_SECURITY_CONTACT=mailto:security@example.com
RELEASE_VERSION=local
COMMIT_SHA=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

Set `BETA_ACCESS_CODE` during a closed beta when you want the site to be readable by anyone with the URL but writable only by invited testers. Leave it blank to disable the gate.
Set `RELEASE_VERSION` and `COMMIT_SHA` when your hosting provider can expose them; they appear in `/status.json` and the admin system panel.
Set `BETA_WRITE_PAUSED=true` only for an emergency pause that keeps browsing, reports, inquiries, and admin actions available while stopping ordinary user posts.
Set `PUBLIC_WRITE_PAUSED=true` after public launch when you need to stop ordinary posts, replies, likes, joins, and DMs without closing reports, inquiries, browsing, or admin actions.
Keep `ENABLE_SEED_DATA=false` in production so public users do not see local sample posts.
Use `docs/beta-test-guide.md` as the invitation and feedback checklist for early testers.
Run `npm run secrets` to generate strong candidate values for `ADMIN_PIN`, `SESSION_SECRET`, and `BETA_ACCESS_CODE`.
Use `docs/env-setup-checklist.md` while filling the hosting provider environment settings.

For local PowerShell testing:

```powershell
$env:ADMIN_PIN="admin"
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
```

## Quick product check

Before deploying or after large edits, run:

```powershell
cd outputs\partyfinder-production
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\beta-prelaunch-check.js
```

The beta prelaunch check runs syntax checks, preflight, beta readiness, and smoke test in order. You can also run the pieces manually:

```powershell
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\preflight-check.js
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\beta-readiness-check.js
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\smoke-test.js
```

Before moving from beta to a wider public release, run:

```powershell
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\public-prelaunch-check.js
```

The public prelaunch check runs syntax checks, preflight, public readiness, and smoke test in order. It confirms the general public launch decision, production demo-data gate, placeholder ad hiding, Postgres requirement, public HTTPS URL requirement, admin account requirement, Discord requirement, and support handoff are covered.
The management screen also shows `公開直前チェック`, which summarizes hosting settings, live URL checks, and the first 30 minutes after sharing the public URL.

For the final local pass before deployment, run:

```powershell
npm run launch:today
npm run launch:packet
npm run deploy:plan
npm run release:final
npm run config:check
npm run backup:drill
```

`launch:today` is the shortest launch-day command: it runs the final local gate, prints the safe deployment environment plan, and lists the manual account/dashboard steps still required. `launch:packet` writes `dist/launch-packet.md`, a local operator packet with safe environment status, external setup order, stop signals, and launch references. The other commands are useful when you want to run each check separately. If `DATABASE_URL` is not set locally, the Postgres check is skipped unless production/Postgres mode is enabled. `deploy:plan`, `config:check`, and `launch:packet` print or write only redacted status such as `set` or `missing`.

After deployment, verify the live public URL:

```powershell
$env:LIVE_BASE_URL="https://your-domain.example"
npm run deploy:verify
```

You can also pass the URL directly:

```powershell
npm run deploy:verify -- https://your-domain.example
```

The deployed verification command runs `status:check` and `live:check`. It confirms `/healthz`, `/readyz`, `/status`, `/status.json`, `/api/health`, the home page, terms, privacy, community guidelines, manifest, `security.txt`, `robots.txt`, `sitemap.xml`, and `feed.xml` are reachable from the deployed domain.
It also confirms key public responses include `x-request-id`, so production support reports can be matched against server history.
Use the public origin only, such as `https://your-domain.example`, with no path, query, or callback URL.

This starts a temporary local server and checks posting, liking, unliking, chat threads, reports, and the admin report list.
The beta readiness check confirms the closed-beta gate, beta tester UI, daily report, and improvement backlog are present before inviting testers.
The beta feedback workflow lets admins save triage separately from resolving the inquiry, so high-priority unresolved items stay visible.
It checks recruitment close and reopen as well.
It checks recruitment capacity and join/leave interest as well.
It checks ownership flags used by the my page as well.
It also checks user suspension, ad-slot editing, and audit logging.
It checks the admin stats endpoint as well.
It checks the admin system health endpoint as well.
It checks support inquiry submission and resolution as well.
It checks user data export, deletion request inspection, and confirmed account erasure as well.
It checks public announcement creation, hiding, and deletion as well.
It checks admin backup export as well.
Front-end checks should also confirm template buttons, draft restore, activity chips, and share-link copy behavior.

See `docs/prelaunch-checklist.md` before sharing the app with real users.
See `docs/public-release-final-checklist.md` for the final host, database, Discord, and live URL checks before a wider public release.
See `docs/launch-day-runbook.md` for the launch-day stop points, deployment sequence, first share, and emergency brake.
See `docs/external-service-work-order.md` while operating Supabase/Postgres, Discord, and Render dashboards.

## Health checks

Use this endpoint for simple uptime monitoring:

```text
GET /healthz
```

It returns plain `ok` when the Node.js process can answer requests.

Use this endpoint for readiness monitoring:

```text
GET /readyz
```

It returns a compact JSON readiness result and uses HTTP 503 when the app is reachable but not ready.

Use this endpoint for safe public status checks:

```text
GET /status.json
```

It returns the public service mode (`open`, `beta`, or `paused`), release identity, and a readiness flag without exposing secrets.

For a quick deployed status check:

```powershell
$env:LIVE_BASE_URL="https://YOUR-PUBLIC-URL"
npm run status:check
```

This checks `/healthz`, `/status`, and `/status.json`, including request ID headers on the public status responses.

Use this endpoint for detailed runtime checks:

```text
GET /api/health
```

It returns readiness, storage mode, uptime, memory usage, request counts, status-code counts, recent request history, data counts, last read/write timestamps, and the latest server error message if one occurred.
Every response includes an `x-request-id` header, and recent request/error history includes the same ID so a user-facing problem can be matched with the admin system view. In production, unexpected 500 responses return a generic `internal server error` message with the request ID instead of exposing internal details.
429 responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`, while the admin system panel keeps a recent 429 list for support triage.
The front end also shows failed operations in a compact error toast. When a request ID is available, users can copy it and include it in the inquiry form's error ID field, while admins can match it against the system request history.
The admin system panel separates recent errors from ordinary request history, making it easier to find the matching request ID and path during support triage.

## Deployment files

- `Dockerfile` can run the app in a standard container.
- `render.yaml` is a starter configuration for Render.
- Render health checks use `/healthz`.
- The server handles `SIGTERM` and `SIGINT` with a short graceful shutdown for redeploys and local stops.
- `docs/web-beta-launch-quickstart.md` is the shortest path for publishing a closed PC browser beta.
- `docs/operator-handoff.md` is the manual handoff for publishing and operating the beta while Codex is unavailable.
- `docs/public-operations-runbook.md` is the daily operation and emergency pause runbook for beta and launch week.
- `docs/public-release-final-checklist.md` is the final release checklist before sharing the public URL widely.
- `docs/launch-day-runbook.md` is the launch-day step-by-step runbook.
- `docs/external-service-work-order.md` is the external dashboard work order for Supabase/Postgres, Discord, and Render.
- `robots.txt`, `sitemap.xml`, `site.webmanifest`, and `.well-known/security.txt` are included for public site basics. The sitemap includes the home page, public rules pages, and public share pages when the beta gate is off.
- Set `ADMIN_PIN`, `STORAGE_DRIVER`, `DATABASE_URL`, and `DATABASE_SSL` in the hosting service.
- Use the real production database for `DATABASE_URL`; production refuses obvious placeholders such as `example.com` hosts or `user:password` credentials.
- Use `DATABASE_SSL=true` for public production; startup is blocked when Postgres SSL is missing or false.
- Use a generated `ADMIN_PIN` of at least 16 characters; production refuses the local default and short values.
- Set `ADMIN_ACCOUNT_IDS` to comma-separated `discord:numeric-id` values for trusted admins.
- Set `MODERATOR_ACCOUNT_IDS` to comma-separated `discord:numeric-id` values for trusted moderators.
- Set `SESSION_SECRET`, `PUBLIC_BASE_URL`, `DISCORD_CLIENT_ID`, and `DISCORD_CLIENT_SECRET` for Discord login.
- Use the numeric Discord application Client ID and the real Client Secret; production refuses obvious Discord OAuth placeholders.
- Set `PUBLIC_SECURITY_CONTACT` to a real public contact before launch so `security.txt` does not point to an `example.com`, `example.org`, or `example.net` placeholder.
- Optionally set `RELEASE_VERSION` and `COMMIT_SHA` so deployed status checks show which release is running.
- Use a `SESSION_SECRET` of at least 32 characters.
- Use a public `https://` origin for `PUBLIC_BASE_URL`; do not leave it on localhost and do not include a path or query.
- Use `STORAGE_DRIVER=postgres` for public production.
- In production, the server refuses to start with the default admin PIN or JSON storage.

## Database design

- See `db/schema.sql` for PostgreSQL/Supabase tables.
- See `db/rls.sql` for Supabase access rules.
- Use `npm run admin:roles:write` to generate `db/generated-admin-roles.sql` from `ADMIN_ACCOUNT_IDS` and `MODERATOR_ACCOUNT_IDS` before promoting trusted production staff.
- See `db/migration-plan.md` for the migration path from JSON.
- See `docs/postgres-production-checklist.md` for the production database launch checklist.
- Current JSON storage is isolated in `storage/json-store.js`.
- `storage/index.js` reads `STORAGE_DRIVER`.
- `STORAGE_DRIVER=json` is active today.
- `STORAGE_DRIVER=postgres` can connect to PostgreSQL/Supabase through `DATABASE_URL`.

For Postgres/Supabase hosting, install dependencies and set environment variables:

```powershell
cd outputs\partyfinder-production
npm install
$env:STORAGE_DRIVER="postgres"
$env:DATABASE_URL="postgres://user:password@host:5432/partyfinder"
$env:DATABASE_SSL="true"
$env:NODE_ENV="production"
$env:SESSION_SECRET="replace-with-a-long-random-string"
$env:ADMIN_ACCOUNT_IDS="discord:123456789012345678"
$env:MODERATOR_ACCOUNT_IDS=""
$env:PUBLIC_BASE_URL="https://your-domain.example"
$env:DISCORD_CLIENT_ID="123456789012345678"
$env:DISCORD_CLIENT_SECRET="replace-with-real-discord-client-secret"
```

## Discord login

Discord login is optional for users. Guests can still post, but Discord users get a stable account ID.

In the Discord Developer Portal, add this redirect URL:

```text
https://your-domain.example/auth/discord/callback
```

For local testing, use:

```text
http://localhost:8787/auth/discord/callback
```

See `docs/discord-setup.md` for the setup checklist.

Before starting the app with `STORAGE_DRIVER=postgres`, apply these files to the database:

1. `db/schema.sql`
2. `db/rls.sql`
3. `db/import-from-json.sql` if you want to import local demo data
4. `db/generated-admin-roles.sql` after running `npm run admin:roles:write`

To export the current local data into SQL:

```powershell
cd outputs\partyfinder-production
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\export-json-to-sql.js
```

Then apply these files to Supabase/Postgres in this order:

1. `db/schema.sql`
2. `db/rls.sql`
3. `db/import-from-json.sql`
4. `db/generated-admin-roles.sql`

After setting `DATABASE_URL`, verify the live schema:

```powershell
cd outputs\partyfinder-production
npm run postgres:check
```

If local demo data ever looks broken, you can reset it:

```powershell
cd outputs\partyfinder-production
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\reset-local-data.js
```

After reset, restart the server to recreate clean sample data.

## Backups

For local JSON storage, create a timestamped backup file:

```powershell
cd outputs\partyfinder-production
& "C:\Users\hiroy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\backup-json-data.js
```

Backups are written to `backups/`.

Verify a backup before restoring it:

```powershell
cd outputs\partyfinder-production
npm run backup:verify -- backups\backup-file.json
```

Run a local backup creation and verification drill:

```powershell
cd outputs\partyfinder-production
npm run backup:drill
```

Admins can also export the current app data from:

```text
GET /api/admin/export
```

Send the admin PIN in the `x-admin-pin` header. Backup exports are recorded in the audit log.

See `docs/restore-guide.md` before restoring backup data.

## Affiliate ad slots

The UI now reserves:

- `left_rail`
- `right_rail`
- `feed_inline`

For now they render safe placeholder PR boxes. In production, manage the real ad creative/tag through the `ad_slots` table.

The local admin tab can toggle slots on and off, edit labels, edit target URLs, and save ad HTML.

## Moderation

The admin tab can:

- view key service stats
- view the operations digest for the first daily checks
- view system status, uptime, storage mode, and launch-readiness checks
- review support inquiries
- publish, hide, and delete public announcements
- review open reports
- resolve reports
- reject reports when no action is needed
- delete reported posts
- suspend the reported poster
- set temporary suspensions and internal moderation notes
- view suspended users
- remove a suspension
- view recent audit logs

Admins can access all management areas. Moderators can help with reports, moderation history, deleted item review, and content deletion, but they are not intended to manage system settings, ads, announcements, backups, or audit logs.

Suspended users cannot create posts, reply, like, or report.

Audit logs currently record:

- report resolution
- report rejection
- reported post deletion
- user suspension
- suspension removal
- ad-slot updates
- backup exports

## Next steps toward a sellable product

1. Replace demo login with Discord OAuth.
2. Connect the live app to Supabase/Postgres and run a real import.
3. Add stronger moderation actions such as ban notes and moderator roles.
4. Replace placeholder affiliate slots with real partner links or ad tags.
5. Add payment or sponsor packages if the service needs direct monetization.
6. Run closed beta testing with `BETA_ACCESS_CODE` and a small Discord community.
