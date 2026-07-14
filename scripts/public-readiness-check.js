const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const checks = [];

function fileText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function pass(name, detail = "") {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = "") {
  checks.push({ ok: false, name, detail });
}

function requireFile(relativePath) {
  if (exists(relativePath)) pass(`file: ${relativePath}`);
  else fail(`file: ${relativePath}`, "missing");
}

for (const file of [
  "docs/prelaunch-checklist.md",
  "docs/operator-handoff.md",
  "docs/public-operations-runbook.md",
  "docs/public-release-final-checklist.md",
  "docs/launch-day-runbook.md",
  "docs/env-setup-checklist.md",
  "docs/external-service-work-order.md",
  "docs/postgres-production-checklist.md",
  "scripts/preflight-check.js",
  "scripts/production-config-check.js",
  "scripts/generate-admin-roles-sql.js",
  "scripts/deploy-env-plan.js",
  "scripts/deploy-verify.js",
  "scripts/launch-today.js",
  "scripts/public-prelaunch-check.js",
  "scripts/live-smoke-check.js",
  "scripts/status-check.js",
  "scripts/smoke-test.js",
  "Dockerfile",
  ".env.example",
  "public/guidelines.html"
]) {
  requireFile(file);
}

const server = fileText("server.js");
const app = fileText("public/app.js");
const index = fileText("public/index.html");
const styles = fileText("public/styles.css");
const terms = fileText("public/terms.html");
const privacy = fileText("public/privacy.html");
const guidelines = fileText("public/guidelines.html");
const smoke = fileText("scripts/smoke-test.js");
const envExample = fileText(".env.example");
const preflight = fileText("scripts/preflight-check.js");
const liveCheck = fileText("scripts/live-smoke-check.js");
const statusCheck = fileText("scripts/status-check.js");
const deployVerify = fileText("scripts/deploy-verify.js");
const adminRolesGenerator = fileText("scripts/generate-admin-roles-sql.js");
const prelaunch = fileText("docs/prelaunch-checklist.md");
const operatorHandoff = fileText("docs/operator-handoff.md");
const publicOperationsRunbook = fileText("docs/public-operations-runbook.md");
const publicReleaseChecklist = fileText("docs/public-release-final-checklist.md");
const launchDayRunbook = fileText("docs/launch-day-runbook.md");
const externalServiceWorkOrder = fileText("docs/external-service-work-order.md");
const postgresChecklist = fileText("docs/postgres-production-checklist.md");
const dockerfile = fileText("Dockerfile");
const packageJson = JSON.parse(fileText("package.json"));

if (server.includes("function publicLaunchDecision") && server.includes("/api/admin/public-launch")) pass("public launch decision API");
else fail("public launch decision API", "missing");

if (server.includes("publicTemplates") && server.includes("X告知") && app.includes("copy-public-template") && smoke.includes("public launch templates missing")) pass("public launch templates");
else fail("public launch templates", "missing");

if (server.includes("function publicOperationsReport") && server.includes("/api/admin/public-report") && server.includes("Red Thread 公開運用メモ") && server.includes("launchManualChecks") && server.includes("launchWatchPlan") && server.includes("公開後手動確認") && server.includes("公開直後の監視")) pass("public operations report API");
else fail("public operations report API", "missing");

if (server.includes("function publicReleaseChecklist") && server.includes("/api/admin/public-release-checklist") && server.includes("Red Thread 公開直前チェック") && server.includes("gateSummary") && server.includes("最初に見る項目") && server.includes("セキュリティヘッダー") && server.includes("公開ステータス") && server.includes("ガイドライン") && server.includes("セキュリティ連絡先") && server.includes("Staff roles SQL") && server.includes("admin:roles:write")) pass("public release checklist API");
else fail("public release checklist API", "missing");

if (server.includes("function deploymentHandoff") && server.includes("/api/admin/deployment-handoff") && server.includes("Red Thread 外部サービス設定ハンドオフ") && server.includes("PUBLIC_SECURITY_CONTACT") && server.includes("Staff roles SQL") && server.includes("handoffSteps") && server.includes("envChecklist") && server.includes("安全な環境変数チェック") && server.includes("実行順") && smoke.includes("deployment handoff security contact item missing") && smoke.includes("deployment handoff staff role sql item missing") && smoke.includes("deployment handoff steps missing") && smoke.includes("deployment handoff env checklist missing")) pass("deployment handoff API");
else fail("deployment handoff API", "missing");

