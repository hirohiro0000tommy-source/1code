const { URL } = require("url");

const strict = process.argv.includes("--strict") || process.env.STRICT_CONFIG === "true" || process.env.NODE_ENV === "production";
const checks = [];

function env(name) {
  return String(process.env[name] || "").trim();
}

function flag(name) {
  return ["1", "true", "yes", "on"].includes(env(name).toLowerCase());
}

function add(name, ok, detail, level = strict ? "fail" : "warn") {
  checks.push({ name, ok, detail, level });
}

function nextActionFor(check) {
  const actions = {
    NODE_ENV: "Set NODE_ENV=production in the hosting environment.",
    STORAGE_DRIVER: "Set STORAGE_DRIVER=postgres before a public production launch.",
    DATABASE_URL: "Create the production Postgres/Supabase database and paste only the real DATABASE_URL into the hosting dashboard.",
    DATABASE_SSL: "Set DATABASE_SSL=true for the production Postgres connection.",
    PUBLIC_BASE_URL: "Set PUBLIC_BASE_URL to the final public https origin only, for example https://your-domain.example.",
    PUBLIC_SECURITY_CONTACT: "Set PUBLIC_SECURITY_CONTACT to a real mailto: address or public https contact page.",
    ADMIN_PIN: "Run npm run secrets and paste the generated ADMIN_PIN into the hosting dashboard.",
    SESSION_SECRET: "Run npm run secrets and paste the generated SESSION_SECRET into the hosting dashboard.",
    DISCORD_LOGIN_ENABLED: "Set DISCORD_LOGIN_ENABLED=false to publish a beta without Discord OAuth, or true after Discord setup is complete.",
    ADMIN_ACCOUNT_IDS: "Log in with Discord once, copy your Discord account id, and set ADMIN_ACCOUNT_IDS=discord:numeric-id.",
    DISCORD_CLIENT_ID: "Create the Discord application and paste its numeric client ID into DISCORD_CLIENT_ID.",
    DISCORD_CLIENT_SECRET: "Create or reset the Discord client secret and paste it only into the hosting dashboard.",
    ENABLE_SEED_DATA: "Set ENABLE_SEED_DATA=false or remove it before public launch.",
    BETA_WRITE_PAUSED: "Set BETA_WRITE_PAUSED=false when beta posting should be open.",
    PUBLIC_WRITE_PAUSED: "Set PUBLIC_WRITE_PAUSED=false before announcing public posting.",
    BETA_ACCESS_CODE: "Remove BETA_ACCESS_CODE when switching from closed beta to public posting.",
    MODERATOR_ACCOUNT_IDS: "Use blank or comma-separated discord:numeric-id values only.",
    MAX_REQUEST_BODY_BYTES: "Use a numeric request body limit between 32000 and 2000000 bytes.",
    SERVER_REQUEST_TIMEOUT_MS: "Use a numeric server request timeout between 10000 and 120000 ms.",
    SERVER_HEADERS_TIMEOUT_MS: "Use a numeric headers timeout between 5000 and SERVER_REQUEST_TIMEOUT_MS.",
    SERVER_KEEP_ALIVE_TIMEOUT_MS: "Use a numeric keep-alive timeout between 1000 and 30000 ms.",
    RELEASE_VERSION: "Optional: set RELEASE_VERSION to the release label you want to see in admin/status screens.",
    COMMIT_SHA: "Optional: set COMMIT_SHA to the deployed commit for traceability."
  };
  return actions[check.name] || "Review this environment value in the hosting dashboard.";
}

function secretState(name, minLength = 1, placeholders = []) {
  const value = env(name);
  if (!value) return { ok: false, detail: "missing" };
  if (value.length < minLength) return { ok: false, detail: `too short (${value.length}/${minLength})` };
  if (placeholders.includes(value)) return { ok: false, detail: "placeholder" };
  return { ok: true, detail: "set" };
}

function discordClientIdState() {
  const value = env("DISCORD_CLIENT_ID");
  if (!value) return { ok: false, detail: "missing" };
  if (/^(your-discord-client-id|smoke-client-id|discord-client-id|\.\.\.)$/i.test(value)) return { ok: false, detail: "placeholder" };
  if (!/^\d{16,22}$/.test(value)) return { ok: false, detail: "must be a Discord snowflake id" };
  return { ok: true, detail: "set" };
}

function discordClientSecretState() {
  const value = env("DISCORD_CLIENT_SECRET");
  if (!value) return { ok: false, detail: "missing" };
  if (/^(your-discord-client-secret|smoke-client-secret|discord-client-secret|\.\.\.)$/i.test(value)) return { ok: false, detail: "placeholder" };
  if (value.length < 16) return { ok: false, detail: `too short (${value.length}/16)` };
  return { ok: true, detail: "set" };
}

