const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const requiredFiles = [
  "server.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/icon.svg",
  "public/og-image.svg",
  "public/terms.html",
  "public/privacy.html",
  "public/guidelines.html",
  "public/robots.txt",
  "public/sitemap.xml",
  "public/site.webmanifest",
  "public/.well-known/security.txt",
  "db/schema.sql",
  "db/rls.sql",
  "db/admin-roles.sql",
  "db/migration-plan.md",
  "scripts/backup-json-data.js",
  "scripts/verify-backup.js",
  "scripts/backup-drill.js",
  "scripts/generate-secrets.js",
  "scripts/generate-admin-roles-sql.js",
  "scripts/deploy-env-plan.js",
  "scripts/deploy-verify.js",
  "scripts/production-config-check.js",
  "scripts/launch-today.js",
  "scripts/beta-readiness-check.js",
  "scripts/beta-prelaunch-check.js",
  "scripts/public-readiness-check.js",
  "scripts/public-prelaunch-check.js",
  "scripts/final-release-check.js",
  "scripts/live-smoke-check.js",
  "scripts/status-check.js",
  "scripts/postgres-readiness-check.js",
  "storage/index.js",
  "storage/json-store.js",
  "storage/postgres-store.js",
  "Dockerfile",
  "render.yaml",
  ".env.example",
  "README.md",
  "docs/discord-setup.md",
  "docs/env-setup-checklist.md",
  "docs/external-service-work-order.md",
  "docs/beta-test-guide.md",
  "docs/web-beta-launch-quickstart.md",
  "docs/operator-handoff.md",
  "docs/public-operations-runbook.md",
  "docs/public-release-final-checklist.md",
  "docs/launch-day-runbook.md",
  "docs/postgres-production-checklist.md",
  "docs/prelaunch-checklist.md",
  "docs/restore-guide.md"
];

const checks = [];

function pass(name, detail = "") {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = "") {
  checks.push({ ok: false, name, detail });
}

function fileText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

for (const file of requiredFiles) {
  if (fs.existsSync(path.join(root, file))) pass(`file: ${file}`);
  else fail(`file: ${file}`, "missing");
}

const envExample = fileText(".env.example");
const webBetaLaunchGuide = fileText("docs/web-beta-launch-quickstart.md");
const operatorHandoff = fileText("docs/operator-handoff.md");
const publicOperationsRunbook = fileText("docs/public-operations-runbook.md");
const launchDayRunbook = fileText("docs/launch-day-runbook.md");
const externalServiceWorkOrder = fileText("docs/external-service-work-order.md");
const requiredEnvKeys = ["PORT", "NODE_ENV", "ADMIN_PIN", "ADMIN_ACCOUNT_IDS", "MODERATOR_ACCOUNT_IDS", "BETA_ACCESS_CODE", "BETA_WRITE_PAUSED", "PUBLIC_WRITE_PAUSED", "HOT_TOPIC_BOT_ENABLED", "HOT_TOPIC_BOT_INTERVAL_MINUTES", "HOT_TOPIC_BOT_DAILY_LIMIT", "ENABLE_SEED_DATA", "MAX_REQUEST_BODY_BYTES", "SERVER_REQUEST_TIMEOUT_MS", "SERVER_HEADERS_TIMEOUT_MS", "SERVER_KEEP_ALIVE_TIMEOUT_MS", "SESSION_SECRET", "STORAGE_DRIVER", "DATABASE_URL", "DATABASE_SSL", "PUBLIC_BASE_URL", "PUBLIC_SECURITY_CONTACT", "DISCORD_LOGIN_ENABLED", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"];
for (const key of requiredEnvKeys) {
  if (envExample.includes(`${key}=`)) pass(`env example: ${key}`);
  else fail(`env example: ${key}`, "missing");
}
for (const key of ["RELEASE_VERSION", "COMMIT_SHA"]) {
  if (envExample.includes(`${key}=`)) pass(`env example optional: ${key}`);
  else fail(`env example optional: ${key}`, "missing");
}

const renderYaml = fileText("render.yaml");
if (renderYaml.includes("healthCheckPath: /healthz")) pass("render health check path");
else fail("render health check path", "missing");

const dockerfile = fileText("Dockerfile");
if (dockerfile.includes("HEALTHCHECK") && dockerfile.includes("/healthz") && dockerfile.includes("process.env.PORT")) pass("docker health check");
else fail("docker health check", "missing");

for (const key of requiredEnvKeys) {
  if (renderYaml.includes(`key: ${key}`)) pass(`render env: ${key}`);
  else fail(`render env: ${key}`, "missing");
}
for (const key of ["RELEASE_VERSION", "COMMIT_SHA"]) {
  if (renderYaml.includes(`key: ${key}`)) pass(`render env optional: ${key}`);
  else fail(`render env optional: ${key}`, "missing");
}

if (webBetaLaunchGuide.includes("Render") && webBetaLaunchGuide.includes("Supabase/Postgres") && webBetaLaunchGuide.includes("BETA_ACCESS_CODE") && webBetaLaunchGuide.includes("BETA_WRITE_PAUSED") && webBetaLaunchGuide.includes("優先対応キュー") && webBetaLaunchGuide.includes("Stop conditions") && webBetaLaunchGuide.includes("npm run admin:roles:write")) pass("web beta launch quickstart");
else fail("web beta launch quickstart", "missing");

if (operatorHandoff.includes("Permission needed") && operatorHandoff.includes("BETA_ACCESS_CODE") && operatorHandoff.includes("BETA_WRITE_PAUSED") && operatorHandoff.includes("広告URL確認") && operatorHandoff.includes("5-minute operation") && operatorHandoff.includes("Emergency pause") && operatorHandoff.includes("優先対応キュー")) pass("operator handoff");
else fail("operator handoff", "missing");

if (publicOperationsRunbook.includes("Daily 5-minute check") && publicOperationsRunbook.includes("First 30-minute watch") && publicOperationsRunbook.includes("公開直後の監視") && publicOperationsRunbook.includes("運用ダイジェスト") && publicOperationsRunbook.includes("広告URL確認") && publicOperationsRunbook.includes("おすすめだけ公開") && publicOperationsRunbook.includes("PUBLIC_WRITE_PAUSED") && publicOperationsRunbook.includes("deploy:verify") && publicOperationsRunbook.includes("x-request-id") && publicOperationsRunbook.includes("Response targets")) pass("public operations runbook");
else fail("public operations runbook", "missing");

if (launchDayRunbook.includes("Stop points") && launchDayRunbook.includes("Before deployment") && launchDayRunbook.includes("After deployment") && launchDayRunbook.includes("おすすめだけ公開") && launchDayRunbook.includes("Emergency brake") && launchDayRunbook.includes("PUBLIC_WRITE_PAUSED=true")) pass("launch day runbook");
else fail("launch day runbook", "missing");

if (externalServiceWorkOrder.includes("Supabase or Postgres") && externalServiceWorkOrder.includes("Hosting environment") && externalServiceWorkOrder.includes("Discord Developer Portal") && externalServiceWorkOrder.includes("First login and staff SQL") && externalServiceWorkOrder.includes("Small public share") && externalServiceWorkOrder.includes("Stop before secrets") && externalServiceWorkOrder.includes("npm run deploy:verify") && externalServiceWorkOrder.includes("npm run admin:roles:write")) pass("external service work order");
else fail("external service work order", "missing");

const storageDriver = process.env.STORAGE_DRIVER || "json";
if (["json", "postgres"].includes(storageDriver)) pass("STORAGE_DRIVER", storageDriver);
else fail("STORAGE_DRIVER", `unsupported value: ${storageDriver}`);

if (storageDriver === "postgres") {
  if (process.env.DATABASE_URL) pass("DATABASE_URL", "set");
  else fail("DATABASE_URL", "required when STORAGE_DRIVER=postgres");
}

const adminPin = process.env.ADMIN_PIN || "";
if (process.env.NODE_ENV === "production") {
  if (!adminPin || adminPin === "admin" || adminPin === "change-this-before-public-release") {
    fail("ADMIN_PIN", "must be changed for production");
  } else if (adminPin.length < 16) {
    fail("ADMIN_PIN", "must be at least 16 characters for production");
  } else {
    pass("ADMIN_PIN", "production value set");
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "local-session-secret") {
    fail("SESSION_SECRET", "must be changed for production");
  } else if (process.env.SESSION_SECRET.length < 32) {
    fail("SESSION_SECRET", "must be at least 32 characters for production");
  } else {
    pass("SESSION_SECRET", "production value set");
  }
  if (!process.env.PUBLIC_BASE_URL || !/^https:\/\//.test(process.env.PUBLIC_BASE_URL) || /localhost|127\.0\.0\.1/i.test(process.env.PUBLIC_BASE_URL)) {
    fail("PUBLIC_BASE_URL", "must be a public https URL for production");
  } else {
    pass("PUBLIC_BASE_URL", "production URL set");
  }
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    fail("Discord OAuth", "client id and secret are required for production");
  } else if (!/^\d{16,22}$/.test(process.env.DISCORD_CLIENT_ID) || /^(your-discord-client-secret|smoke-client-secret|discord-client-secret|\.\.\.)$/i.test(process.env.DISCORD_CLIENT_SECRET) || process.env.DISCORD_CLIENT_SECRET.length < 16) {
    fail("Discord OAuth", "real production client id and secret are required");
  } else {
    pass("Discord OAuth", "credentials set");
  }
  if (!process.env.ADMIN_ACCOUNT_IDS) {
    fail("ADMIN_ACCOUNT_IDS", "at least one admin account id is required for production");
  } else if (process.env.ADMIN_ACCOUNT_IDS.split(",").map(value => value.trim()).filter(Boolean).some(value => !/^discord:\d{16,22}$/.test(value) || /replace|your-|trusted-|smoke-|\.\.\./i.test(value))) {
    fail("ADMIN_ACCOUNT_IDS", "must contain real discord:numeric-id values");
  } else {
    pass("ADMIN_ACCOUNT_IDS", "production admin set");
  }
} else {
  pass("ADMIN_PIN", adminPin ? "set" : "not set for local use");
}