if (server.includes("function operatorDigest") && server.includes("/api/admin/operator-digest") && server.includes("invalidAdTargets") && server.includes("openInquirySummaries") && app.includes("運用ダイジェスト") && app.includes("renderOperatorDigest") && app.includes("広告未差替") && app.includes("未対応問い合わせ")) pass("operator digest API and UI");
else fail("operator digest API and UI", "missing");

if (server.includes("function incidentBrief") && server.includes("/api/admin/incident-brief") && server.includes("publicNoticeText") && app.includes("インシデント共有") && app.includes("renderIncidentBrief") && app.includes("copy-incident-public-notice") && smoke.includes("incident public notice missing")) pass("incident brief API and UI");
else fail("incident brief API and UI", "missing");

if (server.includes("function backupStatus") && server.includes("/api/admin/backup-status") && app.includes("バックアップ状況") && app.includes("renderBackupStatus") && app.includes("copy-backup-status") && smoke.includes("backup status summary text missing")) pass("backup status API and UI");
else fail("backup status API and UI", "missing");

if (envExample.includes("PUBLIC_WRITE_PAUSED=false") && server.includes("PUBLIC_WRITE_PAUSED") && server.includes("public write paused") && smoke.includes("public paused write should be blocked")) pass("public emergency write pause");
else fail("public emergency write pause", "missing");

if (index.includes("publicLaunchStatus") && index.includes("publicLaunchFeed") && app.includes("renderPublicLaunch") && app.includes("一般公開判定")) pass("public launch admin UI");
else fail("public launch admin UI", "missing");

if (index.includes("publicReportStatus") && index.includes("publicReportFeed") && app.includes("renderPublicReport") && app.includes("copy-public-report") && app.includes("公開後手動確認") && app.includes("公開直後の監視") && app.includes("広告URL確認")) pass("public operations admin UI");
else fail("public operations admin UI", "missing");

if (index.includes("publicReleaseChecklistStatus") && index.includes("publicReleaseChecklistFeed") && app.includes("renderPublicReleaseChecklist") && app.includes("最初に見る項目") && app.includes("copy-public-release-checklist") && server.includes("広告URL")) pass("public release checklist admin UI");
else fail("public release checklist admin UI", "missing");

if (index.includes("deploymentHandoffStatus") && index.includes("deploymentHandoffFeed") && app.includes("renderDeploymentHandoff") && app.includes("copy-deployment-handoff") && app.includes("実行順") && app.includes("安全な環境変数チェック")) pass("deployment handoff admin UI");
else fail("deployment handoff admin UI", "missing");

if (server.includes("一般公開モード") && server.includes("シード投稿") && server.includes("公式見本") && server.includes("officialBotPublished") && app.includes("公式見本") && smoke.includes("public launch official sample check missing") && server.includes("データベースURL") && server.includes("未対応通報") && server.includes("バックアップ") && server.includes("広告枠") && server.includes("広告URL")) pass("public launch blockers");
else fail("public launch blockers", "missing");

if (server.includes("NODE_ENV === \"production\"") && server.includes("initialData.recruitments = []") && server.includes("initialData.threads = []") && server.includes("ENABLE_SEED_DATA")) pass("production demo data gate");
else fail("production demo data gate", "missing");

if (server.includes("!isPlaceholderAdSlot(slot)") && app.includes("isPlaceholderAdSlot") && smoke.includes("public placeholder ads should be hidden")) pass("public placeholder ads hidden");
else fail("public placeholder ads hidden", "missing");

if (server.includes("function sanitizeAdTargetUrl") && server.includes("parsed.protocol === \"https:\"") && server.includes("localhost|127") && app.includes("noopener noreferrer") && smoke.includes("local ad target was not rejected")) pass("public ad target hardening");
else fail("public ad target hardening", "missing");

if (server.includes("BETA_ACCESS_CODE") && server.includes("一般公開モード") && prelaunch.includes("`一般公開判定` has no stop items")) pass("beta gate removal checklist");
else fail("beta gate removal checklist", "missing");

if (server.includes("Production launch requires STORAGE_DRIVER=postgres") && postgresChecklist.includes("STORAGE_DRIVER=postgres")) pass("postgres production requirement");
else fail("postgres production requirement", "missing");

if (server.includes("PUBLIC_BASE_URL must be a public https origin") && prelaunch.includes("PUBLIC_BASE_URL")) pass("public https URL requirement");
else fail("public https URL requirement", "missing");

