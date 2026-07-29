const http = require("http");
const https = require("https");

const rawBaseUrl = process.argv[2] || process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787";
const intervalMs = Math.max(5_000, Math.min(300_000, Number(process.env.OPS_WATCH_INTERVAL_MS || 30_000)));
const durationMs = Math.max(intervalMs, Math.min(24 * 60 * 60 * 1000, Number(process.env.OPS_WATCH_DURATION_MS || 5 * 60 * 1000)));
const timeoutMs = Math.max(2_000, Math.min(60_000, Number(process.env.OPS_WATCH_TIMEOUT_MS || 12_000)));

function parseBaseUrl(value) {
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
      headers: { "user-agent": "red-thread-ops-watch/1.0" }
    }, res => {
      let body = "";
      let clipped = false;
      res.setEncoding("utf8");
      res.on("data", chunk => {
        if (clipped) return;
        body += chunk;
        if (body.length > 256_000) {
          clipped = true;
          body = body.slice(0, 256_000);
        }
      });
      res.on("end", () => {
        resolve({
          ok: true,
          pathname,
          status: res.statusCode || 0,
          elapsedMs: Date.now() - started,
          requestId: String(res.headers["x-request-id"] || "").slice(0, 8),
          body
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on("error", error => {
      resolve({ ok: false, pathname, elapsedMs: Date.now() - started, error: error.message });
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resultOk(result) {
  if (!result.ok) return false;
  if (result.pathname === "/healthz") return result.status === 200 && result.body.trim() === "ok";
  if (result.pathname === "/status.json") {
    try {
      const status = JSON.parse(result.body);
      return result.status === 200 && status.ok === true && status.ready === true;
    } catch {
      return false;
    }
  }
  if (result.pathname === "/api/health") {
    try {
      const health = JSON.parse(result.body);
      return result.status === 200 && health.ok === true && typeof health.runtime?.requestCount === "number";
    } catch {
      return false;
    }
  }
  return result.status >= 200 && result.status < 400;
}

function lineFor(result) {
  if (!result.ok) return `fail ${result.pathname.padEnd(12)} ${String(result.elapsedMs).padStart(6)}ms ${result.error}`;
  const mark = resultOk(result) ? "ok  " : "warn";
  const request = result.requestId ? ` #${result.requestId}` : "";
  return `${mark} ${result.pathname.padEnd(12)} ${String(result.status).padEnd(4)} ${String(result.elapsedMs).padStart(6)}ms${request}`;
}

async function sample(baseUrl) {
  const results = await Promise.all([
    request(baseUrl, "/healthz"),
    request(baseUrl, "/status.json"),
    request(baseUrl, "/api/health")
  ]);
  const ok = results.every(resultOk);
  console.log(`[${new Date().toLocaleTimeString("ja-JP")}] ${ok ? "ready" : "attention"}`);
  results.forEach(result => console.log(`  ${lineFor(result)}`));
  return { ok, results };
}

async function main() {
  const baseUrl = parseBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    console.error(`Invalid base URL: ${rawBaseUrl}`);
    process.exit(1);
  }
  const until = Date.now() + durationMs;
  let samples = 0;
  let failures = 0;
  let slowest = 0;
  console.log(`Red Thread ops watch: ${baseUrl.origin}`);
  console.log(`duration=${Math.round(durationMs / 1000)}s interval=${Math.round(intervalMs / 1000)}s timeout=${Math.round(timeoutMs / 1000)}s`);
  do {
    const result = await sample(baseUrl);
    samples += 1;
    if (!result.ok) failures += 1;
    result.results.forEach(item => {
      slowest = Math.max(slowest, Number(item.elapsedMs || 0));
    });
    if (Date.now() + intervalMs <= until) await sleep(intervalMs);
    else break;
  } while (Date.now() <= until);
  console.log(`summary samples=${samples} failures=${failures} slowest=${slowest}ms`);
  if (failures) process.exit(1);
}

main().catch(error => {
  console.error(`Ops watch failed: ${error.message}`);
  process.exit(1);
});