const schema = fileText("db/schema.sql");
for (const table of ["profiles", "recruitments", "threads", "replies", "likes", "reports", "inquiries", "direct_messages", "announcements", "ad_slots", "moderation_events", "deleted_items", "audit_logs"]) {
  if (schema.includes(`create table if not exists ${table}`)) pass(`schema table: ${table}`);
  else fail(`schema table: ${table}`, "missing");
}
for (const column of ["ban_reason", "ban_note", "banned_until"]) {
  if (schema.includes(column)) pass(`schema column: profiles.${column}`);
  else fail(`schema column: profiles.${column}`, "missing");
}
if (schema.includes("request_id")) pass("schema column: inquiries.request_id");
else fail("schema column: inquiries.request_id", "missing");
if (schema.includes("beta_feedback_type") && schema.includes("beta_feedback_priority") && schema.includes("beta_feedback_note")) pass("schema column: inquiries beta feedback triage");
else fail("schema column: inquiries beta feedback triage", "missing");
if (schema.includes("resolution_note") && schema.includes("'削除依頼'")) pass("schema column: inquiries deletion resolution");
else fail("schema column: inquiries deletion resolution", "missing");
if (schema.includes("ad_slots") && schema.includes("kind in ('affiliate', 'sponsor', 'community')")) pass("schema column: ad_slots.kind");
else fail("schema column: ad_slots.kind", "missing");

const rls = fileText("db/rls.sql");
for (const table of ["profiles", "recruitments", "threads", "replies", "likes", "reports", "inquiries", "direct_messages", "announcements", "ad_slots", "moderation_events", "deleted_items", "audit_logs"]) {
  if (rls.includes(`alter table ${table} enable row level security`)) pass(`rls enabled: ${table}`);
  else fail(`rls enabled: ${table}`, "missing");
}

const adminRoles = fileText("db/admin-roles.sql");
if (adminRoles.includes("role = 'admin'") && adminRoles.includes("provider_user_id")) pass("admin role SQL");
else fail("admin role SQL", "missing");

if (adminRoles.includes("'moderator'") && adminRoles.includes("moderator_accounts")) pass("moderator role SQL");
else fail("moderator role SQL", "missing");

const packageJson = JSON.parse(fileText("package.json"));
const deployVerify = fileText("scripts/deploy-verify.js");
const adminRolesGenerator = fileText("scripts/generate-admin-roles-sql.js");
for (const script of ["start", "check", "smoke", "status:check", "backup", "backup:verify", "backup:drill", "beta:check", "beta:prelaunch", "public:check", "public:prelaunch", "release:final", "live:check", "launch:today", "launch:packet", "export:sql", "postgres:check", "config:check", "deploy:plan", "deploy:verify", "admin:roles", "admin:roles:write", "secrets"]) {
  if (packageJson.scripts?.[script]) pass(`npm script: ${script}`);
  else fail(`npm script: ${script}`, "missing");
}
if (packageJson.scripts?.["deploy:verify"] === "node scripts/deploy-verify.js" && deployVerify.includes("status-check.js") && deployVerify.includes("live-smoke-check.js") && deployVerify.includes("Deploy verification needs a public base URL") && deployVerify.includes("baseUrl.protocol !== \"https:\"") && deployVerify.includes("public origin only") && deployVerify.includes("Deploy verification passed")) pass("deploy verify script sequence");
else fail("deploy verify script sequence", "missing");
if (packageJson.scripts?.["admin:roles:write"] && adminRolesGenerator.includes("ADMIN_ACCOUNT_IDS") && adminRolesGenerator.includes("MODERATOR_ACCOUNT_IDS") && adminRolesGenerator.includes("generated-admin-roles.sql") && adminRolesGenerator.includes("discord:\\d{16,22}")) pass("admin role sql generator");
else fail("admin role sql generator", "missing");

