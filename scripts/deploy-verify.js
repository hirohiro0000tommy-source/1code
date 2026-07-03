const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const rawBaseUrl = process.argv[2] || process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL || "";

function parseBaseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const baseUrl = parseBaseUrl(rawBaseUrl);

if (!baseUrl) {
  console.error("Deploy verification needs a public base URL.");
  console.error("Set LIVE_BASE_URL=https://YOUR-PUBLIC-URL or pass the URL as the first argument.");
  process.exit(1);
}

if (baseUrl.protocol !== "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(baseUrl.hostname)) {
  console.error(`Deploy verification must target a public https URL, got: ${baseUrl.href}`);
  process.exit(1);
}

if ((baseUrl.pathname && baseUrl.pathname !== "/") || baseUrl.search || baseUrl.hash) {
  console.error(`Deploy verification URL must be the public origin only, got: ${baseUrl.href}`);
  console.error(`Use: ${baseUrl.origin}`);
  process.exit(1);
}

const childEnv = {
  ...process.env,
  LIVE_BASE_URL: baseUrl.origin
};

function run(label, script) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    env: childEnv,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`${label} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log(`Deploy verification target: ${baseUrl.origin}`);
run("status check", "status-check.js");
run("live smoke", "live-smoke-check.js");

console.log("\nDeploy verification passed");
