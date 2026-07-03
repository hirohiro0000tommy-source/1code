# 1code Render environment fill sheet

Updated: 2026-07-04

Use this while filling Render environment variables. Do not paste secret values into this file.

## Render Service

- Service type: Web Service
- Build command: `npm install`
- Start command: `node server.js`
- Health check path: `/healthz`
- Root directory when repository root contains this workspace: `outputs/partyfinder-production`

## Non-Secret Values

```text
PORT=8787
NODE_ENV=production
STORAGE_DRIVER=postgres
DATABASE_SSL=true
ADMIN_ACCOUNT_IDS=
MODERATOR_ACCOUNT_IDS=
BETA_WRITE_PAUSED=false
PUBLIC_WRITE_PAUSED=false
ENABLE_SEED_DATA=false
PUBLIC_BASE_URL=<Render public https origin after first deploy>
PUBLIC_SECURITY_CONTACT=<public mailto: or https contact>
RELEASE_VERSION=beta
COMMIT_SHA=
DISCORD_CLIENT_ID=<Discord application client ID after Discord setup>
```

## Secret Values

Paste these only into the Render dashboard:

```text
DATABASE_URL=<Supabase connection string with the real database password>
ADMIN_PIN=<from .env.local>
SESSION_SECRET=<from .env.local>
BETA_ACCESS_CODE=<from .env.local for closed beta, blank for public launch>
DISCORD_CLIENT_SECRET=<Discord application secret after Discord setup>
```

## Supabase DATABASE_URL Template

Use the transaction pooler template unless a Render connectivity test proves direct IPv6 works:

```text
postgresql://postgres.cxpivolfcnhgploptwym:[YOUR-PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres
```

Replace `[YOUR-PASSWORD]` with the Supabase database password. Do not send the completed URL in chat.

## Current External State

- Supabase schema: applied
- Supabase RLS: applied
- Render: logged in, waiting for GitHub/repository connection
- Discord OAuth: not configured yet; do after Render public URL exists