const server = fileText("server.js");
const smoke = fileText("scripts/smoke-test.js");
const statusCheck = fileText("scripts/status-check.js");
const liveCheck = fileText("scripts/live-smoke-check.js");
for (const route of ["/api/health", "/api/me", "/api/me/data", "/api/me/export", "/api/messages", "/api/inquiries", "/api/admin/inquiries", "/api/admin/announcements", "/api/admin/stats", "/api/admin/public-launch", "/api/admin/public-report", "/api/admin/public-release-checklist", "/api/admin/operator-digest", "/api/admin/incident-brief", "/api/admin/beta-launch", "/api/admin/beta-report", "/api/admin/beta-backlog", "/api/admin/system", "/api/admin/backup-status", "/api/admin/export", "/api/admin/audit-logs", "/api/admin/moderation-events", "/api/admin/deleted-items", "/auth/discord/start"]) {
  if (server.includes(route)) pass(`api route: ${route}`);
  else fail(`api route: ${route}`, "missing");
}

if (server.includes("/share/") && server.includes("shareHtml")) pass("share pages");
else fail("share pages", "missing");

const index = fileText("public/index.html");
const terms = fileText("public/terms.html");
const privacy = fileText("public/privacy.html");
const guidelines = fileText("public/guidelines.html");
if (index.includes("/site.webmanifest")) pass("manifest linked");
else fail("manifest linked", "missing");

if (index.includes("rel=\"icon\"") && index.includes("/icon.svg")) pass("site icon linked");
else fail("site icon linked", "missing");

if (index.includes("og:image") && index.includes("/og-image.svg") && server.includes("function homeHtml") && server.includes("absoluteUrl(\"/og-image.svg\")") && smoke.includes("home og image absolute url missing")) pass("home OGP image");
else fail("home OGP image", "missing");

if (index.includes("application/ld+json") && index.includes("\"@type\": \"WebSite\"") && index.includes("Red Thread") && server.includes("homeHtml") && smoke.includes("home structured data absolute url missing")) pass("home structured data");
else fail("home structured data", "missing");

const manifest = JSON.parse(fileText("public/site.webmanifest"));
if (manifest.icons?.some(icon => icon.src === "/icon.svg")) pass("manifest icon");
else fail("manifest icon", "missing");

if (server.includes("function robotsText") && server.includes("x-robots-tag") && server.includes("absoluteUrl(\"/sitemap.xml\")") && smoke.includes("robots sitemap absolute url missing") && smoke.includes("closed beta robots should disallow indexing")) pass("closed beta noindex");
else fail("closed beta noindex", "missing");

if (server.includes("function sitemapXml") && server.includes("/sitemap.xml") && server.includes("/guidelines.html") && server.includes("/share/${item.type}") && smoke.includes("sitemap recruitment share missing") && smoke.includes("sitemap guidelines missing") && smoke.includes("closed beta sitemap should not expose share pages") && smoke.includes("closed beta sitemap should not expose static public pages")) pass("dynamic sitemap");
else fail("dynamic sitemap", "missing");

if (server.includes("function feedXml") && server.includes("/feed.xml") && index.includes("application/rss+xml") && smoke.includes("feed recruitment share missing") && smoke.includes("closed beta feed should not expose share pages")) pass("public rss feed");
else fail("public rss feed", "missing");

const app = fileText("public/app.js");
const styles = fileText("public/styles.css");
if (server.includes("function deploymentHandoff") && server.includes("/api/admin/deployment-handoff") && server.includes("DATABASE_URL valid") && server.includes("PUBLIC_SECURITY_CONTACT") && server.includes("Staff roles SQL") && server.includes("admin:roles:write") && server.includes("handoffSteps") && server.includes("envChecklist") && server.includes("安全な環境変数チェック") && server.includes("secret: true") && server.includes("実行順") && app.includes("公開設定ハンドオフ") && app.includes("renderDeploymentHandoff") && app.includes("実行順") && app.includes("安全な環境変数チェック") && smoke.includes("deployment handoff database url item missing") && smoke.includes("deployment handoff security contact item missing") && smoke.includes("deployment handoff staff role sql item missing") && smoke.includes("deployment handoff steps missing") && smoke.includes("deployment handoff env checklist missing") && smoke.includes("deployment handoff deploy verify step missing")) pass("deployment handoff");
else fail("deployment handoff", "missing");

if (index.includes("safety-strip") && app.includes("message-safety") && styles.includes(".message-safety")) pass("user safety guidance");
else fail("user safety guidance", "missing");

if (server.includes("publicStatus") && index.includes("serviceStatus") && app.includes("renderServiceStatus") && styles.includes(".service-status") && smoke.includes("beta public status missing") && smoke.includes("public status missing")) pass("public service status UI");
else fail("public service status UI", "missing");

if (index.includes("app-footer") && index.includes("/guidelines.html") && index.includes("/feed.xml") && index.includes("広告や外部リンク") && styles.includes(".app-footer") && styles.includes(".footer-links")) pass("public footer links");
else fail("public footer links", "missing");

if (terms.includes("通報と削除依頼") && terms.includes("DM") && terms.includes("広告と外部リンク") && terms.includes("サービスの変更と停止")) pass("terms public coverage");
else fail("terms public coverage", "missing");

if (privacy.includes("データ確認と保存") && privacy.includes("削除依頼") && privacy.includes("非表示DM") && privacy.includes("処理概要") && privacy.includes("Discordログイン") && privacy.includes("広告とCookie") && privacy.includes("保存期間")) pass("privacy public coverage");
else fail("privacy public coverage", "missing");

if (guidelines.includes("コミュニティガイドライン") && guidelines.includes("募集を書くとき") && guidelines.includes("返信とDM") && guidelines.includes("トラブルを見つけたら") && guidelines.includes("禁止する投稿")) pass("community guidelines coverage");
else fail("community guidelines coverage", "missing");

if (app.includes("account.role === \"moderator\"") && app.includes("Moderator")) pass("moderator admin UI mode");
else fail("moderator admin UI mode", "missing");

if (app.includes("durationDays") && app.includes("内部メモ")) pass("ban duration and notes UI");
else fail("ban duration and notes UI", "missing");

if (server.includes("isUserContributionWrite(req, url) && rejectBanned") && smoke.includes("banned account status update was not blocked") && smoke.includes("banned account delete was not blocked")) pass("banned contribution write gate");
else fail("banned contribution write gate", "missing");

if (server.includes("suspension: ban ?") && app.includes("利用制限中") && styles.includes(".account.suspended") && smoke.includes("banned account suspension status missing")) pass("banned account status visibility");
else fail("banned account status visibility", "missing");

if (app.includes("error.reason = data.reason") && app.includes("利用制限中のため操作できません")) pass("banned error toast guidance");
else fail("banned error toast guidance", "missing");

