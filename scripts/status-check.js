const http = require("http");
const https = require("https");

const rawBaseUrl = process.argv[2] || process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787";
const retryCount = Math.max(1, Math.min(5, Number(process.env.STATUS_CHECK_RETRIES || 3)));
const retryDelayMs = Math.max(250, Math.min(10_000, Number(process.env.STATUS_CHECK_RETRY_DELAY_MS || 1500)));

function parseBaseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function request(baseUrl, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, baseUrl);
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(target, {
      method: options.method || "GET",
      timeout: options.timeoutMs || 5000,
      headers: {
        "user-agent": "red-thread-status-check/1.0"
      }
    }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, headers: res.headers, body });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout while requesting ${target.href}`)));
    req.on("error", reject);
    req.end();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(baseUrl, pathname, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await request(baseUrl, pathname, options);
      return { ...response, attempt };
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) await delay(retryDelayMs);
    }
  }
  throw lastError || new Error(`request failed: ${pathname}`);
}

async function main() {
  const baseUrl = parseBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    console.error(`Invalid base URL: ${rawBaseUrl}`);
    process.exit(1);
  }

  const healthz = await requestWithRetry(baseUrl, "/healthz");
  if (healthz.status !== 200 || healthz.body.trim() !== "ok") {
    console.error(`healthz failed: ${healthz.status} after attempt ${healthz.attempt}`);
    process.exit(1);
  }

  const statusPage = await requestWithRetry(baseUrl, "/status");
  if (statusPage.status !== 200 || !statusPage.body.includes("Red Thread サービス状況")) {
    console.error(`status page failed: ${statusPage.status} after attempt ${statusPage.attempt}`);
    process.exit(1);
  }
  if (!statusPage.headers["x-request-id"]) {
    console.error("status page request id missing");
    process.exit(1);
  }

  const statusResponse = await requestWithRetry(baseUrl, "/status.json");
  if (statusResponse.status !== 200) {
    console.error(`status.json failed: ${statusResponse.status} after attempt ${statusResponse.attempt}`);
    process.exit(1);
  }
  if (!statusResponse.headers["x-request-id"]) {
    console.error("status.json request id missing");
    process.exit(1);
  }

  let status;
  try {
    status = JSON.parse(statusResponse.body);
  } catch (error) {
    console.error(`status.json parse failed: ${error.message}`);
    process.exit(1);
  }

  const mode = status.status?.mode || "unknown";
  const label = status.status?.label || "unknown";
  const ready = status.ready === true ? "ready" : "not-ready";
  const release = status.deployment?.release || status.deployment?.version || "unknown";
  const commit = status.deployment?.commit ? ` / ${status.deployment.commit}` : "";
  const statusPageRequestId = String(statusPage.headers["x-request-id"] || "").slice(0, 8);
  const statusJsonRequestId = String(statusResponse.headers["x-request-id"] || "").slice(0, 8);
  const attempts = [healthz.attempt, statusPage.attempt, statusResponse.attempt].filter(value => value > 1);
  const retryNote = attempts.length ? ` / retries ${attempts.join(",")}` : "";
  console.log(`Red Thread status: ${ready} / ${mode} / ${label} / release ${release}${commit} / request ${statusJsonRequestId || "-"}${retryNote}`);
  console.log(`trace: status ${statusPageRequestId || "-"} / status.json ${statusJsonRequestId || "-"}`);

  if (!["open", "beta", "paused"].includes(mode)) {
    console.error(`Unexpected public mode: ${mode}`);
    process.exit(1);
  }

  if (status.ok !== true) {
    console.error("status.json ok flag is not true");
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`Status check failed: ${error.message}`);
  process.exit(1);
});
