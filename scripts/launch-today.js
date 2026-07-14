const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const node = process.execPath;

function run(name, args, required = true) {
  console.log(`\n== ${name} ==`);
  const result = spawnSync(node, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0 && required) {
    console.error(`\nLaunch-today check failed at: ${name}`);
    process.exit(result.status || 1);
  }
  return result.status === 0;
}

function line(text = "") {
  console.log(text);
}

line("Red Thread launch-today command");
line("Target: publish or beta-publish today, with manual account/dashboard steps separated.");
line("Secrets are never printed by this command.");

run("local final release gate", ["scripts/final-release-check.js"]);
run("safe environment plan", ["scripts/deploy-env-plan.js"]);
run("safe launch packet", ["scripts/generate-launch-packet.js"]);

line("");
line("Manual external steps required before the public URL can be shared:");
line("1. Create or confirm the production Postgres/Supabase database.");
line("2. Apply db/schema.sql and db/rls.sql.");
line("3. Deploy the app with NODE_ENV=production and STORAGE_DRIVER=postgres.");
line("4. Paste DATABASE_URL, ADMIN_PIN, SESSION_SECRET, and DISCORD_CLIENT_SECRET only into the hosting dashboard.");
line("5. Set PUBLIC_BASE_URL to the final https origin.");
line("6. Set Discord redirect URL to PUBLIC_BASE_URL + /auth/discord/callback.");
line("7. Log in once with Discord, set ADMIN_ACCOUNT_IDS, then run npm run admin:roles:write and apply the generated SQL.");
line("8. Export the first production backup from 管理 before inviting users.");
line("9. Open 管理 -> 公開設定ハンドオフ, 一般公開判定, 公開直前チェック, and インシデント共有.");
line("10. Open 公式ボット投稿, click おすすめだけ公開 first, and confirm 見本 / 公式 labels. Use 未投稿分を公開 only if the feed still needs examples.");
line("11. Share to a small group first, then watch 運用ダイジェスト and 公開運用レポート.");

if (process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL) {
  run("live deployed verification", ["scripts/deploy-verify.js"]);
} else {
  line("");
  line("Live verification skipped: set LIVE_BASE_URL=https://YOUR-PUBLIC-URL after deployment, then run:");
  line("npm run deploy:verify");
}

line("");
line("Launch-today local preparation passed.");