if (app.includes("削除理由") && server.includes("manual_delete")) pass("moderation delete reasons");
else fail("moderation delete reasons", "missing");

if (server.includes("permissions-policy")) pass("security header: permissions-policy");
else fail("security header: permissions-policy", "missing");

if (server.includes("content-security-policy")) pass("security header: content-security-policy");
else fail("security header: content-security-policy", "missing");

if (server.includes("strict-transport-security") && server.includes("cross-origin-opener-policy") && liveCheck.includes("home hsts") && liveCheck.includes("home opener policy") && liveCheck.includes("home content security policy") && liveCheck.includes("home permissions policy") && liveCheck.includes("home content type options")) pass("security header: production isolation");
else fail("security header: production isolation", "missing");

if (server.includes("sanitizeAdHtml")) pass("ad html sanitization");
else fail("ad html sanitization", "missing");

if (server.includes("verifyWriteOrigin")) pass("write origin protection");
else fail("write origin protection", "missing");

if (server.includes("healthSnapshot") && server.includes("runtimeMetrics") && server.includes("/healthz") && server.includes("/readyz") && server.includes("/status.json") && smoke.includes("healthz failed") && smoke.includes("healthz head failed") && smoke.includes("readyz failed") && smoke.includes("status json failed")) pass("health runtime metrics");
else fail("health runtime metrics", "missing");

if (server.includes("maxRequestBodyBytes") && server.includes("server.requestTimeout") && server.includes("server.headersTimeout") && server.includes("server.keepAliveTimeout") && server.includes("limits:") && smoke.includes("health request body limit missing") && smoke.includes("health request timeout limit missing")) pass("request limit and timeout visibility");
else fail("request limit and timeout visibility", "missing");

if (server.includes("function statusHtml") && server.includes("/status.html") && index.includes("/status") && styles.includes(".status-list") && smoke.includes("status page failed") && liveCheck.includes("status page status")) pass("public status page");
else fail("public status page", "missing");

if (server.includes("function deploymentInfo") && server.includes("RELEASE_VERSION") && server.includes("COMMIT_SHA") && server.includes("deployment: deploymentInfo()") && app.includes("release ${escapeHtml(releaseLabel)}") && app.includes("コミット") && smoke.includes("status json deployment version missing")) pass("deployment identity");
else fail("deployment identity", "missing");

if (server.includes("max-age=300, must-revalidate") && smoke.includes("app js should revalidate cache") && smoke.includes("styles css should revalidate cache") && liveCheck.includes("app js cache") && liveCheck.includes("styles css cache")) pass("static cache policy");
else fail("static cache policy", "missing");

if (server.includes("Method not allowed") && server.includes("Bad request") && smoke.includes("home head failed") && smoke.includes("static post should be rejected") && smoke.includes("malformed static path should be rejected")) pass("static method and path hardening");
else fail("static method and path hardening", "missing");

if (server.includes("function shutdown") && server.includes("SIGTERM") && server.includes("SIGINT") && server.includes("server.close")) pass("graceful shutdown");
else fail("graceful shutdown", "missing");

if (server.includes("statusCounts") && server.includes("recordRequest")) pass("request response metrics");
else fail("request response metrics", "missing");

if (server.includes("recentRequests") && server.includes("recentErrors")) pass("recent request history");
else fail("recent request history", "missing");

if (server.includes("rateLimitBlockedCount") && server.includes("recentRateLimits")) pass("rate limit history");
else fail("rate limit history", "missing");

if (server.includes("\"retry-after\"") && server.includes("\"x-ratelimit-limit\"") && smoke.includes("rate limit retry-after headers missing")) pass("rate limit response headers");
else fail("rate limit response headers", "missing");

if (server.includes("function duplicateMessage") && server.includes("duplicate message blocked") && smoke.includes("duplicate dm was not blocked")) pass("duplicate dm protection");
else fail("duplicate dm protection", "missing");

if (server.includes("retentionPolicy") && server.includes("adminListLimit") && app.includes("ログ保持")) pass("retention policy visibility");
else fail("retention policy visibility", "missing");

if (server.includes("x-request-id") && server.includes("requestId") && statusCheck.includes("trace: status")) pass("request id tracing");
else fail("request id tracing", "missing");

if (liveCheck.includes("health request id") && liveCheck.includes("status json request id") && liveCheck.includes("home request id")) pass("live request id coverage");
else fail("live request id coverage", "missing");

if (statusCheck.includes("status page request id missing") && statusCheck.includes("status.json request id missing") && statusCheck.includes("trace: status")) pass("status check request id coverage");
else fail("status check request id coverage", "missing");

if (server.includes("internal server error") && server.includes("NODE_ENV") && server.includes("production")) pass("production error masking");
else fail("production error masking", "missing");

if (app.includes("最終読込") && app.includes("最終保存")) pass("admin health metrics UI");
else fail("admin health metrics UI", "missing");

if (app.includes("リクエスト") && app.includes("5xxエラー")) pass("admin request metrics UI");
else fail("admin request metrics UI", "missing");

if (server.includes("refCounts") && app.includes("参照元")) pass("admin referral metrics UI");
else fail("admin referral metrics UI", "missing");

if (server.includes("openBetaFeedback") && server.includes("betaFeedback24h") && server.includes("highPriorityOpenBetaFeedback") && app.includes("未対応βFB") && app.includes("高優先未対応")) pass("admin beta feedback metrics");
else fail("admin beta feedback metrics", "missing");

if (server.includes("messageConversations") && server.includes("openMessageReports") && app.includes("未対応DM通報") && smoke.includes("admin stats dm conversation count failed")) pass("admin dm metrics");
else fail("admin dm metrics", "missing");

if (server.includes("function betaReadiness") && server.includes("セッション鍵長") && server.includes("DB SSL") && server.includes("データベースURL") && server.includes("セキュリティ連絡先") && server.includes("PUBLIC_BASE_URL must be a public https origin") && app.includes("β公開準備") && smoke.includes("database url system check missing") && smoke.includes("security contact system check missing")) pass("admin beta readiness checks");
else fail("admin beta readiness checks", "missing");

if (server.includes("function betaLaunchDecision") && server.includes("function betaTesterProgress") && server.includes("function betaSuccessMetrics") && server.includes("successMetrics") && server.includes("inviteToTesterRate") && server.includes("inviteDropoff") && server.includes("bottlenecks") && server.includes("backupAgeHours") && server.includes("nextActions") && server.includes("inviteTemplate") && server.includes("followupTemplates") && server.includes("placeholderAds") && server.includes("広告差し替え") && server.includes("β成功指標") && server.includes("βクイックスタート") && server.includes("問い合わせへ") && server.includes("recentModerationEvents") && server.includes("export_backup") && server.includes("openMessageReports") && app.includes("β公開判定") && app.includes("24h安全イベント") && app.includes("バックアップ経過") && app.includes("広告未差替") && app.includes("未対応DM通報") && app.includes("β成功指標") && app.includes("次の目標") && app.includes("βテスター進捗") && app.includes("招待URL訪問") && app.includes("進捗の詰まり") && app.includes("招待文をコピー") && app.includes("テスターへの追いメッセージ") && app.includes("copy-beta-followup") && app.includes("renderBetaLaunch")) pass("admin beta launch decision");
else fail("admin beta launch decision", "missing");