if (server.includes("Real Discord OAuth credentials are required before production launch") && prelaunch.includes("DISCORD_CLIENT_ID") && prelaunch.includes("DISCORD_CLIENT_SECRET")) pass("discord production requirement");
else fail("discord production requirement", "missing");

if (server.includes("ADMIN_ACCOUNT_IDS must include at least one real Discord account ID") && prelaunch.includes("ADMIN_ACCOUNT_IDS")) pass("admin account production requirement");
else fail("admin account production requirement", "missing");

if (server.includes("content-security-policy") && server.includes("permissions-policy") && server.includes("verifyWriteOrigin")) pass("public security baseline");
else fail("public security baseline", "missing");

if (dockerfile.includes("HEALTHCHECK") && dockerfile.includes("/healthz") && dockerfile.includes("process.env.PORT")) pass("docker health check");
else fail("docker health check", "missing");

if (server.includes("strict-transport-security") && server.includes("cross-origin-opener-policy") && liveCheck.includes("home hsts") && liveCheck.includes("home opener policy") && liveCheck.includes("home content security policy") && liveCheck.includes("home permissions policy") && liveCheck.includes("home content type options")) pass("production security headers");
else fail("production security headers", "missing");

if (index.includes("application/ld+json") && index.includes("\"@type\": \"WebSite\"") && server.includes("DiscussionForumPosting") && server.includes("function homeHtml") && server.includes("function shareDescription") && smoke.includes("home canonical absolute url missing") && smoke.includes("share page missing structured data") && smoke.includes("recruitment share page missing recruitment details") && smoke.includes("thread share page missing thread details")) pass("public SEO structured data");
else fail("public SEO structured data", "missing");

if (server.includes("function sitemapXml") && server.includes("/guidelines.html") && server.includes("/share/${item.type}") && smoke.includes("sitemap recruitment share missing") && smoke.includes("sitemap guidelines missing")) pass("public dynamic sitemap");
else fail("public dynamic sitemap", "missing");

if (server.includes("function feedXml") && server.includes("/feed.xml") && index.includes("application/rss+xml") && smoke.includes("feed recruitment share missing")) pass("public rss feed");
else fail("public rss feed", "missing");

if (server.includes("x-request-id") && server.includes("function traceForRequestId") && app.includes("open-error-inquiry") && app.includes("openErrorInquiryDraft") && app.includes("直前にしていた操作") && app.includes("リクエスト照合") && app.includes("inquiryRequestIdInput") && app.includes("buildInquiryReplyDraft") && app.includes("\"copy-inquiry-memo\"")) pass("public support handoff");
else fail("public support handoff", "missing");

if (liveCheck.includes("health request id") && liveCheck.includes("status json request id") && liveCheck.includes("home request id")) pass("live request id coverage");
else fail("live request id coverage", "missing");

if (statusCheck.includes("status page request id missing") && statusCheck.includes("status.json request id missing") && statusCheck.includes("trace: status")) pass("status check request id coverage");
else fail("status check request id coverage", "missing");

if (terms.includes("通報と削除依頼") && terms.includes("広告と外部リンク") && privacy.includes("データ確認と保存") && privacy.includes("非表示DM") && privacy.includes("処理概要") && privacy.includes("保存期間") && guidelines.includes("コミュニティガイドライン") && guidelines.includes("返信とDM") && guidelines.includes("禁止する投稿")) pass("public legal pages coverage");
else fail("public legal pages coverage", "missing");

if (index.includes("app-footer") && index.includes("/terms.html") && index.includes("/privacy.html") && index.includes("/guidelines.html") && index.includes("/status") && index.includes("/feed.xml") && app.includes("querySelectorAll(\"[data-view]\")")) pass("public footer navigation");
else fail("public footer navigation", "missing");

if (server.includes("function statusHtml") && server.includes("/status.html") && index.includes("/status") && styles.includes(".status-list") && smoke.includes("status page failed") && liveCheck.includes("status page status")) pass("public status page");
else fail("public status page", "missing");

if (smoke.includes("/api/admin/public-launch") && smoke.includes("public launch decision status failed")) pass("public launch smoke coverage");
else fail("public launch smoke coverage", "missing");