function accountIdsState(name, required = false) {
  const ids = env(name).split(",").map(value => value.trim()).filter(Boolean);
  if (required && !ids.length) return { ok: false, detail: "missing" };
  const placeholder = ids.find(id => /replace|your-|trusted-|smoke-|\.\.\./i.test(id));
  if (placeholder) return { ok: false, detail: "placeholder" };
  const invalid = ids.find(id => !/^discord:\d{16,22}$/.test(id));
  if (invalid) return { ok: false, detail: "must be discord:numeric-id" };
  return { ok: true, detail: ids.length ? `${ids.length} account(s)` : "optional" };
}

function databaseSummary() {
  const value = env("DATABASE_URL");
  if (!value) return { ok: false, detail: "missing" };
  try {
    const parsed = new URL(value);
    const protocolOk = ["postgres:", "postgresql:"].includes(parsed.protocol);
    const hostOk = Boolean(parsed.hostname) && !/example\.(com|org|net)$/i.test(parsed.hostname);
    const dbOk = parsed.pathname && parsed.pathname !== "/";
    const username = decodeURIComponent(parsed.username || "").toLowerCase();
    const password = decodeURIComponent(parsed.password || "").toLowerCase();
    const placeholderCredentials = ["user", "username"].includes(username) || ["password", "pass"].includes(password);
    return {
      ok: protocolOk && hostOk && dbOk && !placeholderCredentials,
      detail: protocolOk && hostOk && dbOk && !placeholderCredentials
        ? `${parsed.protocol.replace(":", "")}://${parsed.hostname}${parsed.pathname}`
        : "invalid or placeholder postgres url"
    };
  } catch (error) {
    return { ok: false, detail: "invalid url" };
  }
}

function publicUrlSummary() {
  const value = env("PUBLIC_BASE_URL");
  if (!value) return { ok: false, detail: "missing" };
  try {
    const parsed = new URL(value);
    const hasPath = parsed.pathname && parsed.pathname !== "/";
    const hasSearchOrHash = Boolean(parsed.search || parsed.hash);
    const ok = parsed.protocol === "https:" && !/localhost|127\.0\.0\.1/i.test(parsed.hostname) && !hasPath && !hasSearchOrHash;
    return { ok, detail: ok ? parsed.origin : hasPath || hasSearchOrHash ? "must be origin only, like https://example.com" : value };
  } catch (error) {
    return { ok: false, detail: "invalid url" };
  }
}

function publicSecurityContactSummary() {
  const value = env("PUBLIC_SECURITY_CONTACT");
  if (!value) return { ok: false, detail: "missing" };
  let ok = false;
  if (/^mailto:/i.test(value)) {
    const address = value.replace(/^mailto:/i, "");
    ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address);
  } else if (/^https:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      ok = !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
    } catch (error) {
      ok = false;
    }
  }
  if (/example\.(com|org|net)/i.test(value)) ok = false;
  return { ok, detail: ok ? value.replace(/(.{24}).+/, "$1...") : "invalid or placeholder contact" };
}

function numericRangeState(name, min, max, fallback) {
  const raw = env(name);
  if (!raw) return { ok: true, value: fallback, detail: `default ${fallback}` };
  if (!/^\d+$/.test(raw)) return { ok: false, value: NaN, detail: "must be a whole number" };
  const value = Number(raw);
  if (value < min || value > max) return { ok: false, value, detail: `out of range (${min}-${max})` };
  return { ok: true, value, detail: String(value) };
}

const nodeEnv = env("NODE_ENV") || "development";
const storageDriver = env("STORAGE_DRIVER") || "json";
const adminPin = secretState("ADMIN_PIN", 16, ["admin", "change-this-before-public-release"]);
const sessionSecret = secretState("SESSION_SECRET", 32, ["local-session-secret", "change-this-random-session-secret"]);
const database = databaseSummary();
const publicUrl = publicUrlSummary();
const publicSecurityContact = publicSecurityContactSummary();
const discordLoginEnabled = env("DISCORD_LOGIN_ENABLED") ? flag("DISCORD_LOGIN_ENABLED") : true;
const adminAccounts = accountIdsState("ADMIN_ACCOUNT_IDS", discordLoginEnabled);
const moderatorAccounts = accountIdsState("MODERATOR_ACCOUNT_IDS", false);
const discordClientId = discordClientIdState();
const discordClientSecret = discordClientSecretState();
const maxRequestBodyBytes = numericRangeState("MAX_REQUEST_BODY_BYTES", 32_000, 2_000_000, 1_000_000);
const serverRequestTimeoutMs = numericRangeState("SERVER_REQUEST_TIMEOUT_MS", 10_000, 120_000, 30_000);
const serverHeadersTimeoutMs = numericRangeState("SERVER_HEADERS_TIMEOUT_MS", 5_000, serverRequestTimeoutMs.ok ? serverRequestTimeoutMs.value : 120_000, 10_000);
const serverKeepAliveTimeoutMs = numericRangeState("SERVER_KEEP_ALIVE_TIMEOUT_MS", 1_000, 30_000, 5_000);
const releaseVersion = env("RELEASE_VERSION");
const commitSha = env("COMMIT_SHA");