if (server.includes("function publicLaunchDecision") && server.includes("/api/admin/public-launch") && server.includes("一般公開モード") && server.includes("シード投稿") && server.includes("公式見本") && server.includes("officialBotPublished") && server.includes("データベースURL") && server.includes("公開面に未設定広告なし") && server.includes("広告URL") && server.includes("invalidAdTargets") && server.includes("publicTemplates") && app.includes("一般公開判定") && app.includes("publicLaunchFeed") && app.includes("renderPublicLaunch") && app.includes("公式見本") && app.includes("copy-public-template") && smoke.includes("public launch official sample check missing") && smoke.includes("public launch templates missing")) pass("admin public launch decision");
else fail("admin public launch decision", "missing");

if (server.includes("function officialBotDrafts") && server.includes("/api/admin/bot/drafts") && server.includes("/api/admin/bot/publish") && server.includes("function publishBotDrafts") && server.includes("hotTopicDrafts") && server.includes("/api/admin/bot/hot-topics/run") && server.includes("launchTag") && server.includes("recruit-apex-short-no-vc") && server.includes("recruit-overwatch-role-queue") && server.includes("recruit-splatoon-salmon-run") && server.includes("recruit-pokemon-champions-practice") && server.includes("thread-tonight-game-checkin") && app.includes("renderOfficialBot") && app.includes("bot-draft-summary") && app.includes("publish-bot-recommended") && app.includes("run-hot-topic-bot") && app.includes("ホット話題") && app.includes("おすすめだけ公開") && app.includes("見本") && smoke.includes("official bot overwatch draft missing") && smoke.includes("official bot selected publish failed") && smoke.includes("hot topic bot drafts missing")) pass("official bot launch seed coverage");
else fail("official bot launch seed coverage", "missing");

if (server.includes("function publicOperationsReport") && server.includes("/api/admin/public-report") && server.includes("Red Thread 公開運用メモ") && server.includes("launchManualChecks") && server.includes("launchWatchPlan") && server.includes("公開後手動確認") && server.includes("公開直後の監視") && server.includes("referrers") && server.includes("recentRateLimits") && server.includes("adOperationsSummary") && app.includes("公開運用レポート") && app.includes("renderPublicReport") && app.includes("公開後手動確認") && app.includes("公開直後の監視") && app.includes("広告URL確認") && app.includes("copy-public-report") && smoke.includes("public report ad summary missing") && smoke.includes("public report manual checks missing") && smoke.includes("public report launch watch plan missing")) pass("admin public operations report");
else fail("admin public operations report", "missing");

if (server.includes("function publicReleaseChecklist") && server.includes("/api/admin/public-release-checklist") && server.includes("Red Thread 公開直前チェック") && server.includes("gateSummary") && server.includes("最初に見る項目") && server.includes("セキュリティヘッダー") && server.includes("公開ステータス") && server.includes("ガイドライン") && server.includes("セキュリティ連絡先") && server.includes("Staff roles SQL") && server.includes("広告URL") && server.includes("admin:roles:write") && app.includes("公開直前チェック") && app.includes("renderPublicReleaseChecklist") && app.includes("最初に見る項目") && app.includes("copy-public-release-checklist") && smoke.includes("public release gate summary stop missing") && smoke.includes("public release ad target item missing") && smoke.includes("public release security contact item missing") && smoke.includes("public release staff role sql item missing") && smoke.includes("public release security header item missing") && smoke.includes("public release status check item missing") && smoke.includes("public release guidelines item missing")) pass("admin public release checklist");
else fail("admin public release checklist", "missing");

if (server.includes("function operatorDigest") && server.includes("/api/admin/operator-digest") && server.includes("Red Thread 運用ダイジェスト") && server.includes("invalidAdTargets") && server.includes("openInquirySummaries") && app.includes("運用ダイジェスト") && app.includes("renderOperatorDigest") && app.includes("広告未差替") && app.includes("未対応問い合わせ") && app.includes("copy-operator-digest") && smoke.includes("operator digest ad target summary missing") && smoke.includes("operator digest inquiry summaries missing")) pass("admin operator digest");
else fail("admin operator digest", "missing");

if (server.includes("function incidentBrief") && server.includes("/api/admin/incident-brief") && server.includes("Red Thread インシデント共有メモ") && server.includes("publicNoticeText") && server.includes("internalHandoffText") && index.includes("incidentBriefFeed") && app.includes("renderIncidentBrief") && app.includes("copy-incident-brief") && app.includes("copy-incident-public-notice") && app.includes("copy-incident-handoff") && smoke.includes("incident public notice missing")) pass("admin incident brief");
else fail("admin incident brief", "missing");

const publicCheck = fileText("scripts/public-readiness-check.js");
if (packageJson.scripts?.["public:check"] && packageJson.scripts?.["public:prelaunch"] && publicCheck.includes("Public readiness passed") && publicCheck.includes("public launch smoke coverage") && fileText("scripts/public-prelaunch-check.js").includes("Public prelaunch checks passed")) pass("public prelaunch command");
else fail("public prelaunch command", "missing");

const finalReleaseCheck = fileText("scripts/final-release-check.js");
if (packageJson.scripts?.["release:final"] && finalReleaseCheck.includes("Final release check passed") && finalReleaseCheck.includes("public-prelaunch-check.js") && finalReleaseCheck.includes("beta-prelaunch-check.js") && finalReleaseCheck.includes("postgres-readiness-check.js") && finalReleaseCheck.includes("production-config-check.js")) pass("final release command");
else fail("final release command", "missing");

const launchToday = fileText("scripts/launch-today.js");
if (packageJson.scripts?.["launch:today"] && launchToday.includes("Red Thread launch-today command") && launchToday.includes("final-release-check.js") && launchToday.includes("deploy-env-plan.js") && launchToday.includes("generate-launch-packet.js") && launchToday.includes("LIVE_BASE_URL") && launchToday.includes("Manual external steps required") && launchToday.includes("公開設定ハンドオフ") && launchToday.includes("公式ボット投稿") && launchToday.includes("おすすめだけ公開") && launchToday.includes("Share to a small group first")) pass("today launch command");
else fail("today launch command", "missing");

const launchPacket = fileText("scripts/generate-launch-packet.js");
if (packageJson.scripts?.["launch:packet"] && launchPacket.includes("Red Thread launch packet") && launchPacket.includes("launch-packet.md") && launchPacket.includes("does not include secret values") && launchPacket.includes("DATABASE_URL") && launchPacket.includes("yes, do not paste value") && launchPacket.includes("External setup order") && launchPacket.includes("公式ボット投稿") && launchPacket.includes("おすすめだけ公開") && launchPacket.includes("PUBLIC_WRITE_PAUSED=true")) pass("launch packet command");
else fail("launch packet command", "missing");

