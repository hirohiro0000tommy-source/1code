const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const port = 8890 + Math.floor(Math.random() * 1000);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "partyfinder-smoke-"));
const validDiscordClientId = "123456789012345678";
const validDiscordClientSecret = "valid-discord-secret-123456789";
const validAdminAccountIds = "discord:123456789012345678";

function request(pathname, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : "";
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: options.port || port,
      path: pathname,
      method: options.method || "GET",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-account-id": options.accountId || "smoke-user",
        "x-display-name": options.displayName || "SmokeUser",
        "x-admin-pin": options.adminPin || "",
        "x-beta-code": options.betaCode || "",
        ...(options.origin ? { origin: options.origin } : {})
      }
    }, res => {
      let raw = "";
      res.on("data", chunk => {
        raw += chunk;
      });
      res.on("end", () => {
        const data = raw ? JSON.parse(raw) : {};
        if (res.statusCode >= 400) {
          const error = new Error(`${res.statusCode}: ${data.error || raw}`);
          error.statusCode = res.statusCode;
          error.headers = res.headers;
          error.data = data;
          reject(error);
          return;
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function requestRaw(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: options.port || port,
      path: pathname,
      method: options.method || "GET"
    }, res => {
      let raw = "";
      res.on("data", chunk => {
        raw += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 400 && !options.allowError) {
          reject(new Error(`${res.statusCode}: ${raw}`));
          return;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(targetPort = port) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      return await request("/api/health", { port: targetPort });
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw new Error("server did not start");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitForProcessExit(child, timeoutMs = 1500) {
  if (child.exitCode !== null || child.killed) return Promise.resolve(true);
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(child.exitCode !== null || child.killed);
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    }
    function onExit() {
      cleanup();
      resolve(true);
    }
    function onError() {
      cleanup();
      resolve(true);
    }
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function run() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, STORAGE_DRIVER: "json", ADMIN_PIN: "admin", ADMIN_ACCOUNT_IDS: "smoke-admin", MODERATOR_ACCOUNT_IDS: "smoke-mod" },
    stdio: "ignore"
  });

  try {
    const health = await waitForServer();
    assert(health.ok, "health check failed");
    assert(typeof health.ready === "boolean", "health ready flag missing");
    assert(typeof health.runtime?.readCount === "number", "health runtime metrics missing");
    assert(typeof health.runtime?.requestCount === "number", "health request metrics missing");
    assert(typeof health.runtime?.statusCounts === "object", "health status metrics missing");
    assert(Array.isArray(health.runtime?.recentRequests), "health recent requests missing");
    assert(typeof health.memory?.heapUsed === "number", "health memory metrics missing");
    assert(health.retention?.auditLogs === 500, "health retention policy missing");
    const rawHealth = await requestRaw("/api/health");
    assert(rawHealth.headers["x-request-id"], "request id response header missing");
    const healthWithHistory = JSON.parse(rawHealth.body);
    assert(healthWithHistory.runtime?.recentRequests?.some(entry => entry.requestId), "request id history missing");
    const healthz = await requestRaw("/healthz");
    assert(healthz.statusCode === 200 && healthz.body.trim() === "ok", "healthz failed");
    const healthzHead = await requestRaw("/healthz", { method: "HEAD" });
    assert(healthzHead.statusCode === 200 && healthzHead.body === "", "healthz head failed");
    const readyz = await request("/readyz");
    assert(typeof readyz.ready === "boolean" && Array.isArray(readyz.checks), "readyz failed");
    const publicStatus = await request("/status.json");
    assert(publicStatus.ok === true && typeof publicStatus.ready === "boolean", "status json failed");
    assert(publicStatus.status?.mode === "open", "status json public mode missing");
    assert(publicStatus.deployment?.version, "status json deployment version missing");
    const statusPage = await requestRaw("/status");
    assert(statusPage.statusCode === 200 && statusPage.body.includes("Red Thread サービス状況"), "status page failed");
    assert(statusPage.body.includes("/status.json"), "status page json link missing");
    const statusPageHead = await requestRaw("/status", { method: "HEAD" });
    assert(statusPageHead.statusCode === 200 && statusPageHead.body === "", "status page head failed");
    const homeHead = await requestRaw("/", { method: "HEAD" });
    assert(homeHead.statusCode === 200 && homeHead.body === "", "home head failed");
    const homePage = await requestRaw("/");
    assert(homePage.body.includes(`<link rel="canonical" href="http://localhost:${port}/">`), "home canonical absolute url missing");
    assert(homePage.body.includes(`<meta property="og:image" content="http://localhost:${port}/og-image.svg">`), "home og image absolute url missing");
    assert(homePage.body.includes(`"url": "http://localhost:${port}/"`), "home structured data absolute url missing");
    const robotsHead = await requestRaw("/robots.txt", { method: "HEAD" });
    assert(robotsHead.statusCode === 200 && robotsHead.body === "", "robots head failed");
    const robotsMeta = await requestRaw("/robots.txt");
    assert(robotsMeta.body.includes(`Sitemap: http://localhost:${port}/sitemap.xml`), "robots sitemap absolute url missing");
    const sitemapHead = await requestRaw("/sitemap.xml", { method: "HEAD" });
    assert(sitemapHead.statusCode === 200 && sitemapHead.body === "", "sitemap head failed");
    const feedHead = await requestRaw("/feed.xml", { method: "HEAD" });
    assert(feedHead.statusCode === 200 && feedHead.body === "", "feed head failed");
    const staticPost = await requestRaw("/", { method: "POST", allowError: true });
    assert(staticPost.statusCode === 405, "static post should be rejected");
    const malformedPath = await requestRaw("/%E0%A4%A", { allowError: true });
    assert(malformedPath.statusCode === 400, "malformed static path should be rejected");
    const appJs = await requestRaw("/app.js");
    assert((appJs.headers["cache-control"] || "").includes("no-cache"), "app js should revalidate cache");
    const stylesCss = await requestRaw("/styles.css");
    assert((stylesCss.headers["cache-control"] || "").includes("no-cache"), "styles css should revalidate cache");
    const guidelinesPage = await requestRaw("/guidelines.html");
    assert(guidelinesPage.statusCode === 200 && guidelinesPage.body.includes("コミュニティガイドライン") && guidelinesPage.body.includes("返信とDM"), "guidelines page failed");
    const iconSvg = await requestRaw("/icon.svg");
    assert((iconSvg.headers["cache-control"] || "").includes("max-age=300"), "static asset cache should be short");
    const securityTxt = await requestRaw("/.well-known/security.txt");
    assert(securityTxt.body.includes("Contact:"), "security txt contact missing");
    assert(securityTxt.body.includes("Expires:"), "security txt expires missing");

    const me = await request("/api/me");
    assert(me.account === null, "guest session should be empty");
    assert(typeof me.discordConfigured === "boolean", "discord configured flag missing");
    assert(me.role === "user", "guest role should be user");
    const emptyUserData = await request("/api/me/data");
    assert(emptyUserData.data.counts.recruitments === 0, "empty user data summary failed");

    for (let i = 0; i < 5; i += 1) {
      const rateInquiry = await request("/api/inquiries", {
        method: "POST",
        accountId: "rate-limit-smoke",
        body: { name: "Rate Limit", category: "その他", message: `rate limit probe ${i}` }
      });
      assert(rateInquiry.ok, "rate limit warmup inquiry failed");
    }
    let rateLimitBlocked = false;
    try {
      await request("/api/inquiries", {
        method: "POST",
        accountId: "rate-limit-smoke",
        body: { name: "Rate Limit", category: "その他", message: "rate limit probe blocked" }
      });
    } catch (error) {
      rateLimitBlocked = error.statusCode === 429
        && Boolean(error.headers?.["retry-after"])
        && Boolean(error.headers?.["x-ratelimit-limit"])
        && error.data?.retryAfterSeconds >= 1;
    }
    assert(rateLimitBlocked, "rate limit retry-after headers missing");

    const roleAdminStats = await request("/api/admin/stats", { accountId: "smoke-admin", displayName: "SmokeAdmin" });
    assert(roleAdminStats.stats, "admin account role did not access admin stats");
    const roleAdminSystem = await request("/api/admin/system", { accountId: "smoke-admin", displayName: "SmokeAdmin" });
    assert(roleAdminSystem.system?.deployment?.version, "admin system deployment version missing");

    const moderatorReports = await request("/api/admin/reports", { accountId: "smoke-mod", displayName: "SmokeMod" });
    assert(Array.isArray(moderatorReports.reports), "moderator could not access reports");

    let moderatorSystemBlocked = false;
    try {
      await request("/api/admin/system", { accountId: "smoke-mod", displayName: "SmokeMod" });
    } catch (error) {
      moderatorSystemBlocked = error.message.includes("401");
    }
    assert(moderatorSystemBlocked, "moderator should not access admin system settings");

    const logout = await request("/auth/logout", { method: "POST" });
    assert(logout.ok, "logout failed");

    let productionBlocked = false;
    const blockedChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(port + 1), STORAGE_DRIVER: "json", NODE_ENV: "production", ADMIN_PIN: "admin", DATA_DIR: dataDir },
      stdio: "ignore"
    });
    productionBlocked = await waitForProcessExit(blockedChild);
    blockedChild.kill();
    assert(productionBlocked, "unsafe production config was not blocked");

    let shortAdminPinBlocked = false;
    const shortAdminPinChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 10),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "mailto:security@1code.test",
        ADMIN_PIN: "short-pin",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    shortAdminPinBlocked = await waitForProcessExit(shortAdminPinChild);
    shortAdminPinChild.kill();
    assert(shortAdminPinBlocked, "short production admin pin was not blocked");

    let publicBaseUrlPathBlocked = false;
    const pathUrlChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 11),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.com/app",
        PUBLIC_SECURITY_CONTACT: "mailto:security@1code.test",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    publicBaseUrlPathBlocked = await waitForProcessExit(pathUrlChild);
    pathUrlChild.kill();
    assert(publicBaseUrlPathBlocked, "public base url path was not blocked");

    let securityContactPlaceholderBlocked = false;
    const securityContactChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 12),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "mailto:security@example.com",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    securityContactPlaceholderBlocked = await waitForProcessExit(securityContactChild);
    securityContactChild.kill();
    assert(securityContactPlaceholderBlocked, "placeholder security contact was not blocked");

    let securityContactLocalBlocked = false;
    const securityContactLocalChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 17),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "https://localhost/security",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    securityContactLocalBlocked = await waitForProcessExit(securityContactLocalChild);
    securityContactLocalChild.kill();
    assert(securityContactLocalBlocked, "local security contact was not blocked");

    let databasePlaceholderBlocked = false;
    const databasePlaceholderChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 13),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://user:password@example.com:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "mailto:security@1code.test",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    databasePlaceholderBlocked = await waitForProcessExit(databasePlaceholderChild);
    databasePlaceholderChild.kill();
    assert(databasePlaceholderBlocked, "placeholder database url was not blocked");

    let databaseSslBlocked = false;
    const databaseSslChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 14),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "false",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "mailto:security@1code.test",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    databaseSslBlocked = await waitForProcessExit(databaseSslChild);
    databaseSslChild.kill();
    assert(databaseSslBlocked, "production database ssl false was not blocked");

    let discordPlaceholderBlocked = false;
    const discordPlaceholderChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 15),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "mailto:security@1code.test",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: validAdminAccountIds,
        DISCORD_CLIENT_ID: "your-discord-client-id",
        DISCORD_CLIENT_SECRET: "your-discord-client-secret"
      },
      stdio: "ignore"
    });
    discordPlaceholderBlocked = await waitForProcessExit(discordPlaceholderChild);
    discordPlaceholderChild.kill();
    assert(discordPlaceholderBlocked, "placeholder discord oauth credentials were not blocked");

    let adminAccountPlaceholderBlocked = false;
    const adminAccountPlaceholderChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port + 16),
        DATA_DIR: dataDir,
        NODE_ENV: "production",
        STORAGE_DRIVER: "postgres",
        DATABASE_URL: "postgres://smoke_app:smoke-secret@db.smoke.test:5432/partyfinder",
        DATABASE_SSL: "true",
        PUBLIC_BASE_URL: "https://example.org",
        PUBLIC_SECURITY_CONTACT: "mailto:security@1code.test",
        ADMIN_PIN: "safe-admin-pin-123",
        SESSION_SECRET: "safe-session-secret-for-smoke-testing",
        ADMIN_ACCOUNT_IDS: "discord:replace-with-your-discord-user-id",
        DISCORD_CLIENT_ID: validDiscordClientId,
        DISCORD_CLIENT_SECRET: validDiscordClientSecret
      },
      stdio: "ignore"
    });
    adminAccountPlaceholderBlocked = await waitForProcessExit(adminAccountPlaceholderChild);
    adminAccountPlaceholderChild.kill();
    assert(adminAccountPlaceholderBlocked, "placeholder admin account id was not blocked");

    const betaPort = port + 2;
    const betaDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "partyfinder-beta-smoke-"));
    const betaChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(betaPort), DATA_DIR: betaDataDir, STORAGE_DRIVER: "json", ADMIN_PIN: "admin", BETA_ACCESS_CODE: "smoke-beta" },
      stdio: "ignore"
    });
    try {
      await waitForServer(betaPort);
      const betaMe = await request("/api/me", { port: betaPort });
      assert(betaMe.betaAccessRequired === true, "beta access requirement missing");
      const betaState = await request("/api/state", { port: betaPort });
      assert(betaState.publicStatus?.mode === "beta", "beta public status missing");
      assert(betaState.publicStatus?.betaAccessRequired === true, "beta public status access flag missing");
      const betaRobots = await requestRaw("/robots.txt", { port: betaPort });
      assert(betaRobots.body.includes("Disallow: /"), "closed beta robots should disallow indexing");
      const betaHome = await requestRaw("/", { port: betaPort });
      assert((betaHome.headers["x-robots-tag"] || "").includes("noindex"), "closed beta home should be noindex");
      const betaSitemap = await requestRaw("/sitemap.xml", { port: betaPort });
      assert(!betaSitemap.body.includes("/share/"), "closed beta sitemap should not expose share pages");
      assert(!betaSitemap.body.includes("/guidelines.html"), "closed beta sitemap should not expose static public pages");
      const betaFeed = await requestRaw("/feed.xml", { port: betaPort });
      assert(!betaFeed.body.includes("/share/"), "closed beta feed should not expose share pages");
      let betaWriteBlocked = false;
      try {
        await request("/api/recruitments", {
          port: betaPort,
          method: "POST",
          body: { title: "Blocked beta post", game: "Apex", platform: "PC", voice: "なし", body: "No beta code" }
        });
      } catch (error) {
        betaWriteBlocked = error.message.includes("403");
      }
      assert(betaWriteBlocked, "beta write should require access code");
      const betaPost = await request("/api/recruitments", {
        port: betaPort,
        method: "POST",
        betaCode: "smoke-beta",
        body: { title: "Allowed beta post", game: "Apex", platform: "PC", voice: "なし", body: "With beta code" }
      });
      assert(betaPost.title === "Allowed beta post", "beta write with code failed");
      const betaThread = await request("/api/threads", {
        port: betaPort,
        method: "POST",
        betaCode: "smoke-beta",
        body: { title: "Allowed beta thread", category: "雑談", body: "Thread with beta code" }
      });
      assert(betaThread.title === "Allowed beta thread", "beta thread with code failed");
      const betaReply = await request(`/api/recruitments/${betaPost.id}/reply`, {
        port: betaPort,
        method: "POST",
        betaCode: "smoke-beta",
        body: { body: "Reply with beta code" }
      });
      assert(betaReply.replies.some(reply => reply.body === "Reply with beta code"), "beta reply with code failed");
      const betaReport = await request("/api/reports", {
        port: betaPort,
        method: "POST",
        betaCode: "smoke-beta",
        body: { type: "recruitments", itemId: betaPost.id, reason: "Report with beta code" }
      });
      assert(betaReport.ok === true, "beta report with code failed");
      const betaInquiry = await request("/api/inquiries", {
        port: betaPort,
        method: "POST",
        betaCode: "smoke-beta",
        body: { name: "Beta tester", category: "βフィードバック", message: "Inquiry with beta code" }
      });
      assert(betaInquiry.ok === true, "beta inquiry with code failed");
      assert(betaInquiry.inquiryId, "beta inquiry receipt id missing");
      assert(betaInquiry.requestId, "beta inquiry request id missing");
      assert(typeof betaInquiry.receivedAt === "number", "beta inquiry received timestamp missing");
      let betaInquiryBlocked = false;
      try {
        await request("/api/inquiries", {
          port: betaPort,
          method: "POST",
          body: { name: "Blocked tester", category: "βフィードバック", message: "No beta code inquiry" }
        });
      } catch (error) {
        betaInquiryBlocked = error.message.includes("403");
      }
      assert(betaInquiryBlocked, "beta inquiry should require access code");
    } finally {
      betaChild.kill();
    }

    const pausedPort = port + 3;
    const pausedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "partyfinder-paused-smoke-"));
    const pausedChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(pausedPort), DATA_DIR: pausedDataDir, STORAGE_DRIVER: "json", ADMIN_PIN: "admin", BETA_ACCESS_CODE: "smoke-beta", BETA_WRITE_PAUSED: "true" },
      stdio: "ignore"
    });
    try {
      await waitForServer(pausedPort);
      const pausedMe = await request("/api/me", { port: pausedPort, betaCode: "smoke-beta" });
      assert(pausedMe.betaWritePaused === true, "beta write pause flag missing");
      const pausedState = await request("/api/state", { port: pausedPort, betaCode: "smoke-beta" });
      assert(pausedState.publicStatus?.mode === "paused", "paused public status missing");
      assert(pausedState.publicStatus?.betaWritePaused === true, "paused public status beta flag missing");
      let pausedWriteBlocked = false;
      try {
        await request("/api/recruitments", {
          port: pausedPort,
          method: "POST",
          betaCode: "smoke-beta",
          body: { title: "Paused beta post", game: "Apex", platform: "PC", voice: "なし", body: "Should be paused" }
        });
      } catch (error) {
        pausedWriteBlocked = error.message.includes("503") && error.message.includes("beta write paused");
      }
      assert(pausedWriteBlocked, "beta paused write should be blocked");
      const pausedInquiry = await request("/api/inquiries", {
        port: pausedPort,
        method: "POST",
        betaCode: "smoke-beta",
        body: { name: "Paused tester", category: "不具合", message: "Inquiry during pause" }
      });
      assert(pausedInquiry.ok === true, "beta paused inquiry should remain open");
      const adminPostDuringPause = await request("/api/recruitments", {
        port: pausedPort,
        method: "POST",
        adminPin: "admin",
        body: { title: "Admin post during pause", game: "Apex", platform: "PC", voice: "なし", body: "Admin can verify recovery" }
      });
      assert(adminPostDuringPause.title === "Admin post during pause", "admin write should bypass beta pause");
    } finally {
      pausedChild.kill();
    }

    const publicPausedPort = port + 4;
    const publicPausedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "partyfinder-public-paused-smoke-"));
    const publicPausedChild = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(publicPausedPort), DATA_DIR: publicPausedDataDir, STORAGE_DRIVER: "json", ADMIN_PIN: "admin", PUBLIC_WRITE_PAUSED: "true" },
      stdio: "ignore"
    });
    try {
      await waitForServer(publicPausedPort);
      const publicPausedMe = await request("/api/me", { port: publicPausedPort });
      assert(publicPausedMe.betaWritePaused === true && publicPausedMe.publicWritePaused === true, "public write pause flag missing");
      const publicPausedState = await request("/api/state", { port: publicPausedPort });
      assert(publicPausedState.publicStatus?.mode === "paused", "public paused status missing");
      assert(publicPausedState.publicStatus?.publicWritePaused === true, "public paused status flag missing");
      let publicPausedWriteBlocked = false;
      try {
        await request("/api/threads", {
          port: publicPausedPort,
          method: "POST",
          body: { title: "Paused public thread", category: "雑談", body: "Should be paused" }
        });
      } catch (error) {
        publicPausedWriteBlocked = error.message.includes("503") && error.message.includes("public write paused");
      }
      assert(publicPausedWriteBlocked, "public paused write should be blocked");
      const publicPausedInquiry = await request("/api/inquiries", {
        port: publicPausedPort,
        method: "POST",
        body: { name: "Public paused user", category: "不具合", message: "Inquiry during public pause" }
      });
      assert(publicPausedInquiry.ok === true, "public paused inquiry should remain open");
    } finally {
      publicPausedChild.kill();
    }

    const firstState = await request("/api/state");
    const robots = await requestRaw("/robots.txt");
    assert(robots.body.includes("Allow: /"), "public robots should allow indexing when beta code is not set");
    assert(Array.isArray(firstState.recruitments), "recruitments missing");
    assert(Array.isArray(firstState.threads), "threads missing");
    assert(Array.isArray(firstState.announcements), "announcements missing");
    assert(Array.isArray(firstState.adSlots), "public ad slots missing");
    assert(firstState.publicStatus?.mode === "open", "public status missing");
    assert(firstState.adSlots.every(slot => slot.targetUrl || slot.html), "public placeholder ads should be hidden");

    let crossSiteBlocked = false;
    try {
      await request("/api/threads", {
        method: "POST",
        origin: "https://evil.example",
        body: { title: "Cross-site post", category: "雑談", body: "Should be blocked" }
      });
    } catch (error) {
      crossSiteBlocked = error.message.includes("403");
    }
    assert(crossSiteBlocked, "cross-site write request was not blocked");

    const recruitment = await request("/api/recruitments", {
      method: "POST",
      body: {
        title: "Smoke recruitment",
        game: "Apex",
        platform: "PC",
        voice: "あり",
        rank: "test",
        time: "now",
        style: "エンジョイ",
        capacity: 1,
        body: "Smoke test body"
      }
    });
    assert(recruitment.title === "Smoke recruitment", "recruitment create failed");
    assert(recruitment.status === "open", "recruitment default status failed");
    assert(recruitment.capacity === 1, "recruitment capacity failed");

    const dm = await request("/api/messages", {
      method: "POST",
      accountId: "smoke-dm-sender",
      displayName: "SmokeDmSender",
      body: {
        recruitmentId: recruitment.id,
        body: "Smoke DM hello"
      }
    });
    assert(Array.isArray(dm.messages) && dm.messages.length === 1, "dm send failed");
    assert(dm.messages[0].messages.some(message => message.body === "Smoke DM hello"), "dm message missing for sender");
    let duplicateDmBlocked = false;
    try {
      await request("/api/messages", {
        method: "POST",
        accountId: "smoke-dm-sender",
        displayName: "SmokeDmSender",
        body: {
          recruitmentId: recruitment.id,
          body: "Smoke DM hello"
        }
      });
    } catch (error) {
      duplicateDmBlocked = error.message.includes("409");
    }
    assert(duplicateDmBlocked, "duplicate dm was not blocked");

    const ownerStateWithDm = await request("/api/state");
    assert(ownerStateWithDm.messages.some(conversation => conversation.messages.some(message => message.body === "Smoke DM hello")), "dm missing for recipient");

    const replyDm = await request("/api/messages", {
      method: "POST",
      body: {
        conversationId: dm.messages[0].conversationId,
        body: "Smoke DM reply"
      }
    });
    assert(replyDm.messages[0].messages.some(message => message.body === "Smoke DM reply"), "dm reply failed");

    const dmMessageId = dm.messages[0].messages.find(message => message.body === "Smoke DM hello")?.id;
    assert(dmMessageId, "dm message id missing");
    const dmReport = await request("/api/reports", {
      method: "POST",
      body: { type: "messages", itemId: dmMessageId, reason: "Smoke DM report" }
    });
    assert(dmReport.ok, "dm report failed");
    const reportsWithDm = await request("/api/admin/reports", { adminPin: "admin" });
    assert(reportsWithDm.reports.some(entry => entry.type === "messages" && entry.itemId === dmMessageId), "admin dm report missing");
    const dmReportEntry = reportsWithDm.reports.find(entry => entry.type === "messages" && entry.itemId === dmMessageId);
    assert(dmReportEntry.conversationId === dm.messages[0].conversationId, "admin dm report conversation missing");
    assert(dmReportEntry.messagePreview.includes("Smoke DM hello"), "admin dm report preview missing");

    let selfDmReportBlocked = false;
    try {
      await request("/api/reports", {
        method: "POST",
        accountId: "smoke-dm-sender",
        displayName: "SmokeDmSender",
        body: { type: "messages", itemId: dmMessageId, reason: "Self DM report" }
      });
    } catch (error) {
      selfDmReportBlocked = error.message.includes("400");
    }
    assert(selfDmReportBlocked, "self dm report was not blocked");

    let outsiderDmReportBlocked = false;
    try {
      await request("/api/reports", {
        method: "POST",
        accountId: "smoke-dm-outsider",
        displayName: "SmokeDmOutsider",
        body: { type: "messages", itemId: dmMessageId, reason: "Outsider DM report" }
      });
    } catch (error) {
      outsiderDmReportBlocked = error.message.includes("404");
    }
    assert(outsiderDmReportBlocked, "outsider dm report was not blocked");

    const hiddenDm = await request(`/api/messages/${dmMessageId}`, {
      method: "DELETE",
      adminPin: "admin",
      body: { reason: "Smoke hide DM reason" }
    });
    assert(hiddenDm.ok, "dm hide failed");
    const ownerStateAfterDmHide = await request("/api/state");
    assert(!ownerStateAfterDmHide.messages.some(conversation => conversation.messages.some(message => message.id === dmMessageId)), "hidden dm still visible to recipient");
    const senderStateAfterDmHide = await request("/api/state", {
      accountId: "smoke-dm-sender",
      displayName: "SmokeDmSender"
    });
    assert(!senderStateAfterDmHide.messages.some(conversation => conversation.messages.some(message => message.id === dmMessageId)), "hidden dm still visible to sender");
    const reportsAfterDmHide = await request("/api/admin/reports", { adminPin: "admin" });
    assert(reportsAfterDmHide.reports.some(entry => entry.type === "messages" && entry.itemId === dmMessageId && entry.status === "resolved"), "dm report was not resolved after hide");
    const deletedAfterDmHide = await request("/api/admin/deleted-items", { adminPin: "admin" });
    const hiddenDmArchive = deletedAfterDmHide.deletedItems.find(entry => entry.kind === "message" && entry.payload?.message?.id === dmMessageId);
    assert(hiddenDmArchive, "hidden dm archive missing");
    const restoredDm = await request(`/api/admin/deleted-items/${hiddenDmArchive.id}/restore`, {
      method: "POST",
      adminPin: "admin"
    });
    assert(restoredDm.ok, "hidden dm restore failed");
    const ownerStateAfterDmRestore = await request("/api/state");
    assert(ownerStateAfterDmRestore.messages.some(conversation => conversation.messages.some(message => message.id === dmMessageId)), "restored dm missing for recipient");

    const recruitmentShare = await requestRaw(`/share/recruitments/${recruitment.id}`);
    assert(recruitmentShare.body.includes("Smoke recruitment"), "recruitment share page missing title");
    assert(recruitmentShare.body.includes(`/#recruitments:${recruitment.id}`), "recruitment share page missing app link");
    assert(recruitmentShare.body.includes("og:image"), "recruitment share page missing og image");
    assert(recruitmentShare.body.includes("summary_large_image"), "recruitment share page missing twitter card");
    assert(recruitmentShare.body.includes("application/ld+json") && recruitmentShare.body.includes("DiscussionForumPosting"), "recruitment share page missing structured data");
    assert(recruitmentShare.headers["content-security-policy"], "share page csp missing");

    let duplicateRecruitmentBlocked = false;
    try {
      await request("/api/recruitments", {
        method: "POST",
        body: {
          title: "Smoke recruitment",
          game: "Apex",
          platform: "PC",
          voice: "縺ゅｊ",
          rank: "test",
          time: "now",
          style: "繧ｨ繝ｳ繧ｸ繝ｧ繧､",
          capacity: 1,
          body: "Smoke test body"
        }
      });
    } catch (error) {
      duplicateRecruitmentBlocked = error.message.includes("409");
    }
    assert(duplicateRecruitmentBlocked, "duplicate recruitment was not blocked");

    let linkSpamBlocked = false;
    try {
      await request("/api/recruitments", {
        method: "POST",
        body: {
          title: "Link spam",
          game: "Apex",
          platform: "PC",
          voice: "縺ゅｊ",
          rank: "test",
          time: "now",
          style: "繧ｨ繝ｳ繧ｸ繝ｧ繧､",
          body: "https://a.example https://b.example https://c.example"
        }
      });
    } catch (error) {
      linkSpamBlocked = error.message.includes("400");
    }
    assert(linkSpamBlocked, "link spam recruitment was not blocked");

    const joined = await request(`/api/recruitments/${recruitment.id}/join`, { method: "POST" });
    assert(joined.viewerJoined === true && joined.participantCount === 1, "join failed");
    assert(joined.viewerOwned === true, "viewer owned flag failed");

    let fullBlocked = false;
    try {
      await request(`/api/recruitments/${recruitment.id}/join`, {
        method: "POST",
        accountId: "second-user",
        displayName: "SecondUser"
      });
    } catch (error) {
      fullBlocked = error.message.includes("400");
    }
    assert(fullBlocked, "full recruitment was not blocked");

    const left = await request(`/api/recruitments/${recruitment.id}/join`, { method: "POST" });
    assert(left.viewerJoined === false && left.participantCount === 0, "leave failed");

    const closed = await request(`/api/recruitments/${recruitment.id}/status`, {
      method: "PATCH",
      body: { status: "closed" }
    });
    assert(closed.status === "closed", "recruitment close failed");

    const reopened = await request(`/api/recruitments/${recruitment.id}/status`, {
      method: "PATCH",
      body: { status: "open" }
    });
    assert(reopened.status === "open", "recruitment reopen failed");

    const liked = await request(`/api/recruitments/${recruitment.id}/like`, { method: "POST" });
    assert(liked.viewerLiked === true && liked.likeCount === 1, "like failed");

    const unliked = await request(`/api/recruitments/${recruitment.id}/like`, { method: "POST" });
    assert(unliked.viewerLiked === false && unliked.likeCount === 0, "unlike failed");

    const replied = await request(`/api/recruitments/${recruitment.id}/reply`, {
      method: "POST",
      body: { body: "Smoke reply body" }
    });
    assert(replied.replies.some(reply => reply.body === "Smoke reply body"), "reply failed");
    const userData = await request("/api/me/data");
    assert(userData.data.counts.recruitments >= 1, "user data recruitment count failed");
    assert(userData.data.counts.replies >= 1, "user data reply count failed");
    assert(userData.data.counts.visibleMessages >= 1, "user data dm count failed");
    assert(Array.isArray(userData.data.recentOwnedItems), "user data recent items missing");
    assert(userData.data.dataHandling?.deletionRequestTargets?.includes("表示中DM"), "user data handling deletion scope missing");
    assert(userData.data.dataHandling?.retainedForSafety?.includes("監査ログ"), "user data handling safety retention missing");
    const userExport = await request("/api/me/export");
    assert(userExport.data.format === "red-thread-user-data-v1", "user data export format failed");
    assert(userExport.data.accountId === "smoke-user", "user data export account failed");
    assert(userExport.data.recruitments.some(item => item.id === recruitment.id), "user data export recruitment failed");
    assert(userExport.data.messages.length >= 1, "user data export messages failed");
    const adminUserData = await request("/api/admin/accounts/smoke-user/data", { adminPin: "admin" });
    assert(adminUserData.data.accountId === "smoke-user", "admin account data summary account failed");
    assert(adminUserData.data.counts.recruitments >= 1, "admin account data summary count failed");

    const eraseRecruitment = await request("/api/recruitments", {
      method: "POST",
      accountId: "erase-user",
      displayName: "EraseUser",
      body: {
        title: "Erase user recruitment",
        game: "Apex",
        rank: "Gold",
        platform: "PC",
        voice: "あり",
        style: "エンジョイ",
        capacity: 2,
        body: "Erase user recruitment body"
      }
    });
    const eraseThread = await request("/api/threads", {
      method: "POST",
      accountId: "erase-user",
      displayName: "EraseUser",
      body: { title: "Erase user thread", category: "雑談", body: "Erase user thread body" }
    });
    const eraseReply = await request(`/api/recruitments/${recruitment.id}/reply`, {
      method: "POST",
      accountId: "erase-user",
      displayName: "EraseUser",
      body: { body: "Erase user reply" }
    });
    assert(eraseReply.replies.some(reply => reply.body === "Erase user reply"), "erase user reply setup failed");
    await request("/api/messages", {
      method: "POST",
      accountId: "erase-user",
      displayName: "EraseUser",
      body: { recruitmentId: recruitment.id, body: "Erase user DM" }
    });
    let eraseConfirmBlocked = false;
    try {
      await request("/api/admin/accounts/erase-user/erase", {
        method: "POST",
        adminPin: "admin",
        body: { confirmAccountId: "wrong-user", reason: "Smoke account erase" }
      });
    } catch (error) {
      eraseConfirmBlocked = true;
    }
    assert(eraseConfirmBlocked, "account erasure confirmation was not required");
    const erasedAccount = await request("/api/admin/accounts/erase-user/erase", {
      method: "POST",
      adminPin: "admin",
      body: { confirmAccountId: "erase-user", reason: "Smoke account erase" }
    });
    assert(erasedAccount.ok, "account erasure failed");
    assert(erasedAccount.result.counts.recruitments >= 1 && erasedAccount.result.counts.threads >= 1, "account erasure post counts failed");
    assert(erasedAccount.result.counts.replies >= 1 && erasedAccount.result.counts.messages >= 1, "account erasure interaction counts failed");
    const erasedState = await request("/api/state");
    assert(!erasedState.recruitments.some(item => item.id === eraseRecruitment.id), "erased recruitment still visible");
    assert(!erasedState.threads.some(item => item.id === eraseThread.id), "erased thread still visible");
    assert(!erasedState.recruitments.some(item => item.replies.some(reply => reply.accountId === "erase-user")), "erased reply still visible");
    assert(!erasedState.messages.some(conversation => conversation.messages.some(message => message.author === "EraseUser")), "erased dm still visible");
    const erasedUserExport = await request("/api/me/export", { accountId: "erase-user", displayName: "EraseUser" });
    assert(erasedUserExport.data.summary.counts.recruitments === 0, "erased user export recruitment count failed");
    assert(erasedUserExport.data.summary.counts.visibleMessages === 0, "erased user export dm count failed");
    const erasureDeletedItems = await request("/api/admin/deleted-items", { adminPin: "admin" });
    const erasureArchive = erasureDeletedItems.deletedItems.find(entry => entry.kind === "account_erasure" && entry.payload?.accountId === "erase-user");
    assert(erasureArchive, "account erasure archive missing");
    let erasureRestoreBlocked = false;
    try {
      await request(`/api/admin/deleted-items/${erasureArchive.id}/restore`, { method: "POST", adminPin: "admin" });
    } catch (error) {
      erasureRestoreBlocked = true;
    }
    assert(erasureRestoreBlocked, "account erasure archive should not restore");

    let duplicateReplyBlocked = false;
    try {
      await request(`/api/recruitments/${recruitment.id}/reply`, {
        method: "POST",
        body: { body: "Smoke reply body" }
      });
    } catch (error) {
      duplicateReplyBlocked = error.message.includes("409");
    }
    assert(duplicateReplyBlocked, "duplicate reply was not blocked");

    const smokeReply = replied.replies.find(reply => reply.body === "Smoke reply body");
    const replyReport = await request("/api/reports", {
      method: "POST",
      accountId: "reply-reporter",
      displayName: "ReplyReporter",
      body: {
        type: "replies",
        parentType: "recruitments",
        parentId: recruitment.id,
        itemId: smokeReply.id,
        replyId: smokeReply.id,
        reason: "Smoke reply report"
      }
    });
    assert(replyReport.ok, "reply report failed");

    const reportsWithReply = await request("/api/admin/reports", { adminPin: "admin" });
    assert(reportsWithReply.reports.some(entry => entry.type === "replies" && entry.replyId === smokeReply.id), "admin reply report missing");

    const replyDeleted = await request(`/api/recruitments/${recruitment.id}/replies/${smokeReply.id}`, {
      method: "DELETE",
      adminPin: "admin",
      body: { reason: "Smoke delete reason" }
    });
    assert(!replyDeleted.replies.some(reply => reply.id === smokeReply.id), "reply delete failed");

    const deletedAfterReplyDelete = await request("/api/admin/deleted-items", { adminPin: "admin" });
    const deletedReply = deletedAfterReplyDelete.deletedItems.find(entry => entry.kind === "reply" && entry.payload?.reply?.id === smokeReply.id);
    assert(deletedReply, "deleted reply archive missing");
    assert(deletedReply.payload.reason === "Smoke delete reason", "deleted reply reason missing");

    const moderationAfterReplyDelete = await request("/api/admin/moderation-events", { adminPin: "admin" });
    assert(moderationAfterReplyDelete.moderationEvents.some(event => event.action === "manual_delete" && event.details?.reason === "Smoke delete reason"), "manual delete moderation event missing");

    const restoredReply = await request(`/api/admin/deleted-items/${deletedReply.id}/restore`, {
      method: "POST",
      adminPin: "admin"
    });
    assert(restoredReply.ok, "deleted reply restore failed");

    const stateAfterReplyRestore = await request("/api/state");
    const restoredRecruitment = stateAfterReplyRestore.recruitments.find(entry => entry.id === recruitment.id);
    assert(restoredRecruitment.replies.some(reply => reply.id === smokeReply.id), "restored reply missing");

    const thread = await request("/api/threads", {
      method: "POST",
      body: { title: "Smoke thread", category: "攻略相談", body: "Smoke chat body" }
    });
    assert(thread.category === "攻略相談", "thread create failed");

    const threadShare = await requestRaw(`/share/threads/${thread.id}`);
    assert(threadShare.body.includes("Smoke thread"), "thread share page missing title");
    assert(threadShare.body.includes(`/#threads:${thread.id}`), "thread share page missing app link");

    const sitemap = await requestRaw("/sitemap.xml");
    assert(sitemap.headers["content-type"]?.includes("application/xml"), "sitemap content type failed");
    assert(sitemap.body.includes("/guidelines.html"), "sitemap guidelines missing");
    assert(sitemap.body.includes("/terms.html"), "sitemap terms missing");
    assert(sitemap.body.includes("/privacy.html"), "sitemap privacy missing");
    assert(sitemap.body.includes(`/share/recruitments/${recruitment.id}`), "sitemap recruitment share missing");
    assert(sitemap.body.includes(`/share/threads/${thread.id}`), "sitemap thread share missing");
    const feed = await requestRaw("/feed.xml");
    assert(feed.headers["content-type"]?.includes("application/rss+xml"), "feed content type failed");
    assert(feed.body.includes("<rss") && feed.body.includes("Red Thread 新着投稿"), "feed rss root missing");
    assert(feed.body.includes(`/share/recruitments/${recruitment.id}`), "feed recruitment share missing");
    assert(feed.body.includes(`/share/threads/${thread.id}`), "feed thread share missing");

    const report = await request("/api/reports", {
      method: "POST",
      body: { type: "threads", itemId: thread.id, reason: "Smoke report" }
    });
    assert(report.ok, "report failed");

    const admin = await request("/api/admin/reports", { adminPin: "admin" });
    assert(admin.reports.length >= 1, "admin reports failed");
    assert(admin.reports[0].reportedAccountId, "report target account missing");

    const rejectReport = await request("/api/reports", {
      method: "POST",
      accountId: "second-reporter",
      displayName: "SecondReporter",
      body: { type: "threads", itemId: thread.id, reason: "Smoke reject report" }
    });
    assert(rejectReport.ok, "second report failed");
    const reportsBeforeReject = await request("/api/admin/reports", { adminPin: "admin" });
    const reportToReject = reportsBeforeReject.reports.find(entry => entry.reason === "Smoke reject report");
    assert(reportToReject, "report to reject missing");
    await request(`/api/admin/reports/${reportToReject.id}/reject`, {
      method: "POST",
      adminPin: "admin",
      body: { resolution: "Smoke no action" }
    });
    const reportsAfterReject = await request("/api/admin/reports", { adminPin: "admin" });
    assert(reportsAfterReject.reports.some(entry => entry.id === reportToReject.id && entry.status === "rejected"), "report reject failed");

    const stats = await request("/api/admin/stats", { adminPin: "admin" });
    assert(stats.stats.recruitments >= 1, "admin stats recruitment count failed");
    assert(stats.stats.threads >= 1, "admin stats thread count failed");
    assert(stats.stats.openReports >= 1, "admin stats report count failed");
    assert(typeof stats.stats.messageConversations === "number", "admin stats dm conversation count failed");
    assert(typeof stats.stats.directMessages === "number", "admin stats dm count failed");
    assert(typeof stats.stats.hiddenMessages === "number", "admin stats hidden dm count failed");
    assert(typeof stats.stats.openMessageReports === "number", "admin stats dm report count failed");
    assert(stats.stats.posts24h >= 1, "admin stats recent posts failed");
    assert(stats.stats.replies24h >= 1, "admin stats recent replies failed");
    assert(stats.stats.moderationEvents24h >= 1, "admin stats moderation count failed");

    const moderationEvents = await request("/api/admin/moderation-events", { adminPin: "admin" });
    assert(moderationEvents.moderationEvents.some(event => event.action === "duplicate_blocked"), "duplicate moderation event missing");
    assert(moderationEvents.moderationEvents.some(event => event.action === "content_blocked"), "content moderation event missing");

    const system = await request("/api/admin/system", { adminPin: "admin" });
    assert(system.system.app === "partyfinder-production", "system app name failed");
    assert(Array.isArray(system.system.checks), "system checks missing");
    assert(Array.isArray(system.system.betaReadiness), "beta readiness checks missing");
    assert(system.system.betaReadiness.some(check => check.label === "β参加コード"), "beta readiness access code check missing");
    assert(system.system.checks.some(check => check.label === "保存方式"), "storage system check missing");
    assert(system.system.checks.some(check => check.label === "データベースURL"), "database url system check missing");
    assert(system.system.checks.some(check => check.label === "セキュリティ連絡先"), "security contact system check missing");
    assert(system.system.retention?.deletedItems === 500, "system retention policy missing");
    assert(typeof system.system.uptimeSeconds === "number", "system uptime missing");

    const botDrafts = await request("/api/admin/bot/drafts", { adminPin: "admin" });
    assert(Array.isArray(botDrafts.drafts) && botDrafts.drafts.length >= 10, "official bot launch drafts missing");
    assert(botDrafts.drafts.some(draft => draft.launchTag === "公開初日"), "official bot launch tag missing");
    assert(botDrafts.drafts.filter(draft => draft.type === "recruitments").length >= 5, "official bot recruitment drafts missing");
    assert(botDrafts.drafts.filter(draft => draft.type === "threads").length >= 5, "official bot thread drafts missing");
    const botPublish = await request("/api/admin/bot/publish", {
      method: "POST",
      adminPin: "admin",
      body: { draftIds: ["recruit-apex-short-no-vc", "thread-tonight-game-checkin"] }
    });
    assert(botPublish.published.length === 2, "official bot selected publish failed");
    const stateWithOfficialBots = await request("/api/state");
    assert(stateWithOfficialBots.recruitments.some(item => item.isOfficial && item.title === "Apex 30分だけカジュアル"), "official bot recruitment state missing");
    assert(stateWithOfficialBots.threads.some(item => item.isOfficial && item.title === "今夜遊ぶゲームを書くだけの場所"), "official bot thread state missing");
    const botDraftsAfterPublish = await request("/api/admin/bot/drafts", { adminPin: "admin" });
    assert(botDraftsAfterPublish.drafts.some(draft => draft.id === "recruit-apex-short-no-vc" && draft.alreadyPublished), "official bot published draft state failed");

    const inquiry = await request("/api/inquiries", {
      method: "POST",
      body: { name: "Smoke User", contact: "smoke@example.com", category: "βフィードバック", requestId: "smoke-request-id", message: "Smoke inquiry" }
    });
    assert(inquiry.ok, "inquiry create failed");
    assert(inquiry.inquiryId, "inquiry response id missing");
    assert(inquiry.requestId === "smoke-request-id", "inquiry response request id failed");
    assert(typeof inquiry.receivedAt === "number", "inquiry received timestamp missing");

    const inquiries = await request("/api/admin/inquiries", { adminPin: "admin" });
    const smokeInquiry = inquiries.inquiries.find(entry => entry.message === "Smoke inquiry");
    assert(smokeInquiry, "admin inquiries failed");
    assert(smokeInquiry.category === "βフィードバック", "beta feedback inquiry category failed");
    assert(smokeInquiry.requestId === "smoke-request-id", "inquiry request id failed");
    assert(Object.prototype.hasOwnProperty.call(smokeInquiry, "requestTrace"), "inquiry request trace field missing");
    const deletionInquiry = await request("/api/inquiries", {
      method: "POST",
      body: { name: "Smoke User", category: "削除依頼", message: "Please delete my smoke data" }
    });
    assert(deletionInquiry.ok, "deletion request inquiry failed");
    const inquiriesWithDeletion = await request("/api/admin/inquiries", { adminPin: "admin" });
    const deletionEntry = inquiriesWithDeletion.inquiries.find(entry => entry.category === "削除依頼" && entry.message === "Please delete my smoke data");
    assert(deletionEntry, "admin deletion request inquiry missing");
    const statsWithBetaFeedback = await request("/api/admin/stats", { adminPin: "admin" });
    assert(statsWithBetaFeedback.stats.openBetaFeedback >= 1, "admin beta feedback stats failed");
    assert(statsWithBetaFeedback.stats.betaFeedback24h >= 1, "admin beta feedback 24h stats failed");
    const betaReport = await request("/api/admin/beta-report", { adminPin: "admin" });
    assert(betaReport.report.summary.posts >= 1, "beta daily report posts failed");
    assert(betaReport.report.summary.activePosts >= 1, "beta daily report active posts failed");
    assert(typeof betaReport.report.summary.responseRate === "number", "beta daily report response rate failed");
    assert(typeof betaReport.report.summary.silentPosts === "number", "beta daily report silent posts failed");
    assert(typeof betaReport.report.summary.openReports === "number", "beta daily report open reports failed");
    assert(typeof betaReport.report.summary.openMessageReports === "number", "beta daily report dm reports failed");
    assert(typeof betaReport.report.summary.directMessages === "number", "beta daily report dm count failed");
    assert(typeof betaReport.report.summary.messageConversations === "number", "beta daily report dm conversation count failed");
    assert(typeof betaReport.report.summary.hiddenMessages === "number", "beta daily report hidden dm count failed");
    assert(typeof betaReport.report.summary.openInquiries === "number", "beta daily report open inquiries failed");
    assert(typeof betaReport.report.summary.openDeletionRequests === "number", "beta daily report deletion requests failed");
    assert(Array.isArray(betaReport.report.openDeletionRequests) && betaReport.report.openDeletionRequests.some(entry => entry.counts?.recruitments >= 1), "beta daily report deletion request data failed");
    assert(typeof betaReport.report.summary.staleQueue === "number", "beta daily report stale queue count failed");
    assert(betaReport.report.summary.backupAgeHours === null || typeof betaReport.report.summary.backupAgeHours === "number", "beta daily report backup age failed");
    assert(betaReport.report.summary.betaFeedback >= 1, "beta daily report feedback failed");
    assert(betaReport.report.summaryText.includes("Red Thread β日次メモ"), "beta daily report summary text missing");
    assert(betaReport.report.summaryText.includes("未対応DM通報"), "beta daily report dm summary missing");
    assert(betaReport.report.summaryText.includes("今日の確認"), "beta daily report summary actions missing");
    assert(betaReport.report.summaryText.includes("[高]") || betaReport.report.summaryText.includes("[中]") || betaReport.report.summaryText.includes("[低]"), "beta daily report priority summary missing");
    assert(betaReport.report.summaryText.includes("伸びている投稿"), "beta daily report trending text missing");
    assert(betaReport.report.summaryText.includes("テスターへの声かけ"), "beta daily report tester callouts text missing");
    assert(Array.isArray(betaReport.report.actions) && betaReport.report.actions.length >= 1, "beta daily report actions missing");
    assert(Array.isArray(betaReport.report.operatorQueue) && betaReport.report.operatorQueue.length >= 1, "beta daily report operator queue missing");
    assert(betaReport.report.operatorQueue.every(item => ["高", "中", "低"].includes(item.priority)), "beta daily report operator priority missing");
    assert(Array.isArray(betaReport.report.testerCallouts) && betaReport.report.testerCallouts.length >= 1, "beta daily report tester callouts missing");
    assert(Array.isArray(betaReport.report.trendingPosts), "beta daily report trending posts missing");
    assert(betaReport.report.trendingPosts.some(item => typeof item.score === "number"), "beta daily report trending score missing");
    assert(Array.isArray(betaReport.report.recentBetaFeedback), "beta daily report feedback list missing");
    assert(Array.isArray(betaReport.report.silentPosts), "beta daily report silent post list missing");
    assert(Array.isArray(betaReport.report.staleQueue), "beta daily report stale queue list missing");
    assert(Array.isArray(betaReport.report.safetyWatch), "beta daily report safety watch missing");
    const betaLaunch = await request("/api/admin/beta-launch", { adminPin: "admin" });
    assert(["ready", "caution", "stop"].includes(betaLaunch.launch.status), "beta launch decision status failed");
    assert(Array.isArray(betaLaunch.launch.checks) && betaLaunch.launch.checks.some(check => check.label === "β参加コード"), "beta launch decision checks failed");
    assert(betaLaunch.launch.checks.some(check => check.label === "バックアップ"), "beta launch backup check failed");
    assert(betaLaunch.launch.counts.backupAgeHours === null || typeof betaLaunch.launch.counts.backupAgeHours === "number", "beta launch backup age failed");
    assert(typeof betaLaunch.launch.counts.placeholderAds === "number", "beta launch placeholder ad count failed");
    assert(betaLaunch.launch.checks.some(check => check.label === "広告差し替え"), "beta launch ad replacement check missing");
    assert(betaLaunch.launch.checks.some(check => check.label === "未対応DM通報"), "beta launch dm report check missing");
    assert(typeof betaLaunch.launch.counts.openMessageReports === "number", "beta launch dm report count failed");
    assert(typeof betaLaunch.launch.counts.messageConversations === "number", "beta launch dm conversation count failed");
    assert(typeof betaLaunch.launch.counts.hiddenMessages === "number", "beta launch hidden dm count failed");
    assert(betaLaunch.launch.checks.some(check => check.label === "24h安全イベント"), "beta launch safety event check failed");
    assert(betaLaunch.launch.checks.some(check => check.label === "βテスター進捗"), "beta tester progress check missing");
    assert(betaLaunch.launch.checks.some(check => check.label === "β成功指標"), "beta success metric check missing");
    assert(betaLaunch.launch.testerProgress && betaLaunch.launch.testerProgress.testers >= 1, "beta tester progress missing testers");
    assert(betaLaunch.launch.testerProgress.recruitmentPosters >= 1, "beta tester recruitment progress failed");
    assert(betaLaunch.launch.testerProgress.threadPosters >= 1, "beta tester thread progress failed");
    assert(betaLaunch.launch.testerProgress.feedbackSenders >= 1, "beta tester feedback progress failed");
    assert(typeof betaLaunch.launch.testerProgress.completionRate === "number", "beta tester completion rate failed");
    assert(typeof betaLaunch.launch.testerProgress.inviteDropoff === "number", "beta tester invite dropoff failed");
    assert(typeof betaLaunch.launch.testerProgress.needsRecruitment === "number", "beta tester recruitment gap failed");
    assert(typeof betaLaunch.launch.testerProgress.needsThread === "number", "beta tester thread gap failed");
    assert(typeof betaLaunch.launch.testerProgress.needsFeedback === "number", "beta tester feedback gap failed");
    assert(Array.isArray(betaLaunch.launch.testerProgress.bottlenecks), "beta tester bottlenecks missing");
    assert(betaLaunch.launch.successMetrics && Array.isArray(betaLaunch.launch.successMetrics.goals), "beta success metrics missing");
    assert(betaLaunch.launch.successMetrics.goals.some(goal => goal.key === "responseRate"), "beta response rate goal missing");
    assert(typeof betaLaunch.launch.successMetrics.score === "number", "beta success score missing");
    assert(Array.isArray(betaLaunch.launch.nextActions) && betaLaunch.launch.nextActions.length >= 1, "beta launch decision next actions failed");
    assert(betaLaunch.launch.inviteTemplate.includes("参加コード: 別途お送りします"), "beta launch invite template failed");
    assert(betaLaunch.launch.inviteTemplate.includes("βクイックスタート"), "beta invite quickstart guidance failed");
    assert(betaLaunch.launch.inviteTemplate.includes("問い合わせへ"), "beta invite error inquiry guidance failed");
    assert(betaLaunch.launch.inviteTemplate.includes("?ref=beta-invite"), "beta invite ref link failed");
    assert(Array.isArray(betaLaunch.launch.followupTemplates) && betaLaunch.launch.followupTemplates.length >= 3, "beta followup templates missing");
    assert(betaLaunch.launch.followupTemplates.some(template => template.label === "反応促進"), "beta reaction followup missing");

    const publicLaunch = await request("/api/admin/public-launch", { adminPin: "admin" });
    assert(["ready", "caution", "stop"].includes(publicLaunch.launch.status), "public launch decision status failed");
    assert(Array.isArray(publicLaunch.launch.checks) && publicLaunch.launch.checks.some(check => check.label === "一般公開モード"), "public launch decision checks failed");
    assert(publicLaunch.launch.checks.some(check => check.label === "データベースURL"), "public launch database url check missing");
    assert(publicLaunch.launch.checks.some(check => check.label === "シード投稿"), "public launch seed check missing");
    assert(publicLaunch.launch.checks.some(check => check.label === "広告枠"), "public launch ad slot check missing");
    assert(publicLaunch.launch.checks.some(check => check.label === "広告URL"), "public launch ad target check missing");
    assert(typeof publicLaunch.launch.counts.placeholderAds === "number", "public launch placeholder ad count failed");
    assert(typeof publicLaunch.launch.counts.invalidAdTargets === "number", "public launch invalid ad target count failed");
    assert(Array.isArray(publicLaunch.launch.nextActions), "public launch next actions missing");
    assert(Array.isArray(publicLaunch.launch.publicTemplates) && publicLaunch.launch.publicTemplates.length >= 3, "public launch templates missing");
    assert(publicLaunch.launch.publicTemplates.some(template => template.label === "X告知" && template.text.includes("Red Thread")), "public launch x template missing");

    const publicReport = await request("/api/admin/public-report", { adminPin: "admin" });
    assert(publicReport.report.summary && typeof publicReport.report.summary.posts === "number", "public report summary failed");
    assert(typeof publicReport.report.summary.openDeletionRequests === "number", "public report deletion requests failed");
    assert(Array.isArray(publicReport.report.openDeletionRequests), "public report deletion request list failed");
    assert(Array.isArray(publicReport.report.operatorQueue), "public report operator queue missing");
    assert(Array.isArray(publicReport.report.launchManualChecks), "public report manual checks missing");
    assert(publicReport.report.launchManualChecks.some(item => item.label === "緊急停止"), "public report emergency manual check missing");
    assert(Array.isArray(publicReport.report.launchWatchPlan), "public report launch watch plan missing");
    assert(publicReport.report.launchWatchPlan.some(item => item.window === "最初の30分"), "public report first 30 minutes watch missing");
    assert(Array.isArray(publicReport.report.referrers), "public report referrers missing");
    assert(Array.isArray(publicReport.report.recentErrors), "public report recent errors missing");
    assert(publicReport.report.ads && typeof publicReport.report.ads.placeholder === "number", "public report ad summary missing");
    assert(typeof publicReport.report.summary.invalidAdTargets === "number", "public report invalid ad target summary missing");
    assert(publicReport.report.summaryText.includes("Red Thread 公開運用メモ"), "public report summary text missing");
    assert(publicReport.report.summaryText.includes("広告:"), "public report ad summary text missing");
    assert(publicReport.report.summaryText.includes("公開後手動確認"), "public report manual checks text missing");
    assert(publicReport.report.summaryText.includes("公開直後の監視"), "public report launch watch text missing");

    const publicReleaseChecklist = await request("/api/admin/public-release-checklist", { adminPin: "admin" });
    assert(["ready", "caution", "stop"].includes(publicReleaseChecklist.checklist.status), "public release checklist status failed");
    assert(publicReleaseChecklist.checklist.summaryText.includes("Red Thread 公開直前チェック"), "public release checklist summary missing");
    assert(typeof publicReleaseChecklist.checklist.gateSummary?.stop === "number", "public release gate summary stop missing");
    assert(publicReleaseChecklist.checklist.summaryText.includes("最初に見る項目"), "public release first actions missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.phase === "ホスティング設定"), "public release hosting phase missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "データベースURL")), "public release database url item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "セキュリティ連絡先")), "public release security contact item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "広告URL")), "public release ad target item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "Staff roles SQL" && item.detail.includes("admin:roles:write"))), "public release staff role sql item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "セキュリティヘッダー" && item.command === "npm run live:check")), "public release security header item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "公開ステータス" && item.command === "npm run status:check")), "public release status check item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.label === "ガイドライン")), "public release guidelines item missing");
    assert(publicReleaseChecklist.checklist.checks.some(group => group.items.some(item => item.command === "npm run live:check")), "public release live check command missing");

    const deploymentHandoff = await request("/api/admin/deployment-handoff", { adminPin: "admin" });
    assert(["ready", "todo"].includes(deploymentHandoff.handoff.status), "deployment handoff status failed");
    assert(deploymentHandoff.handoff.summaryText.includes("Red Thread 外部サービス設定ハンドオフ"), "deployment handoff summary missing");
    assert(deploymentHandoff.handoff.summaryText.includes("実行順"), "deployment handoff sequence summary missing");
    assert(Array.isArray(deploymentHandoff.handoff.handoffSteps), "deployment handoff steps missing");
    assert(deploymentHandoff.handoff.handoffSteps.some(step => step.label === "デプロイ検証"), "deployment handoff deploy verify step missing");
    assert(deploymentHandoff.handoff.handoffSteps.some(step => step.label === "初回バックアップ"), "deployment handoff first backup step missing");
    assert(Array.isArray(deploymentHandoff.handoff.envChecklist), "deployment handoff env checklist missing");
    assert(deploymentHandoff.handoff.envChecklist.some(item => item.key === "DATABASE_URL" && item.secret === true), "deployment handoff database secret flag missing");
    assert(deploymentHandoff.handoff.envChecklist.some(item => item.key === "PUBLIC_BASE_URL"), "deployment handoff public base url env item missing");
    assert(deploymentHandoff.handoff.summaryText.includes("安全な環境変数チェック"), "deployment handoff env checklist summary missing");
    assert(deploymentHandoff.handoff.services.some(service => service.name === "Supabase/Postgres"), "deployment handoff database service missing");
    assert(deploymentHandoff.handoff.services.some(service => service.items.some(item => item.label === "DATABASE_URL")), "deployment handoff database url item missing");
    assert(deploymentHandoff.handoff.services.some(service => service.items.some(item => item.label === "PUBLIC_SECURITY_CONTACT")), "deployment handoff security contact item missing");
    assert(deploymentHandoff.handoff.services.some(service => service.items.some(item => item.label === "Staff roles SQL" && item.detail.includes("admin:roles:write"))), "deployment handoff staff role sql item missing");
    assert(deploymentHandoff.handoff.services.some(service => service.name === "Discord"), "deployment handoff discord service missing");
    assert(deploymentHandoff.handoff.safeEnv.DATABASE_URL !== process.env.DATABASE_URL, "deployment handoff should not expose database url");

    const operatorDigest = await request("/api/admin/operator-digest", { adminPin: "admin" });
    assert(operatorDigest.digest.summary && typeof operatorDigest.digest.summary.openReports === "number", "operator digest summary failed");
    assert(Array.isArray(operatorDigest.digest.priorityQueue), "operator digest priority queue missing");
    assert(operatorDigest.digest.summaryText.includes("Red Thread 運用ダイジェスト"), "operator digest summary text missing");
    assert(operatorDigest.digest.launch && typeof operatorDigest.digest.launch.publicBlockers === "number", "operator digest launch failed");
    assert(typeof operatorDigest.digest.summary.openDeletionRequests === "number", "operator digest deletion requests failed");
    assert(typeof operatorDigest.digest.summary.invalidAdTargets === "number", "operator digest ad target summary missing");
    assert(operatorDigest.digest.summaryText.includes("未差替"), "operator digest ad summary text missing");
    assert(Array.isArray(operatorDigest.digest.openInquirySummaries), "operator digest inquiry summaries missing");
    assert(operatorDigest.digest.summaryText.includes("未対応問い合わせ"), "operator digest inquiry summary text missing");

    const incidentBrief = await request("/api/admin/incident-brief", { adminPin: "admin" });
    assert(["normal", "watch", "incident"].includes(incidentBrief.brief.status), "incident brief status failed");
    assert(incidentBrief.brief.summaryText.includes("Red Thread インシデント共有メモ"), "incident brief summary text missing");
    assert(Array.isArray(incidentBrief.brief.immediateActions), "incident brief actions missing");
    assert(typeof incidentBrief.brief.health.recentErrors === "number", "incident brief health failed");
    assert(incidentBrief.brief.publicNoticeText.includes("/status"), "incident public notice missing");
    assert(incidentBrief.brief.internalHandoffText.includes("Red Thread internal handoff"), "incident internal handoff missing");

    await request(`/api/admin/inquiries/${deletionEntry.id}/resolve`, {
      method: "POST",
      adminPin: "admin",
      body: { resolutionNote: "Smoke deletion handled" }
    });
    const resolvedDeletion = await request("/api/admin/inquiries", { adminPin: "admin" });
    assert(resolvedDeletion.inquiries.some(entry => entry.id === deletionEntry.id && entry.status === "resolved" && entry.resolutionNote === "Smoke deletion handled"), "deletion request resolution note failed");

    await requestRaw("/?ref=beta-invite");
    const betaLaunchWithRef = await request("/api/admin/beta-launch", { adminPin: "admin" });
    assert(betaLaunchWithRef.launch.testerProgress.inviteVisits >= 1, "beta invite visit progress failed");
    assert(typeof betaLaunchWithRef.launch.testerProgress.inviteToTesterRate === "number", "beta invite conversion rate failed");
    const systemWithRef = await request("/api/admin/system", { adminPin: "admin" });
    assert(systemWithRef.system.health.runtime.refCounts["beta-invite"] >= 1, "ref tracking failed");
    assert(typeof systemWithRef.system.health.runtime.rateLimitBlockedCount === "number", "rate limit blocked count missing");
    assert(Array.isArray(systemWithRef.system.health.runtime.recentRateLimits), "recent rate limit list missing");

    await request(`/api/admin/inquiries/${smokeInquiry.id}/triage`, {
      method: "POST",
      adminPin: "admin",
      body: { betaFeedbackType: "UI改善", betaFeedbackPriority: "高", betaFeedbackNote: "Smoke triage" }
    });
    const triagedStats = await request("/api/admin/stats", { adminPin: "admin" });
    assert(triagedStats.stats.highPriorityOpenBetaFeedback >= 1, "admin high priority open beta feedback stats failed");
    const openBetaBacklog = await request("/api/admin/beta-backlog", { adminPin: "admin" });
    assert(openBetaBacklog.backlog.total >= 1 && openBetaBacklog.backlog.open >= 1, "beta backlog open totals failed");
    assert(typeof openBetaBacklog.backlog.resolved === "number", "beta backlog resolved count failed");
    assert(typeof openBetaBacklog.backlog.highOpen === "number", "beta backlog high open count failed");
    assert(Array.isArray(openBetaBacklog.backlog.prioritySummary), "beta backlog priority summary failed");
    assert(openBetaBacklog.backlog.fixCandidates.some(item => item.priority === "高" && item.type === "UI改善"), "beta backlog fix candidates failed");
    await request(`/api/admin/inquiries/${smokeInquiry.id}/resolve`, {
      method: "POST",
      adminPin: "admin",
      body: {}
    });
    const resolvedInquiries = await request("/api/admin/inquiries", { adminPin: "admin" });
    assert(resolvedInquiries.inquiries.some(entry => entry.id === smokeInquiry.id && entry.status === "resolved"), "inquiry resolve failed");
    assert(resolvedInquiries.inquiries.some(entry => entry.id === smokeInquiry.id && entry.betaFeedbackType === "UI改善" && entry.betaFeedbackPriority === "高"), "beta feedback triage failed");
    assert(resolvedInquiries.inquiries.some(entry => entry.id === smokeInquiry.id && entry.resolvedAt), "resolved beta feedback timestamp missing");
    const statsWithPrioritizedBetaFeedback = await request("/api/admin/stats", { adminPin: "admin" });
    assert(statsWithPrioritizedBetaFeedback.stats.highPriorityBetaFeedback >= 1, "admin high priority beta feedback stats failed");
    const betaBacklog = await request("/api/admin/beta-backlog", { adminPin: "admin" });
    assert(betaBacklog.backlog.total >= 1, "beta backlog total failed");
    assert(betaBacklog.backlog.resolved >= 1, "beta backlog resolved total failed");
    assert(betaBacklog.backlog.groups.some(group => group.type === "UI改善" && group.count >= 1 && group.latest.some(item => item.priority === "高")), "beta backlog grouped triage failed");

    const announcement = await request("/api/admin/announcements", {
      method: "POST",
      adminPin: "admin",
      body: { title: "Smoke announcement", body: "Smoke public notice", tone: "warning" }
    });
    assert(announcement.announcement.title === "Smoke announcement", "announcement create failed");

    const stateWithAnnouncement = await request("/api/state");
    assert(stateWithAnnouncement.announcements.some(entry => entry.title === "Smoke announcement"), "public announcement missing");

    const hiddenAnnouncement = await request(`/api/admin/announcements/${announcement.announcement.id}`, {
      method: "PATCH",
      adminPin: "admin",
      body: { isActive: false }
    });
    assert(hiddenAnnouncement.announcement.isActive === false, "announcement hide failed");

    const stateWithoutAnnouncement = await request("/api/state");
    assert(!stateWithoutAnnouncement.announcements.some(entry => entry.title === "Smoke announcement"), "hidden announcement still public");

    await request(`/api/admin/announcements/${announcement.announcement.id}`, { method: "DELETE", adminPin: "admin" });
    const announcements = await request("/api/admin/announcements", { adminPin: "admin" });
    assert(!announcements.announcements.some(entry => entry.id === announcement.announcement.id), "announcement delete failed");

    const adSlots = await request("/api/admin/ad-slots", { adminPin: "admin" });
    assert(adSlots.adSlots.length >= 1, "ad slots missing");
    assert(adSlots.adSlots.some(slot => slot.isPlaceholder), "placeholder ad detection failed");
    const firstSlot = adSlots.adSlots[0];
    const editedSlot = await request(`/api/admin/ad-slots/${firstSlot.slotKey}`, {
      method: "PATCH",
      adminPin: "admin",
      body: { label: "Smoke ad", targetUrl: "https://partner.1code.test/smoke", html: "<script>alert(1)</script><a href=\"javascript:alert(1)\" onclick=\"alert(1)\">Smoke PR</a>" }
    });
    assert(editedSlot.adSlot.label === "Smoke ad", "ad slot edit failed");
    assert(editedSlot.adSlot.targetUrl === "https://partner.1code.test/smoke", "valid ad target was not preserved");
    assert(!editedSlot.adSlot.html.includes("<script"), "ad script was not sanitized");
    assert(!editedSlot.adSlot.html.includes("javascript:"), "ad javascript url was not sanitized");
    assert(!editedSlot.adSlot.html.includes("onclick"), "ad event handler was not sanitized");
    assert(editedSlot.adSlot.html.includes("noopener noreferrer"), "ad html link rel was not enforced");
    const invalidTargetSlot = await request(`/api/admin/ad-slots/${firstSlot.slotKey}`, {
      method: "PATCH",
      adminPin: "admin",
      body: { targetUrl: "http://localhost/ad" }
    });
    assert(invalidTargetSlot.adSlot.targetUrl === "", "local ad target was not rejected");
    const updatedAdSlots = await request("/api/admin/ad-slots", { adminPin: "admin" });
    assert(updatedAdSlots.adSlots.some(slot => slot.slotKey === firstSlot.slotKey && slot.isPlaceholder === false), "edited ad placeholder flag failed");

    const preBanOwnedRecruitment = await request("/api/recruitments", {
      method: "POST",
      accountId: "blocked-user",
      displayName: "BlockedUser",
      body: { title: "Pre-ban owned recruitment", game: "Apex", platform: "PC", voice: "なし", body: "Created before suspension" }
    });

    const banned = await request("/api/admin/bans", {
      method: "POST",
      adminPin: "admin",
      body: { accountId: "blocked-user", displayName: "BlockedUser", reason: "Smoke ban", durationDays: 7, note: "Smoke internal note" }
    });
    assert(banned.bannedAccount.accountId === "blocked-user", "ban create failed");
    assert(banned.bannedAccount.expiresAt > Date.now(), "ban expiry missing");
    assert(banned.bannedAccount.note === "Smoke internal note", "ban note missing");

    const bans = await request("/api/admin/bans", { adminPin: "admin" });
    assert(bans.bannedAccounts.some(entry => entry.accountId === "blocked-user" && entry.note === "Smoke internal note"), "ban list failed");
    const bannedMe = await request("/api/me", { accountId: "blocked-user", displayName: "BlockedUser" });
    assert(bannedMe.suspension?.active === true && bannedMe.suspension.reason === "Smoke ban", "banned account suspension status missing");

    const auditAfterBan = await request("/api/admin/audit-logs", { adminPin: "admin" });
    assert(auditAfterBan.auditLogs.some(entry => entry.action === "ban_account"), "ban audit log missing");
    assert(auditAfterBan.auditLogs.some(entry => entry.action === "reject_report"), "reject report audit log missing");
    assert(auditAfterBan.auditLogs.some(entry => entry.action === "update_ad_slot"), "ad audit log missing");
    assert(auditAfterBan.auditLogs.some(entry => entry.action === "resolve_inquiry"), "inquiry audit log missing");
    assert(auditAfterBan.auditLogs.some(entry => entry.action === "delete_announcement"), "announcement audit log missing");

    let blocked = false;
    try {
      await request("/api/threads", {
        method: "POST",
        accountId: "blocked-user",
        displayName: "BlockedUser",
        body: { title: "Blocked thread", category: "雑談", body: "Should fail" }
      });
    } catch (error) {
      blocked = error.message.includes("403");
    }
    assert(blocked, "banned account was not blocked");

    let bannedLikeBlocked = false;
    try {
      await request(`/api/recruitments/${recruitment.id}/like`, {
        method: "POST",
        accountId: "blocked-user",
        displayName: "BlockedUser"
      });
    } catch (error) {
      bannedLikeBlocked = error.message.includes("403");
    }
    assert(bannedLikeBlocked, "banned account like was not blocked");

    let bannedStatusBlocked = false;
    try {
      await request(`/api/recruitments/${preBanOwnedRecruitment.id}/status`, {
        method: "PATCH",
        accountId: "blocked-user",
        displayName: "BlockedUser",
        body: { status: "closed" }
      });
    } catch (error) {
      bannedStatusBlocked = error.message.includes("403");
    }
    assert(bannedStatusBlocked, "banned account status update was not blocked");

    let bannedDeleteBlocked = false;
    try {
      await request(`/api/recruitments/${preBanOwnedRecruitment.id}`, {
        method: "DELETE",
        accountId: "blocked-user",
        displayName: "BlockedUser",
        body: { reason: "Blocked user delete attempt" }
      });
    } catch (error) {
      bannedDeleteBlocked = error.message.includes("403");
    }
    assert(bannedDeleteBlocked, "banned account delete was not blocked");

    await request("/api/admin/bans", {
      method: "POST",
      adminPin: "admin",
      body: { accountId: "expired-ban-user", displayName: "ExpiredBan", reason: "Expired", expiresAt: Date.now() - 1000 }
    });
    const expiredPost = await request("/api/threads", {
      method: "POST",
      accountId: "expired-ban-user",
      displayName: "ExpiredBan",
      body: { title: "Expired ban can post", category: "雑談", body: "Expired ban should not block" }
    });
    assert(expiredPost.title === "Expired ban can post", "expired ban should not block posting");

    await request("/api/admin/bans/blocked-user", { method: "DELETE", adminPin: "admin" });
    const unbanned = await request("/api/admin/bans", { adminPin: "admin" });
    assert(!unbanned.bannedAccounts.some(entry => entry.accountId === "blocked-user"), "ban delete failed");

    const auditAfterUnban = await request("/api/admin/audit-logs", { adminPin: "admin" });
    assert(auditAfterUnban.auditLogs.some(entry => entry.action === "unban_account"), "unban audit log missing");

    const backupStatusBefore = await request("/api/admin/backup-status", { adminPin: "admin" });
    assert(["missing", "stale", "fresh"].includes(backupStatusBefore.backup.status), "backup status failed");
    assert(backupStatusBefore.backup.summaryText.includes("Red Thread バックアップ確認メモ"), "backup status summary text missing");

    const backup = await request("/api/admin/export", { adminPin: "admin" });
    assert(backup.format === "partyfinder-backup-v1", "backup format failed");
    assert(/^sha256:[0-9a-f]{64}$/.test(backup.checksum), "backup checksum missing");
    assert(Array.isArray(backup.data.recruitments), "backup recruitments missing");
    assert(Array.isArray(backup.data.threads), "backup threads missing");

    const backupStatusAfter = await request("/api/admin/backup-status", { adminPin: "admin" });
    assert(backupStatusAfter.backup.status === "fresh", "backup status after export failed");
    assert(backupStatusAfter.backup.latest.checksumPrefix === backup.checksum.replace(/^sha256:/, "").slice(0, 12), "backup status checksum prefix failed");

    const auditAfterExport = await request("/api/admin/audit-logs", { adminPin: "admin" });
    assert(auditAfterExport.auditLogs.some(entry => entry.action === "export_backup"), "backup audit log missing");

    console.log("Smoke test passed");
  } finally {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
