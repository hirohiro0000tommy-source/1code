# Discord setup

Use this when enabling real Discord login.

## Discord Developer Portal

1. Create an application.
2. Open OAuth2 settings.
3. Copy the numeric Client ID into `DISCORD_CLIENT_ID`.
4. Copy the real Client Secret into `DISCORD_CLIENT_SECRET`; do not leave placeholder text.
5. Add a redirect URL:

```text
https://your-domain.example/auth/discord/callback
```

For local testing:

```text
http://localhost:8787/auth/discord/callback
```

## App environment

Set these values on the hosting service:

```text
PUBLIC_BASE_URL=https://your-domain.example
SESSION_SECRET=replace-with-a-long-random-string
DISCORD_LOGIN_ENABLED=true
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=replace-with-real-discord-client-secret
```

## Behavior

- Login is optional.
- Guests can still post.
- Discord users get a stable account ID.
- The app stores a signed session cookie.
- The app does not store Discord access tokens.
