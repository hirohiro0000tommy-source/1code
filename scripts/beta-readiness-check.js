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
  "docs/beta-test-guide.md",
  "docs/env-setup-checklist.md",
  "docs/prelaunch-checklist.md",
  "docs/web-beta-launch-quickstart.md",
  "docs/operator-handoff.md",
  "docs/public-operations-runbook.md",
  "docs/restore-guide.md",
  "scripts/generate-secrets.js",
  "scripts/preflight-check.js",
  "scripts/beta-prelaunch-check.js",
  "scripts/smoke-test.js",
  ".env.example"
]) {
  requireFile(file);
}

const envExample = fileText(".env.example");
if (envExample.includes("BETA_ACCESS_CODE=")) pass("env example: BETA_ACCESS_CODE");
else fail("env example: BETA_ACCESS_CODE", "missing");

if (envExample.includes("BETA_WRITE_PAUSED=false")) pass("env example: BETA_WRITE_PAUSED");
else fail("env example: BETA_WRITE_PAUSED", "missing");

if (process.env.BETA_ACCESS_CODE) pass("BETA_ACCESS_CODE", "set");
else pass("BETA_ACCESS_CODE", "not set locally; set it before inviting external testers");

const server = fileText("server.js");
const app = fileText("public/app.js");
const index = fileText("public/index.html");
const betaGuide = fileText("docs/beta-test-guide.md");
const envGuide = fileText("docs/env-setup-checklist.md");
const prelaunch = fileText("docs/prelaunch-checklist.md");
const webBetaLaunchGuide = fileText("docs/web-beta-launch-quickstart.md");
const operatorHandoff = fileText("docs/operator-handoff.md");
const publicOperationsRunbook = fileText("docs/public-operations-runbook.md");
const restoreGuide = fileText("docs/restore-guide.md");

if (server.includes("verifyBetaAccess") && app.includes("x-beta-code") && fileText("scripts/smoke-test.js").includes("beta inquiry with code failed")) pass("beta write gate");
else fail("beta write gate", "missing");

if (server.includes("verifyBetaWritePause") && server.includes("beta write paused") && app.includes("betaWritePaused") && fileText("scripts/smoke-test.js").includes("beta paused write should be blocked")) pass("beta write pause");
else fail("beta write pause", "missing");

if (server.includes("function robotsText") && server.includes("x-robots-tag") && fileText("scripts/smoke-test.js").includes("closed beta robots should disallow indexing")) pass("closed beta noindex");
else fail("closed beta noindex", "missing");

if (index.includes("betaAccessPanel") && index.includes("betaNotice") && index.includes("betaChecklist") && index.includes("betaQuickStart") && app.includes("renderBetaChecklist") && app.includes("data-beta-jump")) pass("beta tester UI");
else fail("beta tester UI", "missing");

if (server.includes("/api/admin/beta-report") && server.includes("summaryText") && server.includes("testerCallouts") && server.includes("operatorQueue") && server.includes("trendingPosts") && server.includes("staleQueue") && server.includes("backupAgeHours") && app.includes("β日次レポート") && app.includes("日次メモをコピー") && app.includes("優先対応キュー") && app.includes("優先対応をコピー") && app.includes("copy-beta-queue") && app.includes("テスターへの声かけ") && app.includes("伸びている投稿") && app.includes("対応待ち24h+")) pass("beta daily report");
else fail("beta daily report", "missing");

if (server.includes("/api/admin/beta-launch") && server.includes("inviteTemplate") && server.includes("followupTemplates") && server.includes("placeholderAds") && server.includes("広告差し替え") && server.includes("β成功指標") && server.includes("successMetrics") && server.includes("βクイックスタート") && server.includes("問い合わせへ") && server.includes("testerProgress") && server.includes("inviteToTesterRate") && server.includes("inviteDropoff") && server.includes("bottlenecks") && server.includes("backupAgeHours") && app.includes("β公開判定") && app.includes("β成功指標") && app.includes("次の目標") && app.includes("βテスター進捗") && app.includes("バックアップ経過") && app.includes("広告未差替") && app.includes("招待URL訪問") && app.includes("進捗の詰まり") && app.includes("招待文をコピー") && app.includes("テスターへの追いメッセージ")) pass("beta launch decision");
else fail("beta launch decision", "missing");