const productionConfigCheck = fileText("scripts/production-config-check.js");
if (packageJson.scripts?.["config:check"] && productionConfigCheck.includes("DATABASE_URL") && productionConfigCheck.includes("PUBLIC_SECURITY_CONTACT") && productionConfigCheck.includes("DISCORD_CLIENT_SECRET") && productionConfigCheck.includes("set") && productionConfigCheck.includes("missing") && productionConfigCheck.includes("must be origin only") && productionConfigCheck.includes("invalid or placeholder postgres url") && productionConfigCheck.includes("publicSecurityContactSummary") && productionConfigCheck.includes("localhost|127") && productionConfigCheck.includes("secretState(\"ADMIN_PIN\", 16") && productionConfigCheck.includes("discordClientIdState") && productionConfigCheck.includes("accountIdsState") && productionConfigCheck.includes("numericRangeState") && productionConfigCheck.includes("MAX_REQUEST_BODY_BYTES") && productionConfigCheck.includes("SERVER_REQUEST_TIMEOUT_MS") && productionConfigCheck.includes("function nextActionFor") && productionConfigCheck.includes("Next actions") && productionConfigCheck.includes("Discord redirect URL") && smoke.includes("invalid production request limits were not blocked") && !productionConfigCheck.includes("console.log(process.env.DATABASE_URL)")) pass("production config check");
else fail("production config check", "missing");

const deployEnvPlan = fileText("scripts/deploy-env-plan.js");
if (packageJson.scripts?.["deploy:plan"] && packageJson.scripts?.["deploy:verify"] && deployEnvPlan.includes("Red Thread deploy environment plan") && deployEnvPlan.includes("Do not paste DATABASE_URL") && deployEnvPlan.includes("DISCORD_CLIENT_SECRET") && deployEnvPlan.includes("admin:roles:write") && deployEnvPlan.includes("security.txt") && deployEnvPlan.includes("/status") && deployEnvPlan.includes("deploy:verify") && deployEnvPlan.includes("公開設定ハンドオフ") && deployEnvPlan.includes("Share to a small group first") && !deployEnvPlan.includes("console.log(process.env.DATABASE_URL)")) pass("deploy environment plan");
else fail("deploy environment plan", "missing");

if (server.includes("function publicBaseUrlState") && server.includes("public https origin") && smoke.includes("public base url path was not blocked")) pass("public base url origin guard");
else fail("public base url origin guard", "missing");

if (server.includes("function securityTxt") && server.includes("PUBLIC_SECURITY_CONTACT") && server.includes("/.well-known/security.txt") && server.includes("Expires:") && smoke.includes("security txt expires missing")) pass("dynamic security contact");
else fail("dynamic security contact", "missing");

if (server.includes("function publicSecurityContactState") && server.includes("example\\.(com|org|net)") && server.includes("localhost|127") && server.includes("PUBLIC_SECURITY_CONTACT must be a real public") && productionConfigCheck.includes("example\\.(com|org|net)") && productionConfigCheck.includes("invalid or placeholder contact") && smoke.includes("placeholder security contact was not blocked") && smoke.includes("local security contact was not blocked")) pass("production security contact guard");
else fail("production security contact guard", "missing");

if (server.includes("function databaseUrlState") && server.includes("DATABASE_URL must be a real production Postgres URL") && productionConfigCheck.includes("invalid or placeholder postgres url") && smoke.includes("placeholder database url was not blocked")) pass("production database url guard");
else fail("production database url guard", "missing");

if (server.includes("DATABASE_SSL=true is required for production Postgres") && smoke.includes("production database ssl false was not blocked") && productionConfigCheck.includes("DATABASE_SSL")) pass("production database ssl guard");
else fail("production database ssl guard", "missing");

if (server.includes("ADMIN_PIN must be at least 16 characters") && smoke.includes("short production admin pin was not blocked") && productionConfigCheck.includes("secretState(\"ADMIN_PIN\", 16")) pass("production admin pin length guard");
else fail("production admin pin length guard", "missing");

if (server.includes("function discordConfigState") && server.includes("Real Discord OAuth credentials are required") && productionConfigCheck.includes("discordClientIdState") && smoke.includes("placeholder discord oauth credentials were not blocked")) pass("production discord oauth guard");
else fail("production discord oauth guard", "missing");

if (server.includes("function staffAccountIdsState") && server.includes("ADMIN_ACCOUNT_IDS must include at least one real Discord account ID") && productionConfigCheck.includes("accountIdsState") && smoke.includes("placeholder admin account id was not blocked")) pass("production staff account id guard");
else fail("production staff account id guard", "missing");

if (packageJson.scripts?.["live:check"] && liveCheck.includes("Live smoke passed") && liveCheck.includes("healthz head status") && liveCheck.includes("/healthz") && liveCheck.includes("/readyz") && liveCheck.includes("/status.json") && liveCheck.includes("/status") && liveCheck.includes("/api/health") && liveCheck.includes("/api/state") && liveCheck.includes("state ad targets public https") && liveCheck.includes("security.txt public contact") && liveCheck.includes("home canonical absolute url") && liveCheck.includes("home og image absolute url") && liveCheck.includes("home structured data absolute url") && liveCheck.includes("robots sitemap absolute url") && liveCheck.includes("/terms.html") && liveCheck.includes("/privacy.html") && liveCheck.includes("/guidelines.html") && liveCheck.includes("/site.webmanifest") && liveCheck.includes("/.well-known/security.txt") && liveCheck.includes("/robots.txt") && liveCheck.includes("/sitemap.xml") && liveCheck.includes("/feed.xml") && liveCheck.includes("sitemap static pages")) pass("live deployed smoke check");
else fail("live deployed smoke check", "missing");

if (packageJson.scripts?.["status:check"] && statusCheck.includes("/healthz") && statusCheck.includes("/status") && statusCheck.includes("/status.json") && statusCheck.includes("Red Thread status") && statusCheck.includes("request") && statusCheck.includes("trace: status") && statusCheck.includes("release")) pass("light status check");
else fail("light status check", "missing");

if (server.includes("function betaDailyReport") && server.includes("function betaPostSummary") && server.includes("trendingPosts") && server.includes("summaryText") && server.includes("testerCallouts") && server.includes("operatorQueue") && server.includes("priority") && server.includes("safetyWatch") && server.includes("responseRate") && server.includes("staleQueue") && server.includes("backupAgeHours") && server.includes("openMessageReports") && app.includes("β日次レポート") && app.includes("日次メモをコピー") && app.includes("優先対応キュー") && app.includes("優先対応をコピー") && app.includes("copy-beta-queue") && app.includes("data-beta-report=\"queue\"") && app.includes("テスターへの声かけ") && app.includes("伸びている投稿") && app.includes("反応率") && app.includes("反応なし投稿") && app.includes("対応待ち24h+") && app.includes("バックアップ") && app.includes("注意アカウント") && app.includes("未対応DM通報") && app.includes("renderBetaReport")) pass("admin beta daily report");
else fail("admin beta daily report", "missing");