if (server.includes("function officialBotDrafts") && server.includes("/api/admin/bot/drafts") && server.includes("/api/admin/bot/publish") && server.includes("launchTag") && server.includes("recruit-apex-short-no-vc") && server.includes("recruit-overwatch-role-queue") && server.includes("recruit-splatoon-salmon-run") && server.includes("recruit-pokemon-champions-practice") && server.includes("thread-tonight-game-checkin") && app.includes("bot-draft-summary") && app.includes("publish-bot-recommended") && app.includes("おすすめだけ公開") && smoke.includes("official bot overwatch draft missing") && smoke.includes("official bot selected publish failed")) pass("official bot launch readiness");
else fail("official bot launch readiness", "missing");

if (smoke.includes("/api/admin/public-report") && smoke.includes("public report summary text missing")) pass("public report smoke coverage");
else fail("public report smoke coverage", "missing");

if (smoke.includes("/api/admin/public-release-checklist") && smoke.includes("public release checklist summary missing") && smoke.includes("public release database url item missing") && smoke.includes("public release security contact item missing") && smoke.includes("public release ad target item missing") && smoke.includes("public release staff role sql item missing") && smoke.includes("public release security header item missing") && smoke.includes("public release status check item missing") && smoke.includes("public release guidelines item missing")) pass("public release checklist smoke coverage");
else fail("public release checklist smoke coverage", "missing");

if (preflight.includes("admin public launch decision") && preflight.includes("/api/admin/public-launch")) pass("public launch preflight coverage");
else fail("public launch preflight coverage", "missing");

if (operatorHandoff.includes("Public release switch") && operatorHandoff.includes("一般公開判定") && operatorHandoff.includes("/status.json")) pass("public release handoff");
else fail("public release handoff", "missing");

if (publicOperationsRunbook.includes("Daily 5-minute check") && publicOperationsRunbook.includes("First 30-minute watch") && publicOperationsRunbook.includes("公開直後の監視") && publicOperationsRunbook.includes("Go slow conditions") && publicOperationsRunbook.includes("広告URL確認") && publicOperationsRunbook.includes("公式ボット投稿") && publicOperationsRunbook.includes("おすすめだけ公開") && publicOperationsRunbook.includes("Emergency pause") && publicOperationsRunbook.includes("PUBLIC_WRITE_PAUSED")) pass("public operations runbook");
else fail("public operations runbook", "missing");

if (publicReleaseChecklist.includes("Local final gate") && publicReleaseChecklist.includes("npm run release:final") && publicReleaseChecklist.includes("Hosting settings") && publicReleaseChecklist.includes("npm run admin:roles:write") && publicReleaseChecklist.includes("db/generated-admin-roles.sql") && publicReleaseChecklist.includes("Live URL check") && publicReleaseChecklist.includes("/status.json") && publicReleaseChecklist.includes("広告URL確認") && publicReleaseChecklist.includes("公式ボット投稿") && publicReleaseChecklist.includes("おすすめだけ公開") && publicReleaseChecklist.includes("First 30 minutes after sharing")) pass("public release final checklist");
else fail("public release final checklist", "missing");

if (launchDayRunbook.includes("Stop points") && launchDayRunbook.includes("First public share") && launchDayRunbook.includes("Emergency brake") && launchDayRunbook.includes("/status.json") && launchDayRunbook.includes("公式ボット投稿") && launchDayRunbook.includes("おすすめだけ公開") && launchDayRunbook.includes("PUBLIC_WRITE_PAUSED=true")) pass("launch day runbook");
else fail("launch day runbook", "missing");

if (externalServiceWorkOrder.includes("Stop before secrets") && externalServiceWorkOrder.includes("Supabase or Postgres") && externalServiceWorkOrder.includes("Hosting environment") && externalServiceWorkOrder.includes("Discord Developer Portal") && externalServiceWorkOrder.includes("First login and staff SQL") && externalServiceWorkOrder.includes("First production admin pass") && externalServiceWorkOrder.includes("Small public share") && externalServiceWorkOrder.includes("/status.json") && externalServiceWorkOrder.includes("npm run deploy:verify") && externalServiceWorkOrder.includes("npm run admin:roles:write")) pass("external service work order");
else fail("external service work order", "missing");

if (packageJson.scripts?.["public:check"] && packageJson.scripts?.["public:prelaunch"] && packageJson.scripts?.["deploy:verify"] === "node scripts/deploy-verify.js" && packageJson.scripts?.["admin:roles:write"] && deployVerify.includes("status-check.js") && deployVerify.includes("live-smoke-check.js") && deployVerify.includes("Deploy verification needs a public base URL") && deployVerify.includes("public origin only") && adminRolesGenerator.includes("generated-admin-roles.sql")) pass("public launch npm scripts");
else fail("public launch npm scripts", "missing");

