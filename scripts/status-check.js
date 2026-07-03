const http = require("http");
const https = require("https");

const rawBaseUrl = process.argv[2] || process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787";

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
        "user-agent": "1code-status-check/1.0"
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

async function main() {
  const baseUrl = parseBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    console.error(`Invalid base URL: ${rawBaseUrl}`);
    process.exit(1);
  }

  const healthz = await request(baseUrl, "/healthz");
  if (healthz.status !== 200 || healthz.body.trim() !== "ok") {
    console.error(`healthz failed: ${healthz.status}`);
    process.exit(1);
  }

  const statusPage = await request(baseUrl, "/status");
  if (statusPage.status !== 200 || !statusPage.body.includes("1code サービス状況")) {
    console.error(`status page failed: ${statusPage.status}`);
    process.exit(1);
  }
  if (!statusPage.headers["x-request-id"]) {
    console.error("status page request id missing");
    process.exit(1);
  }

  const statusResponse = await request(baseUrl, "/status.json");
  if (statusResponse.status !== 200) {
    console.error(`status.json failed: ${statusResponse.status}`);
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
  console.log(`1code status: ${ready} / ${mode} / ${label} / release ${release}${commit} / request ${statusJsonRequestId || "-"}`);
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