if (server.includes("actions.push") && app.includes("今日の確認")) pass("beta daily action prompts");
else fail("beta daily action prompts", "missing");

if (server.includes("function betaBacklog") && server.includes("fixCandidates") && server.includes("prioritySummary") && server.includes("highOpen") && app.includes("β改善バックログ") && app.includes("対応状況") && app.includes("優先度別") && app.includes("次の修正候補") && app.includes("修正候補をコピー") && app.includes("betaBacklogClipboardText") && app.includes("copy-beta-backlog") && app.includes("renderBetaBacklog")) pass("admin beta improvement backlog");
else fail("admin beta improvement backlog", "missing");

const betaCheck = fileText("scripts/beta-readiness-check.js");
if (betaCheck.includes("Beta readiness passed") && betaCheck.includes("BETA_ACCESS_CODE")) pass("beta readiness script");
else fail("beta readiness script", "missing");

if (app.includes("recentRequests") && app.includes("durationMs")) pass("admin recent request UI");
else fail("admin recent request UI", "missing");

if (app.includes("recentErrors") && app.includes("直近エラー")) pass("admin recent error UI");
else fail("admin recent error UI", "missing");

if (app.includes("recentRateLimits") && app.includes("直近429制限") && app.includes("429制限")) pass("admin rate limit visibility");
else fail("admin rate limit visibility", "missing");

if (app.includes("requestId") && app.includes("requestTrace") && app.includes("リクエスト照合") && app.includes("slice(0, 8)") && app.includes("buildInquiryReplyDraft") && app.includes("buildInquiryInternalMemo") && app.includes("\"copy-inquiry-reply\"") && app.includes("\"copy-inquiry-memo\"")) pass("admin request id UI");
else fail("admin request id UI", "missing");

if (app.includes("showErrorToast") && app.includes("copy-error-id") && app.includes("open-error-inquiry") && app.includes("openErrorInquiryDraft") && app.includes("直前にしていた操作")) pass("user-facing error tracking");
else fail("user-facing error tracking", "missing");

if (index.includes("inquiryRequestIdInput") && app.includes("requestId: $(\"#inquiryRequestIdInput\")") && app.includes("openErrorInquiryDraft") && app.includes("エラー内容") && app.includes("受付ID") && server.includes("inquiryId") && server.includes("receivedAt") && server.includes("function traceForRequestId") && smoke.includes("inquiry request trace field missing")) pass("support inquiry request id field");
else fail("support inquiry request id field", "missing");

if (server.includes("function userDataSummary") && server.includes("/api/me/data") && server.includes("dataHandling") && server.includes("retainedForSafety") && index.includes("myDataFeed") && app.includes("renderMyDataSummary") && app.includes("データの扱い") && app.includes("非表示DM") && app.includes("open-data-delete-request") && smoke.includes("user data recruitment count failed") && smoke.includes("user data handling deletion scope missing")) pass("user data summary and deletion request");
else fail("user data summary and deletion request", "missing");

if (server.includes("function userDataExport") && server.includes("/api/me/export") && app.includes("download-my-data") && app.includes("red-thread-user-data-") && smoke.includes("user data export format failed")) pass("user data export");
else fail("user data export", "missing");

if (server.includes("adminAccountDataMatch") && app.includes("inspect-delete-data") && app.includes("copy-account-data") && smoke.includes("admin account data summary count failed")) pass("admin account data summary");
else fail("admin account data summary", "missing");

if (server.includes("function eraseAccountData") && server.includes("/erase") && app.includes("erase-account-data") && app.includes("account_erasure") && smoke.includes("account erasure confirmation was not required") && smoke.includes("account erasure archive should not restore")) pass("admin account erasure");
else fail("admin account erasure", "missing");

if (server.includes("deletionRequestSummaries") && app.includes("deletionRequestSummaryBlock") && app.includes("未対応削除依頼") && smoke.includes("beta daily report deletion request data failed")) pass("deletion request operations report");
else fail("deletion request operations report", "missing");

if (index.includes("<option>削除依頼</option>") && server.includes("\"削除依頼\"") && app.includes("未対応削除依頼") && schema.includes("'削除依頼'") && smoke.includes("deletion request resolution note failed")) pass("deletion request inquiry category");
else fail("deletion request inquiry category", "missing");

if (index.includes("βフィードバック") && server.includes("inquiryCategories") && schema.includes("βフィードバック")) pass("beta feedback inquiry category");
else fail("beta feedback inquiry category", "missing");

if (app.includes("未対応βフィードバック") && app.includes("最近対応したβフィードバック") && app.includes("resolvedBetaFeedback") && app.includes("inquiry.category === \"βフィードバック\"")) pass("admin beta feedback priority list");
else fail("admin beta feedback priority list", "missing");

if (index.includes("adminInquirySearchInput") && index.includes("adminInquiryResolvedInput") && app.includes("adminInquiriesCache") && app.includes("inquirySearchText") && app.includes("includeResolved") && app.includes("検索に一致するお問い合わせはありません") && styles.includes(".inline-check")) pass("admin inquiry search");
else fail("admin inquiry search", "missing");

if (server.includes("/triage") && server.includes("betaFeedbackTypes") && server.includes("betaFeedbackPriorities") && app.includes("分類を保存") && app.includes("quick-triage-inquiry") && app.includes("クイック分類") && app.includes("betaFeedbackPriority") && styles.includes(".quick-actions")) pass("admin beta feedback triage");
else fail("admin beta feedback triage", "missing");

if (index.includes("betaNotice") && app.includes("openBetaFeedbackButton") && app.includes("open-beta-feedback") && app.includes("openBetaFeedbackDraft") && app.includes("分かりやすかった点") && styles.includes(".beta-notice")) pass("beta feedback prompt UI");
else fail("beta feedback prompt UI", "missing");

if (app.includes("unhandledrejection") && app.includes("showErrorToast(event.reason)")) pass("uncaught frontend error handling");
else fail("uncaught frontend error handling", "missing");

if (server.includes("BETA_ACCESS_CODE") && server.includes("verifyBetaAccess") && smoke.includes("beta inquiry with code failed") && smoke.includes("beta reply with code failed") && smoke.includes("beta report with code failed")) pass("beta write access gate");
else fail("beta write access gate", "missing");

if (server.includes("BETA_WRITE_PAUSED") && server.includes("verifyBetaWritePause") && server.includes("beta write paused") && app.includes("betaWritePaused") && styles.includes(".beta-access.paused") && smoke.includes("beta paused write should be blocked") && envExample.includes("BETA_WRITE_PAUSED=false")) pass("beta write pause");
else fail("beta write pause", "missing");

