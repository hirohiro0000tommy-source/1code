# Render launch troubleshooting

Use this when the public URL does not answer `/healthz` or the dashboard deploy looks stuck.

## Quick command

```powershell
node scripts/render-launch-triage.js https://onecode-cngg.onrender.com
```

The command does not print secret values. It checks `/healthz`, `/status.json`, and `/`, then prints the most likely next action.

## If the site times out

1. Open Render -> `1code` -> `Logs`.
2. Find the first fatal line after the latest deploy starts.
3. Confirm these Render environment variables:
   - `NODE_ENV=production`
   - `STORAGE_DRIVER=postgres`
   - `DATABASE_URL` is set only in Render
   - `DATABASE_SSL=true`
   - `PUBLIC_BASE_URL=https://onecode-cngg.onrender.com`
   - `PUBLIC_SECURITY_CONTACT` is a real contact
   - `ADMIN_PIN` is set
   - `SESSION_SECRET` is set
   - `PUBLIC_WRITE_PAUSED=false`
   - `ENABLE_SEED_DATA=false`
4. If Discord is postponed, set `DISCORD_LOGIN_ENABLED=false`.
5. Redeploy after changing environment variables.

## If the site answers but deploy verification fails

Run:

```powershell
node scripts/deploy-verify.js https://onecode-cngg.onrender.com
```

Then fix the first failing route. Common causes are a missing production contact, `PUBLIC_BASE_URL` still set to localhost, or Discord OAuth enabled without Discord client values.
