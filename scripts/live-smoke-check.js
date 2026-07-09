const http = require("http");
const https = require("https");

const rawBaseUrl = process.argv[2] || process.env.LIVE_BASE_URL || process.env.PUBLIC_BASE_URL || "";
const checks = [];

function pass(name, detail = "") {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail = "") {
  checks.push({ ok: false, name, detail });
}

function assert(name, condition, detail = "") {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function parseBaseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, baseUrl);
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(target, {
      method: options.method || "GET",
      timeout: options.timeoutMs || 8000,
      headers: {
        "user-agent": "red-thread-live-smoke/1.0"
      }
    }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body
        });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`timeout while requesting ${target.href}`));
    });
    req.on("error", reject);
    req.end();
  });
}

function hasHeader(headers, name, expectedPart) {
  const value = String(headers[name.toLowerCase()] || "");
  return value.toLowerCase().includes(expectedPart.toLowerCase());
}

function hasNonEmptyHeader(headers, name) {
  return Boolean(String(headers[name.toLowerCase()] || "").trim());
}

function publicHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function validSecurityContact(body) {
  const line = String(body || "").split(/\r?\n/).find(item => /^Contact:/i.test(item)) || "";
  const contact = line.replace(/^Contact:\s*/i, "").trim();
  if (!contact || /example\.(com|org|net)|localhost|127\.0\.0\.1/i.test(contact)) return false;
  if (/^mailto:/i.test(contact)) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.replace(/^mailto:/i, ""));
  return publicHttpsUrl(contact);
}