if (packageJson.scripts?.["config:check"] && fileText("scripts/production-config-check.js").includes("Production config check") && fileText("scripts/production-config-check.js").includes("Next actions") && fileText("scripts/production-config-check.js").includes("Discord redirect URL") && fileText("scripts/final-release-check.js").includes("production-config-check.js")) pass("production config npm script");
else fail("production config npm script", "missing");

if (packageJson.scripts?.["launch:today"] && fileText("scripts/launch-today.js").includes("Launch-today local preparation passed") && fileText("scripts/launch-today.js").includes("deploy-verify.js") && fileText("scripts/launch-today.js").includes("generate-launch-packet.js") && fileText("scripts/launch-today.js").includes("公開設定ハンドオフ") && fileText("scripts/launch-today.js").includes("公式ボット投稿") && fileText("scripts/launch-today.js").includes("おすすめだけ公開") && fileText("scripts/launch-today.js").includes("Share to a small group first")) pass("today launch npm script");
else fail("today launch npm script", "missing");

if (packageJson.scripts?.["launch:packet"] && fileText("scripts/generate-launch-packet.js").includes("Red Thread launch packet") && fileText("scripts/generate-launch-packet.js").includes("launch-packet.md") && fileText("scripts/generate-launch-packet.js").includes("does not include secret values") && fileText("scripts/generate-launch-packet.js").includes("External setup order") && fileText("scripts/generate-launch-packet.js").includes("公式ボット投稿") && fileText("scripts/generate-launch-packet.js").includes("おすすめだけ公開") && fileText("scripts/generate-launch-packet.js").includes("PUBLIC_WRITE_PAUSED=true")) pass("launch packet npm script");
else fail("launch packet npm script", "missing");

const deployEnvPlan = fileText("scripts/deploy-env-plan.js");
if (packageJson.scripts?.["deploy:plan"] && packageJson.scripts?.["deploy:verify"] && deployEnvPlan.includes("Red Thread deploy environment plan") && deployEnvPlan.includes("Do not paste DATABASE_URL") && deployEnvPlan.includes("DISCORD_CLIENT_SECRET") && deployEnvPlan.includes("admin:roles:write") && deployEnvPlan.includes("security.txt") && deployEnvPlan.includes("/status") && deployEnvPlan.includes("公開設定ハンドオフ") && deployEnvPlan.includes("Share to a small group first") && externalServiceWorkOrder.includes("npm run deploy:plan") && externalServiceWorkOrder.includes("npm run deploy:verify") && fileText("docs/env-setup-checklist.md").includes("npm run deploy:plan") && fileText("docs/env-setup-checklist.md").includes("npm run deploy:verify")) pass("deploy environment plan");
else fail("deploy environment plan", "missing");

if (server.includes("function publicBaseUrlState") && server.includes("public https origin") && fileText("scripts/production-config-check.js").includes("must be origin only") && smoke.includes("public base url path was not blocked")) pass("public base url origin guard");
else fail("public base url origin guard", "missing");

if (server.includes("function publicSecurityContactState") && server.includes("example\\.(com|org|net)") && server.includes("localhost|127") && server.includes("PUBLIC_SECURITY_CONTACT must be a real public") && fileText("scripts/production-config-check.js").includes("publicSecurityContactSummary") && fileText("scripts/production-config-check.js").includes("invalid or placeholder contact") && smoke.includes("placeholder security contact was not blocked") && smoke.includes("local security contact was not blocked")) pass("production security contact guard");
else fail("production security contact guard", "missing");

if (server.includes("function databaseUrlState") && server.includes("DATABASE_URL must be a real production Postgres URL") && fileText("scripts/production-config-check.js").includes("invalid or placeholder postgres url") && smoke.includes("placeholder database url was not blocked")) pass("production database url guard");
else fail("production database url guard", "missing");

if (server.includes("DATABASE_SSL=true is required for production Postgres") && smoke.includes("production database ssl false was not blocked") && fileText("scripts/production-config-check.js").includes("DATABASE_SSL")) pass("production database ssl guard");
else fail("production database ssl guard", "missing");

