const http = require("http");
const https = require("https");

const rawBaseUrl = process.argv[2] || process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL || "";
const timeoutMs = Number(process.env.RENDER_TRIAGE_TIMEOUT_MS || 45000);

function env(name) {
  return String(process.env[name] || "").trim();
}

function secretState(name, minLength = 1) {
  const value = env(name);
  if (!value) return "missing";
  if (value.length < minLength) return `too short (${value.length}/${minLength})`;
  return "set";
}

function parseBaseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function request(baseUrl, pathname) {
  return new Promise(resolve => {
    const target = new URL(pathname, baseUrl);
    const client = target.protocol === "https:" ? https : http;
    const started = Date.now();
    const req = client.request(target, {
      method: "GET",
      timeout: timeoutMs,
      headers: {
        "user-agent": "red-thread-render-triage/1.0"
      }
    }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        body += chunk;
        if (body.length > 2048) req.destroy();
      });
      res.on("end", () => {
        resolve({
          ok: true,
          pathname,
          status: res.statusCode || 0,
          elapsedMs: Date.now() - started,
          requestId: String(res.headers["x-request-id"] || "").slice(0, 12),
          bodyPreview: body.slice(0, 80).replace(/\s+/g, " ").trim()
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on("error", error => {
      resolve({
        ok: false,
        pathname,
        elapsedMs: Date.now() - started,
        error: error.message
      });
    });
    req.end();
  });
}

function printEnvPlan() {
  const discordEnabled = env("DISCORD_LOGIN_ENABLED") ? /^(1|true|yes|on)$/i.test(env("DISCORD_LOGIN_ENABLED")) : true;
  const rows = [
    ["NODE_ENV", env("NODE_ENV") || "missing", "production"],
    ["STORAGE_DRIVER", env("STORAGE_DRIVER") || "missing", "postgres"],
    ["DATABASE_URL", secretState("DATABASE_URL"), "set in Render only"],
    ["DATABASE_SSL", env("DATABASE_SSL") || "missing", "true"],
    ["PUBLIC_BASE_URL", env("PUBLIC_BASE_URL") || "missing", "public https origin"],
    ["PUBLIC_SECURITY_CONTACT", env("PUBLIC_SECURITY_CONTACT") ? "set" : "missing", "real mailto: or https URL"],
    ["ADMIN_PIN", secretState("ADMIN_PIN", 16), "generated secret"],
    ["SESSION_SECRET", secretState("SESSION_SECRET", 32), "generated secret"],
    ["DISCORD_LOGIN_ENABLED", discordEnabled ? "true" : "false", "false if Discord is postponed"],
    ["DISCORD_CLIENT_ID", discordEnabled ? secretState("DISCORD_CLIENT_ID") : "optional", "required only when Discord is enabled"],
    ["DISCORD_CLIENT_SECRET", discordEnabled ? secretState("DISCORD_CLIENT_SECRET", 16) : "optional", "required only when Discord is enabled"],
    ["PUBLIC_WRITE_PAUSED", env("PUBLIC_WRITE_PAUSED") || "missing", "false for launch"],
    ["ENABLE_SEED_DATA", env("ENABLE_SEED_DATA") || "missing", "false"]
  ];

  console.log("");
  console.log("Local env visibility checklist");
  console.log("KEY                      STATE                         EXPECTED");
  for (const [key, state, expected] of rows) {
    console.log(`${key.padEnd(24)} ${state.padEnd(29)} ${expected}`);
  }
}

async function main() {
  const baseUrl = parseBaseUrl(rawBaseUrl);
  console.log("Red Thread Render launch triage");
  console.log("");
  console.log(`URL: ${baseUrl ? baseUrl.origin : "missing"}`);
  console.log(`Timeout: ${timeoutMs}ms`);

  if (!baseUrl) {
    console.log("");
    console.log("Set LIVE_BASE_URL or pass the Render URL, for example:");
    console.log("node scripts/render-launch-triage.js https://onecode-cngg.onrender.com");
    printEnvPlan();
    process.exit(1);
  }

  const checks = await Promise.all([
    request(baseUrl, "/healthz"),
    request(baseUrl, "/status.json"),
    request(baseUrl, "/")
  ]);

  console.log("");
  console.log("Public response check");
  for (const check of checks) {
    if (check.ok) {
      const trace = check.requestId ? ` request=${check.requestId}` : "";
      console.log(`ok   ${check.pathname.padEnd(12)} ${String(check.status).padEnd(4)} ${String(check.elapsedMs).padStart(6)}ms${trace} ${check.bodyPreview}`);
    } else {
      console.log(`fail ${check.pathname.padEnd(12)} ${String(check.elapsedMs).padStart(6)}ms ${check.error}`);
    }
  }

  const timeouts = checks.filter(check => !check.ok && /timeout/i.test(check.error || ""));
  const serverErrors = checks.filter(check => check.ok && check.status >= 500);
  const allFailed = checks.every(check => !check.ok);

  console.log("");
  console.log("Likely next action");
  if (allFailed || timeouts.length >= 2) {
    console.log("- Open Render -> 1code -> Logs and confirm whether node server.js starts.");
    console.log("- If it exits immediately, fix the first fatal log line.");
    console.log("- If it keeps restarting, confirm the actual Render env values for DATABASE_URL, DATABASE_SSL=true, SESSION_SECRET, ADMIN_PIN, and PUBLIC_BASE_URL.");
    console.log("- If Discord is postponed, set DISCORD_LOGIN_ENABLED=false and redeploy.");
  } else if (serverErrors.length) {
    console.log("- The service is reachable but returning 5xx. Check Render logs around the request time and the app status JSON.");
  } else {
    console.log("- The service is reachable. Run deploy:verify next for the full launch gate.");
  }

  printEnvPlan();

  if (allFailed || timeouts.length || serverErrors.length) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`Render launch triage failed: ${error.message}`);
  process.exit(1);
});