async function main() {
  assert("base url provided", Boolean(rawBaseUrl), "set LIVE_BASE_URL or PUBLIC_BASE_URL");
  assert("base url parseable", Boolean(baseUrl), rawBaseUrl);

  if (!baseUrl) return finish();

  assert("base url uses https", baseUrl.protocol === "https:", baseUrl.href);
  assert("base url is not localhost", !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(baseUrl.hostname), baseUrl.hostname);

  const liveness = await request("/healthz");
  assert("healthz status", liveness.status === 200, String(liveness.status));
  assert("healthz body", liveness.body.trim() === "ok");
  const livenessHead = await request("/healthz", { method: "HEAD" });
  assert("healthz head status", livenessHead.status === 200, String(livenessHead.status));

  const readiness = await request("/readyz");
  assert("readyz status", [200, 503].includes(readiness.status), String(readiness.status));
  assert("readyz content type", hasHeader(readiness.headers, "content-type", "application/json"));
  try {
    const body = JSON.parse(readiness.body);
    assert("readyz ready field", typeof body.ready === "boolean");
    assert("readyz checks", Array.isArray(body.checks));
  } catch (error) {
    fail("readyz json", error.message);
  }

  const health = await request("/api/health");
  assert("health status", health.status === 200, String(health.status));
  assert("health content type", hasHeader(health.headers, "content-type", "application/json"));
  assert("health request id", hasNonEmptyHeader(health.headers, "x-request-id"));
  try {
    const body = JSON.parse(health.body);
    assert("health ok", body.ok === true);
    assert("health ready field", typeof body.ready === "boolean");
    assert("health storage field", typeof body.storage === "string");
  } catch (error) {
    fail("health json", error.message);
  }

  const publicStatus = await request("/status.json");
  assert("status json status", publicStatus.status === 200, String(publicStatus.status));
  assert("status json content type", hasHeader(publicStatus.headers, "content-type", "application/json"));
  assert("status json request id", hasNonEmptyHeader(publicStatus.headers, "x-request-id"));
  try {
    const body = JSON.parse(publicStatus.body);
    assert("status json ok", body.ok === true);
    assert("status json ready field", typeof body.ready === "boolean");
    assert("status json mode", ["open", "beta", "paused"].includes(body.status?.mode));
    assert("status json deployment", typeof body.deployment?.version === "string" && body.deployment.version.length > 0);
  } catch (error) {
    fail("status json parse", error.message);
  }

  const statusPage = await request("/status");
  assert("status page status", statusPage.status === 200, String(statusPage.status));
  assert("status page content", statusPage.body.includes("Red Thread サービス状況") && statusPage.body.includes("/status.json"));

  const home = await request("/");
  assert("home status", home.status === 200, String(home.status));
  assert("home request id", hasNonEmptyHeader(home.headers, "x-request-id"));
  assert("home hsts", hasHeader(home.headers, "strict-transport-security", "max-age=31536000"));
  assert("home opener policy", hasHeader(home.headers, "cross-origin-opener-policy", "same-origin"));
  assert("home content security policy", hasHeader(home.headers, "content-security-policy", "frame-ancestors 'none'"));
  assert("home permissions policy", hasHeader(home.headers, "permissions-policy", "camera=()"));
  assert("home content type options", hasHeader(home.headers, "x-content-type-options", "nosniff"));
  assert("home og title", home.body.includes("property=\"og:title\""));
  assert("home canonical absolute url", home.body.includes(`<link rel="canonical" href="${baseUrl.origin}/">`));
  assert("home og image absolute url", home.body.includes(`<meta property="og:image" content="${baseUrl.origin}/og-image.svg">`));
  assert("home rss link", home.body.includes("application/rss+xml"));
  assert("home structured data", home.body.includes("application/ld+json") && home.body.includes("\"@type\": \"WebSite\""));
  assert("home structured data absolute url", home.body.includes(`"url": "${baseUrl.origin}/"`));
  assert("home footer links", home.body.includes("/terms.html") && home.body.includes("/privacy.html") && home.body.includes("/guidelines.html") && home.body.includes("/status") && home.body.includes("/feed.xml"));

  const state = await request("/api/state");
  assert("state status", state.status === 200, String(state.status));
  assert("state content type", hasHeader(state.headers, "content-type", "application/json"));
  try {
    const body = JSON.parse(state.body);
    const adSlots = Array.isArray(body.adSlots) ? body.adSlots : [];
    const placeholderLabels = new Set(["左広告", "右広告", "一覧内広告", "広告"]);
    assert("state ad slots array", Array.isArray(body.adSlots));
    assert("state ad placeholders hidden", adSlots.every(slot => !placeholderLabels.has(String(slot.label || "").trim()) && (slot.targetUrl || slot.html)));
    assert("state ad targets public https", adSlots.every(slot => !slot.targetUrl || publicHttpsUrl(slot.targetUrl)));
    assert("state ad html sanitized", adSlots.every(slot => !/<script|javascript:|data:|file:|vbscript:|\son\w+=/i.test(String(slot.html || ""))));
  } catch (error) {
    fail("state json", error.message);
  }

  const appJs = await request("/app.js");
  assert("app js status", appJs.status === 200, String(appJs.status));
  assert("app js cache", hasHeader(appJs.headers, "cache-control", "no-cache"));
  const styles = await request("/styles.css");
  assert("styles css status", styles.status === 200, String(styles.status));
  assert("styles css cache", hasHeader(styles.headers, "cache-control", "no-cache"));

  const terms = await request("/terms.html");
  assert("terms status", terms.status === 200, String(terms.status));
  assert("terms coverage", terms.body.includes("通報と削除依頼") && terms.body.includes("広告と外部リンク"));

  const privacy = await request("/privacy.html");
  assert("privacy status", privacy.status === 200, String(privacy.status));
  assert("privacy coverage", privacy.body.includes("データ確認と保存") && privacy.body.includes("保存期間"));

  const guidelines = await request("/guidelines.html");
  assert("guidelines status", guidelines.status === 200, String(guidelines.status));
  assert("guidelines coverage", guidelines.body.includes("コミュニティガイドライン") && guidelines.body.includes("返信とDM") && guidelines.body.includes("禁止する投稿"));

  const manifest = await request("/site.webmanifest");
  assert("manifest status", manifest.status === 200, String(manifest.status));
  assert("manifest content", manifest.body.includes("\"name\"") && manifest.body.includes("Red Thread"));

  const security = await request("/.well-known/security.txt");
  assert("security.txt status", security.status === 200, String(security.status));
  assert("security.txt contact", security.body.includes("Contact:"));
  assert("security.txt public contact", validSecurityContact(security.body));
  assert("security.txt expires", security.body.includes("Expires:"));
  assert("security.txt canonical", security.body.includes(`${baseUrl.origin}/.well-known/security.txt`));

  const robots = await request("/robots.txt");
  assert("robots status", robots.status === 200, String(robots.status));
  assert("robots does not block public index", !/Disallow:\s*\/\s*$/im.test(robots.body), "public launch should not disallow all");
  assert("robots sitemap", robots.body.includes("/sitemap.xml"));
  assert("robots sitemap absolute url", robots.body.includes(`Sitemap: ${baseUrl.origin}/sitemap.xml`));

  const sitemap = await request("/sitemap.xml");
  assert("sitemap status", sitemap.status === 200, String(sitemap.status));
  assert("sitemap xml", sitemap.body.includes("<urlset") && sitemap.body.includes("</urlset>"));
  assert("sitemap includes base url", sitemap.body.includes(baseUrl.origin));
  assert("sitemap static pages", sitemap.body.includes("/guidelines.html") && sitemap.body.includes("/terms.html") && sitemap.body.includes("/privacy.html"));

  const feed = await request("/feed.xml");
  assert("feed status", feed.status === 200, String(feed.status));
  assert("feed rss", feed.body.includes("<rss") && feed.body.includes("<channel>"));
  assert("feed includes base url", feed.body.includes(baseUrl.origin));

  finish();
}

function finish() {
  for (const check of checks) {
    console.log(`${check.ok ? "ok" : "fail"} - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  }

  const failed = checks.filter(check => !check.ok);
  if (failed.length) {
    console.error(`Live smoke failed: ${failed.length} issue(s)`);
    process.exit(1);
  }

  console.log("Live smoke passed");
}

const baseUrl = parseBaseUrl(rawBaseUrl);

main().catch(error => {
  fail("live request", error.message);
  finish();
});