if (server.includes("ADMIN_PIN must be at least 16 characters") && smoke.includes("short production admin pin was not blocked") && fileText("scripts/production-config-check.js").includes("secretState(\"ADMIN_PIN\", 16")) pass("production admin pin length guard");
else fail("production admin pin length guard", "missing");

if (server.includes("function discordConfigState") && server.includes("Real Discord OAuth credentials are required") && fileText("scripts/production-config-check.js").includes("discordClientIdState") && smoke.includes("placeholder discord oauth credentials were not blocked")) pass("production discord oauth guard");
else fail("production discord oauth guard", "missing");

if (server.includes("function staffAccountIdsState") && server.includes("ADMIN_ACCOUNT_IDS must include at least one real Discord account ID") && fileText("scripts/production-config-check.js").includes("accountIdsState") && smoke.includes("placeholder admin account id was not blocked")) pass("production staff account id guard");
else fail("production staff account id guard", "missing");

if (packageJson.scripts?.["live:check"] && liveCheck.includes("Live smoke passed") && liveCheck.includes("LIVE_BASE_URL") && liveCheck.includes("/healthz") && liveCheck.includes("/readyz") && liveCheck.includes("/status.json") && liveCheck.includes("/status") && liveCheck.includes("/api/health") && liveCheck.includes("/api/state") && liveCheck.includes("state ad html sanitized") && liveCheck.includes("security.txt public contact") && liveCheck.includes("home canonical absolute url") && liveCheck.includes("home og image absolute url") && liveCheck.includes("home structured data absolute url") && liveCheck.includes("robots sitemap absolute url") && liveCheck.includes("/terms.html") && liveCheck.includes("/privacy.html") && liveCheck.includes("/guidelines.html") && liveCheck.includes("/site.webmanifest") && liveCheck.includes("/.well-known/security.txt") && liveCheck.includes("/sitemap.xml") && liveCheck.includes("/feed.xml") && liveCheck.includes("sitemap static pages")) pass("live deployed smoke check");
else fail("live deployed smoke check", "missing");

if (packageJson.scripts?.["status:check"] && statusCheck.includes("/healthz") && statusCheck.includes("/status") && statusCheck.includes("/status.json") && statusCheck.includes("Red Thread status") && statusCheck.includes("request") && statusCheck.includes("trace: status") && statusCheck.includes("release")) pass("light status check");
else fail("light status check", "missing");

if (server.includes("function deploymentInfo") && liveCheck.includes("status json deployment") && statusCheck.includes("release") && publicReleaseChecklist.includes("release identity") && externalServiceWorkOrder.includes("RELEASE_VERSION")) pass("deployment identity check");
else fail("deployment identity check", "missing");

if (server.includes("max-age=300, must-revalidate") && smoke.includes("app js should revalidate cache") && liveCheck.includes("app js cache")) pass("static cache policy");
else fail("static cache policy", "missing");

if (server.includes("Method not allowed") && server.includes("Bad request") && smoke.includes("home head failed") && smoke.includes("static post should be rejected") && smoke.includes("malformed static path should be rejected")) pass("static method and path hardening");
else fail("static method and path hardening", "missing");

if (server.includes("\"retry-after\"") && server.includes("\"x-ratelimit-limit\"") && smoke.includes("rate limit retry-after headers missing")) pass("rate limit response headers");
else fail("rate limit response headers", "missing");

if (server.includes("isUserContributionWrite(req, url) && rejectBanned") && smoke.includes("banned account status update was not blocked") && smoke.includes("banned account delete was not blocked")) pass("banned contribution write gate");
else fail("banned contribution write gate", "missing");

if (server.includes("suspension: ban ?") && app.includes("利用制限中") && styles.includes(".account.suspended") && smoke.includes("banned account suspension status missing")) pass("banned account status visibility");
else fail("banned account status visibility", "missing");

if (app.includes("error.reason = data.reason") && app.includes("利用制限中のため操作できません")) pass("banned error toast guidance");
else fail("banned error toast guidance", "missing");

if (server.includes("function duplicateMessage") && smoke.includes("duplicate dm was not blocked")) pass("duplicate dm protection");
else fail("duplicate dm protection", "missing");

for (const check of checks) {
  console.log(`${check.ok ? "ok" : "ng"} - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}

const failed = checks.filter(check => !check.ok);
if (failed.length) {
  console.error(`Public readiness failed: ${failed.length} issue(s)`);
  process.exit(1);
}

console.log("Public readiness passed");