if (server.includes("PUBLIC_WRITE_PAUSED") && server.includes("public write paused") && smoke.includes("public paused write should be blocked") && envExample.includes("PUBLIC_WRITE_PAUSED=false")) pass("public write pause");
else fail("public write pause", "missing");

if (index.includes("betaAccessPanel") && app.includes("betaAccessKey") && app.includes("x-beta-code")) pass("beta access UI");
else fail("beta access UI", "missing");

if (index.includes("betaChecklist") && index.includes("betaQuickStart") && app.includes("renderBetaChecklist") && app.includes("betaFeedbackSentKey") && app.includes("data-beta-jump") && styles.includes(".beta-quickstart")) pass("beta tester checklist UI");
else fail("beta tester checklist UI", "missing");

if (index.includes("navMessageBadge") && app.includes("renderMessageNavBadge") && app.includes("messageSeenKey") && app.includes("markMessagesSeen") && styles.includes(".nav-badge")) pass("message nav badge");
else fail("message nav badge", "missing");

if (server.includes("function sanitizeAdTargetUrl") && server.includes("parsed.protocol === \"https:\"") && server.includes("localhost|127") && app.includes("noopener noreferrer") && smoke.includes("local ad target was not rejected")) pass("ad target URL validation");
else fail("ad target URL validation", "missing");

if (server.includes("ENABLE_SEED_DATA") && server.includes("initialData.recruitments = []") && server.includes("initialData.threads = []")) pass("production seed data disabled");
else fail("production seed data disabled", "missing");

if (server.includes("!isPlaceholderAdSlot(slot)") && app.includes("isPlaceholderAdSlot") && !app.includes("ここにアフィリエイト広告を掲載できます")) pass("public placeholder ads hidden");
else fail("public placeholder ads hidden", "missing");

if (server.includes("ADMIN_ACCOUNT_IDS")) pass("admin account role support");
else fail("admin account role support", "missing");

if (server.includes("MODERATOR_ACCOUNT_IDS") && server.includes("staffOnly")) pass("moderator role support");
else fail("moderator role support", "missing");

const postgresCheck = fileText("scripts/postgres-readiness-check.js");
if (postgresCheck.includes("information_schema.columns") && postgresCheck.includes("relrowsecurity") && postgresCheck.includes("pg_policies") && postgresCheck.includes("generated-admin-roles.sql") && postgresCheck.includes("adminRolePlaceholders") && postgresCheck.includes("direct_messages") && postgresCheck.includes("conversation_id") && postgresCheck.includes("dm participants read messages") && postgresCheck.includes("npm run admin:roles:write")) pass("postgres readiness check");
else fail("postgres readiness check", "missing");

const postgresStore = fileText("storage/postgres-store.js");
if (postgresStore.includes("ADMIN_ACCOUNT_IDS") && postgresStore.includes("role = 'admin'")) pass("postgres admin role sync");
else fail("postgres admin role sync", "missing");

if (postgresStore.includes("MODERATOR_ACCOUNT_IDS") && postgresStore.includes("'moderator'")) pass("postgres moderator role sync");
else fail("postgres moderator role sync", "missing");

if (server.includes("summary_large_image") && server.includes("og:image")) pass("share OGP image");
else fail("share OGP image", "missing");

if (server.includes("DiscussionForumPosting") && server.includes("jsonLdScript") && server.includes("function shareDescription") && smoke.includes("share page missing structured data") && smoke.includes("recruitment share page missing recruitment details") && smoke.includes("thread share page missing thread details")) pass("share structured data");
else fail("share structured data", "missing");

if (server.includes("/reject")) pass("report rejection route");
else fail("report rejection route", "missing");

if (schema.includes("'message'") && server.includes('type === "messages"') && server.includes("cannot report your own message") && server.includes("hide_message") && server.includes('deletedItem.kind === "message"') && app.includes("report-message") && app.includes("hide-reported-message") && app.includes("deletedKindLabel") && smoke.includes("Smoke DM report") && smoke.includes("outsider dm report was not blocked") && smoke.includes("hidden dm restore failed")) pass("direct message report flow");
else fail("direct message report flow", "missing");

const exportSql = fileText("scripts/export-json-to-sql.js");
if (exportSql.includes("insert into direct_messages") && exportSql.includes("fromAccountId") && exportSql.includes("toAccountId") && exportSql.includes("beta_feedback_type") && exportSql.includes("request_id") && exportSql.includes("resolution_note")) pass("json sql export dm and beta fields");
else fail("json sql export dm and beta fields", "missing");

if (server.includes("checksum") && fileText("scripts/backup-json-data.js").includes("sha256:") && fileText("scripts/backup-json-data.js").includes("\"messages\"")) pass("backup checksum");
else fail("backup checksum", "missing");

const restoreGuide = fileText("docs/restore-guide.md");
if (restoreGuide.includes("data.messages") && restoreGuide.includes("hidden DMs") && restoreGuide.includes("削除履歴")) pass("restore guide dm coverage");
else fail("restore guide dm coverage", "missing");

if (index.includes("exportBackupButton") && index.includes("backupStatusFeed") && app.includes("/api/admin/export") && app.includes("/api/admin/backup-status") && app.includes("renderBackupStatus") && app.includes("copy-backup-status") && app.includes("downloadJson") && app.includes("partyfinder-backup-") && app.includes("照合ID") && app.includes("replace(/^sha256:/") && app.includes("button.disabled = true") && app.includes("取得中...") && app.includes("button.disabled = false") && server.includes("function backupStatus") && server.includes("checksumPrefix") && smoke.includes("backup status summary text missing") && styles.includes(".topbar.admin-tools")) pass("admin backup export UI");
else fail("admin backup export UI", "missing");

const verifyBackup = fileText("scripts/verify-backup.js");
if (verifyBackup.includes("checksum mismatch") && verifyBackup.includes("partyfinder-backup-v1") && verifyBackup.includes("\"messages\"") && verifyBackup.includes("exportedAt")) pass("backup verification script");
else fail("backup verification script", "missing");

const backupDrill = fileText("scripts/backup-drill.js");
if (packageJson.scripts?.["backup:drill"] && backupDrill.includes("backup-json-data.js") && backupDrill.includes("verify-backup.js") && backupDrill.includes("Backup drill passed")) pass("backup drill script");
else fail("backup drill script", "missing");

const jsonStore = fileText("storage/json-store.js");
if (jsonStore.includes("renameSync(tempPath, dbPath)")) pass("json atomic write");
else fail("json atomic write", "missing");

const failed = checks.filter(check => !check.ok);
for (const check of checks) {
  const mark = check.ok ? "ok" : "fail";
  console.log(`${mark} - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length) {
  console.error(`Preflight failed: ${failed.length} issue(s)`);
  process.exit(1);
}

console.log("Preflight passed");