add("NODE_ENV", nodeEnv === "production", nodeEnv, strict ? "fail" : "warn");
add("STORAGE_DRIVER", storageDriver === "postgres", storageDriver, strict ? "fail" : "warn");
add("DATABASE_URL", storageDriver !== "postgres" || database.ok, storageDriver === "postgres" ? database.detail : "not required until STORAGE_DRIVER=postgres", strict ? "fail" : "warn");
add("DATABASE_SSL", storageDriver !== "postgres" || env("DATABASE_SSL") === "true", storageDriver === "postgres" ? env("DATABASE_SSL") || "missing" : "not required until STORAGE_DRIVER=postgres", strict ? "fail" : "warn");
add("PUBLIC_BASE_URL", publicUrl.ok, publicUrl.detail, strict ? "fail" : "warn");
add("PUBLIC_SECURITY_CONTACT", publicSecurityContact.ok, publicSecurityContact.detail, strict ? "fail" : "warn");
add("ADMIN_PIN", adminPin.ok, adminPin.detail, strict ? "fail" : "warn");
add("SESSION_SECRET", sessionSecret.ok, sessionSecret.detail, strict ? "fail" : "warn");
add("DISCORD_LOGIN_ENABLED", true, discordLoginEnabled ? "true" : "false");
add("ADMIN_ACCOUNT_IDS", adminAccounts.ok, discordLoginEnabled ? adminAccounts.detail : "optional while DISCORD_LOGIN_ENABLED=false", discordLoginEnabled && strict ? "fail" : "warn");
add("DISCORD_CLIENT_ID", !discordLoginEnabled || discordClientId.ok, discordLoginEnabled ? discordClientId.detail : "optional while DISCORD_LOGIN_ENABLED=false", discordLoginEnabled && strict ? "fail" : "warn");
add("DISCORD_CLIENT_SECRET", !discordLoginEnabled || discordClientSecret.ok, discordLoginEnabled ? discordClientSecret.detail : "optional while DISCORD_LOGIN_ENABLED=false", discordLoginEnabled && strict ? "fail" : "warn");
add("ENABLE_SEED_DATA", !flag("ENABLE_SEED_DATA"), flag("ENABLE_SEED_DATA") ? "true" : "false", strict ? "fail" : "warn");
add("BETA_WRITE_PAUSED", !flag("BETA_WRITE_PAUSED"), flag("BETA_WRITE_PAUSED") ? "true" : "false", "warn");
add("PUBLIC_WRITE_PAUSED", !flag("PUBLIC_WRITE_PAUSED"), flag("PUBLIC_WRITE_PAUSED") ? "true" : "false", strict ? "fail" : "warn");
add("BETA_ACCESS_CODE", !env("BETA_ACCESS_CODE"), env("BETA_ACCESS_CODE") ? "set (closed beta mode)" : "blank", "warn");
add("MODERATOR_ACCOUNT_IDS", moderatorAccounts.ok, moderatorAccounts.detail, moderatorAccounts.ok ? "warn" : strict ? "fail" : "warn");
add("MAX_REQUEST_BODY_BYTES", maxRequestBodyBytes.ok, maxRequestBodyBytes.detail, strict ? "fail" : "warn");
add("SERVER_REQUEST_TIMEOUT_MS", serverRequestTimeoutMs.ok, serverRequestTimeoutMs.detail, strict ? "fail" : "warn");
add("SERVER_HEADERS_TIMEOUT_MS", serverHeadersTimeoutMs.ok, serverHeadersTimeoutMs.detail, strict ? "fail" : "warn");
add("SERVER_KEEP_ALIVE_TIMEOUT_MS", serverKeepAliveTimeoutMs.ok, serverKeepAliveTimeoutMs.detail, strict ? "fail" : "warn");
add("RELEASE_VERSION", true, releaseVersion || "optional");
add("COMMIT_SHA", true, commitSha ? `${commitSha.slice(0, 12)}...` : "optional");

console.log("Production config check");
console.log(`mode: ${strict ? "strict" : "advisory"}`);
console.log("");

for (const check of checks) {
  const status = check.ok ? "ok" : check.level === "fail" ? "ng" : "warn";
  console.log(`${status} - ${check.name} (${check.detail})`);
}

const failed = checks.filter(check => !check.ok && check.level === "fail");
const nextActions = checks.filter(check => !check.ok).map(check => `- ${check.name}: ${nextActionFor(check)}`);
if (nextActions.length) {
  console.log("");
  console.log("Next actions");
  for (const action of nextActions) console.log(action);
}

if (publicUrl.ok) {
  console.log("");
  console.log(`Discord redirect URL: ${new URL("/auth/discord/callback", env("PUBLIC_BASE_URL")).toString()}`);
} else {
  console.log("");
  console.log("Discord redirect URL: set PUBLIC_BASE_URL first, then use PUBLIC_BASE_URL + /auth/discord/callback");
}

if (failed.length) {
  console.error(`Production config check failed: ${failed.length} issue(s)`);
  process.exit(1);
}

const warnings = checks.filter(check => !check.ok && check.level !== "fail");
if (warnings.length) {
  console.log(`Production config check completed with ${warnings.length} warning(s)`);
} else {
  console.log("Production config check passed");
}