if (server.includes("refCounts") && server.includes("?ref=beta-invite") && app.includes("参照元")) pass("beta invite referral tracking");
else fail("beta invite referral tracking", "missing");

if (server.includes("rateLimitBlockedCount") && server.includes("recentRateLimits") && app.includes("直近429制限")) pass("rate limit visibility");
else fail("rate limit visibility", "missing");

if (server.includes("/api/admin/beta-backlog") && server.includes("prioritySummary") && app.includes("β改善バックログ") && app.includes("対応状況")) pass("beta improvement backlog");
else fail("beta improvement backlog", "missing");

if (server.includes("betaFeedbackTypes") && server.includes("betaFeedbackPriorities") && app.includes("分類を保存") && app.includes("quick-triage-inquiry") && app.includes("優先度")) pass("beta feedback triage");
else fail("beta feedback triage", "missing");

if (app.includes("open-beta-feedback") && app.includes("openBetaFeedbackDraft") && app.includes("分かりやすかった点") && app.includes("感想を送る")) pass("post-create beta feedback prompt");
else fail("post-create beta feedback prompt", "missing");

if (app.includes("open-error-inquiry") && app.includes("inquiryRequestIdInput")) pass("error inquiry handoff");
else fail("error inquiry handoff", "missing");

if (betaGuide.includes("Beta access code") || betaGuide.includes("Beta access")) pass("beta guide: access code slot");
else fail("beta guide: access code slot", "missing");

if (betaGuide.includes("β改善バックログ") && betaGuide.includes("優先対応キュー") && betaGuide.includes("今日の確認") && betaGuide.includes("DMを非表示") && betaGuide.includes("My Page badge")) pass("beta guide: operator workflow");
else fail("beta guide: operator workflow", "missing");

if (prelaunch.includes("BETA_ACCESS_CODE") && prelaunch.includes("β日次レポート") && prelaunch.includes("DM reports") && prelaunch.includes("My Page DM badge")) pass("prelaunch beta checklist");
else fail("prelaunch beta checklist", "missing");

if (webBetaLaunchGuide.includes("Render") && webBetaLaunchGuide.includes("Supabase/Postgres") && webBetaLaunchGuide.includes("BETA_ACCESS_CODE") && webBetaLaunchGuide.includes("BETA_WRITE_PAUSED") && webBetaLaunchGuide.includes("優先対応キュー") && webBetaLaunchGuide.includes("Stop conditions")) pass("web beta launch quickstart");
else fail("web beta launch quickstart", "missing");

if (operatorHandoff.includes("Permission needed") && operatorHandoff.includes("BETA_ACCESS_CODE") && operatorHandoff.includes("BETA_WRITE_PAUSED") && operatorHandoff.includes("5-minute operation") && operatorHandoff.includes("Emergency pause") && operatorHandoff.includes("優先対応キュー")) pass("operator handoff");
else fail("operator handoff", "missing");

if (publicOperationsRunbook.includes("Daily 5-minute check") && publicOperationsRunbook.includes("BETA_WRITE_PAUSED") && publicOperationsRunbook.includes("運用ダイジェスト")) pass("operations runbook");
else fail("operations runbook", "missing");

if (restoreGuide.includes("data.messages") && restoreGuide.includes("hidden DMs") && restoreGuide.includes("削除履歴") && betaGuide.includes("restore guide")) pass("dm restore readiness");
else fail("dm restore readiness", "missing");

if (envGuide.includes("npm run secrets") && envGuide.includes("npm run beta:prelaunch")) pass("env setup checklist");
else fail("env setup checklist", "missing");

const packageJson = JSON.parse(fileText("package.json"));
if (packageJson.scripts?.["beta:prelaunch"] && fileText("scripts/beta-prelaunch-check.js").includes("Beta prelaunch checks passed")) pass("beta prelaunch command");
else fail("beta prelaunch command", "missing");

if (packageJson.scripts?.secrets && fileText("scripts/generate-secrets.js").includes("BETA_ACCESS_CODE")) pass("secret generator");
else fail("secret generator", "missing");

for (const check of checks) {
  console.log(`${check.ok ? "ok" : "ng"} - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}

const failed = checks.filter(check => !check.ok);
if (failed.length) {
  console.error(`Beta readiness failed: ${failed.length} issue(s)`);
  process.exit(1);
}

console.log("Beta readiness passed");
