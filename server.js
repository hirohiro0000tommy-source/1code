const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createStore } = require("./storage");

const root = __dirname;
const publicDir = path.join(root, "public");
const packageInfo = require("./package.json");
const port = Number(process.env.PORT || 8787);
const adminPin = process.env.ADMIN_PIN || "admin";
const sessionSecret = process.env.SESSION_SECRET || "local-session-secret";
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const publicSecurityContact = cleanEnv(process.env.PUBLIC_SECURITY_CONTACT || "mailto:security@example.com");
const releaseVersion = cleanEnv(process.env.RELEASE_VERSION || packageInfo.version);
const commitSha = cleanEnv(process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || "");
const betaAccessCode = cleanEnv(process.env.BETA_ACCESS_CODE || "");
const betaWritePaused = envFlag(process.env.BETA_WRITE_PAUSED);
const publicWritePaused = envFlag(process.env.PUBLIC_WRITE_PAUSED);
const writePaused = betaWritePaused || publicWritePaused;
const discordLoginEnabled = process.env.DISCORD_LOGIN_ENABLED ? envFlag(process.env.DISCORD_LOGIN_ENABLED) : true;
const adminAccountIds = new Set(String(process.env.ADMIN_ACCOUNT_IDS || "").split(",").map(value => value.trim()).filter(Boolean));
const moderatorAccountIds = new Set(String(process.env.MODERATOR_ACCOUNT_IDS || "").split(",").map(value => value.trim()).filter(Boolean));
const rateWindowMs = 60 * 1000;
const duplicateWindowMs = 10 * 60 * 1000;
const rateBuckets = new Map();
const startedAt = Date.now();
const runtimeMetrics = {
  requestCount: 0,
  responseCount: 0,
  errorCount: 0,
  statusCounts: {},
  methodCounts: {},
  pathCounts: {},
  refCounts: {},
  recentRequests: [],
  recentErrors: [],
  recentRateLimits: [],
  rateLimitBlockedCount: 0,
  readCount: 0,
  writeCount: 0,
  lastReadAt: null,
  lastWriteAt: null,
  lastErrorAt: null,
  lastError: ""
};
const talkCategories = ["雑談", "大会観戦", "攻略相談"];
const inquiryCategories = ["不具合", "要望", "βフィードバック", "削除依頼", "広告", "その他"];
const betaFeedbackTypes = ["不具合", "UI改善", "要望", "保留", "対応不要"];
const betaFeedbackPriorities = ["高", "中", "低"];
const retentionPolicy = {
  auditLogs: 500,
  deletedItems: 500,
  moderationEvents: 500,
  recentRequests: 30,
  recentErrors: 20,
  recentRateLimits: 20,
  adminListLimit: 100
};
const legacyOfficialBotAuthor = "Red Thread運営";
const officialBots = [
  {
    id: "scout",
    accountId: "bot:scout",
    author: "スカウト",
    role: "募集案内",
    profile: {
      displayName: "スカウト",
      discordHandle: "",
      games: "Apex, VALORANT, Monster Hunter",
      playTime: "",
      style: "エンジョイ",
      bio: "募集の書き方や、最初に声をかけやすい募集例を置く公式ボットです。"
    }
  },
  {
    id: "lobby",
    accountId: "bot:lobby",
    author: "ロビー",
    role: "フリートーク案内",
    profile: {
      displayName: "ロビー",
      discordHandle: "",
      games: "大会観戦, 雑談",
      playTime: "",
      style: "まったり",
      bio: "雑談や大会観戦の話題を置く公式ボットです。"
    }
  },
  {
    id: "coach",
    accountId: "bot:coach",
    author: "コーチ",
    role: "攻略相談案内",
    profile: {
      displayName: "コーチ",
      discordHandle: "",
      games: "Shadowverse/Worlds Beyond, STREET FIGHTER 6, Splatoon",
      playTime: "",
      style: "初心者",
      bio: "初心者が聞きやすい攻略相談のきっかけを置く公式ボットです。"
    }
  }
];
const officialBot = officialBots[0];

function cleanEnv(value) {
  return String(value || "").trim();
}

function envFlag(value) {
  return ["1", "true", "yes", "on"].includes(cleanEnv(value).toLowerCase());
}

function publicBaseUrlState(value = publicBaseUrl) {
  try {
    const parsed = new URL(value);
    const hasPath = parsed.pathname && parsed.pathname !== "/";
    const hasSearchOrHash = Boolean(parsed.search || parsed.hash);
    const isLocal = /localhost|127\.0\.0\.1/i.test(parsed.hostname);
    return {
      ok: parsed.protocol === "https:" && !isLocal && !hasPath && !hasSearchOrHash,
      isLocal,
      hasPath,
      hasSearchOrHash,
      origin: parsed.origin,
      detail: hasPath || hasSearchOrHash ? "origin only required" : parsed.origin
    };
  } catch (error) {
    return { ok: false, isLocal: false, hasPath: false, hasSearchOrHash: false, origin: "", detail: "invalid url" };
  }
}

function publicSecurityContactState(value = publicSecurityContact) {
  const contact = cleanEnv(value);
  let ok = false;
  if (/^mailto:/i.test(contact)) {
    const address = contact.replace(/^mailto:/i, "");
    ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address);
  } else if (/^https:\/\//i.test(contact)) {
    try {
      const parsed = new URL(contact);
      ok = !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
    } catch (error) {
      ok = false;
    }
  }
  return {
    ok: ok && !/example\.(com|org|net)/i.test(contact),
    detail: contact ? contact.replace(/(.{24}).+/, "$1...") : "missing"
  };
}

function discordConfigState(clientId = process.env.DISCORD_CLIENT_ID || "", clientSecret = process.env.DISCORD_CLIENT_SECRET || "") {
  const id = cleanEnv(clientId);
  const secret = cleanEnv(clientSecret);
  const placeholderId = /^(your-discord-client-id|smoke-client-id|discord-client-id|\.\.\.)$/i.test(id);
  const placeholderSecret = /^(your-discord-client-secret|smoke-client-secret|discord-client-secret|\.\.\.)$/i.test(secret);
  const idOk = /^\d{16,22}$/.test(id) && !placeholderId;
  const secretOk = secret.length >= 16 && !placeholderSecret;
  return {
    ok: idOk && secretOk,
    detail: idOk && secretOk ? "設定済み" : !id || !secret ? "未設定" : "仮値または不正な形式"
  };
}

function staffAccountIdsState(value, required = false) {
  const ids = String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  const placeholder = ids.find(id => /replace|your-|trusted-|smoke-|\.\.\./i.test(id));
  const invalid = ids.find(id => !/^discord:\d{16,22}$/.test(id));
  return {
    ok: (!required || ids.length > 0) && !placeholder && !invalid,
    count: ids.length,
    detail: !ids.length ? "未設定" : placeholder || invalid ? "仮値または不正な形式" : `${ids.length}件`
  };
}

function databaseUrlState(value = process.env.DATABASE_URL || "") {
  const text = cleanEnv(value);
  if (!text) return { ok: false, detail: "missing" };
  try {
    const parsed = new URL(text);
    const protocolOk = ["postgres:", "postgresql:"].includes(parsed.protocol);
    const hostOk = Boolean(parsed.hostname) && !/example\.(com|org|net)$/i.test(parsed.hostname);
    const dbOk = parsed.pathname && parsed.pathname !== "/";
    const placeholderCredentials = ["user", "username"].includes(decodeURIComponent(parsed.username || "").toLowerCase())
      || ["password", "pass"].includes(decodeURIComponent(parsed.password || "").toLowerCase());
    return {
      ok: protocolOk && hostOk && dbOk && !placeholderCredentials,
      detail: protocolOk && hostOk && dbOk && !placeholderCredentials
        ? `${parsed.protocol.replace(":", "")}://${parsed.hostname}${parsed.pathname}`
        : "invalid or placeholder postgres url"
    };
  } catch (error) {
    return { ok: false, detail: "invalid url" };
  }
}

function deploymentInfo() {
  return {
    version: packageInfo.version,
    release: releaseVersion,
    commit: commitSha ? commitSha.slice(0, 12) : "",
    startedAt
  };
}

function normalizeTalkCategory(value) {
  if (value === "大会") return "大会観戦";
  if (value === "攻略") return "攻略相談";
  return talkCategories.includes(value) ? value : "雑談";
}

function normalizePlayStyle(value) {
  if (value === "ガチ" || value === "勝ち重視") return "ガチ";
  if (value === "初心者" || value === "初心者歓迎") return "初心者";
  if (value === "まったり" || value === "楽しく") return "まったり";
  if (value === "エンジョイ" || value === "練習したい" || value === "固定メンバー募集") return "エンジョイ";
  return "エンジョイ";
}

function normalizeProfileStyle(value) {
  return ["未設定", "初心者", "まったり", "エンジョイ", "ガチ"].includes(value) ? value : "未設定";
}

function validateRuntimeConfig() {
  const production = process.env.NODE_ENV === "production";
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const publicUrl = publicBaseUrlState();
  const securityContact = publicSecurityContactState();
  const databaseUrl = databaseUrlState();
  const discord = discordConfigState();
  const adminAccounts = staffAccountIdsState(process.env.ADMIN_ACCOUNT_IDS, true);
  const moderatorAccounts = staffAccountIdsState(process.env.MODERATOR_ACCOUNT_IDS, false);
  if (!["json", "postgres"].includes(storageDriver)) {
    throw new Error(`Unknown STORAGE_DRIVER: ${storageDriver}`);
  }
  if (production && (adminPin === "admin" || adminPin === "change-this-before-public-release")) {
    throw new Error("ADMIN_PIN must be changed before production launch.");
  }
  if (production && adminPin.length < 16) {
    throw new Error("ADMIN_PIN must be at least 16 characters before production launch.");
  }
  if (production && (!process.env.SESSION_SECRET || sessionSecret === "local-session-secret")) {
    throw new Error("SESSION_SECRET must be changed before production launch.");
  }
  if (production && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters before production launch.");
  }
  if (production && storageDriver !== "postgres") {
    throw new Error("Production launch requires STORAGE_DRIVER=postgres.");
  }
  if (storageDriver === "postgres" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when STORAGE_DRIVER=postgres.");
  }
  if (production && storageDriver === "postgres" && !databaseUrl.ok) {
    throw new Error("DATABASE_URL must be a real production Postgres URL before production launch.");
  }
  if (production && storageDriver === "postgres" && process.env.DATABASE_SSL !== "true") {
    throw new Error("DATABASE_SSL=true is required for production Postgres before production launch.");
  }
  if (production && !publicUrl.ok) {
    throw new Error("PUBLIC_BASE_URL must be a public https origin before production launch.");
  }
  if (production && !securityContact.ok) {
    throw new Error("PUBLIC_SECURITY_CONTACT must be a real public mailto: or https:// contact before production launch.");
  }
  if (production && discordLoginEnabled && !discord.ok) {
    throw new Error("Real Discord OAuth credentials are required before production launch.");
  }
  if (production && discordLoginEnabled && !adminAccounts.ok) {
    throw new Error("ADMIN_ACCOUNT_IDS must include at least one real Discord account ID before production launch.");
  }
  if (production && !moderatorAccounts.ok) {
    throw new Error("MODERATOR_ACCOUNT_IDS must contain only real Discord account IDs before production launch.");
  }
}

const initialData = {
  recruitments: [
    {
      id: crypto.randomUUID(),
      title: "Shadowverse/Worlds Beyond ルームマッチとデッキ相談",
      author: "RuneCraft",
      game: "Shadowverse/Worlds Beyond",
      platform: "モバイル",
      voice: "なし",
      rank: "初心者歓迎",
      time: "夜なら相談",
      style: "エンジョイ",
      body: "ローテ中心で遊べる人を募集します。勝ち負けより、デッキを試したり感想を話したりしたいです。",
      createdAt: Date.now() - 1000 * 60 * 42,
      likes: ["seed-a", "seed-b", "seed-c"],
      replies: [{ id: crypto.randomUUID(), author: "Returner", accountId: "seed-r", body: "復帰勢でもよければ参加したいです。", createdAt: Date.now() - 1000 * 60 * 30 }]
    },
    {
      id: crypto.randomUUID(),
      title: "Apex ランクをまったり一緒に回せる人",
      author: "NeonSamurai",
      game: "Apex",
      platform: "クロスプレイ",
      voice: "どちらでも",
      rank: "ゴールド",
      time: "平日22時以降",
      style: "エンジョイ",
      body: "暴言なしで雰囲気よく遊べる方を募集します。",
      createdAt: Date.now() - 1000 * 60 * 18,
      likes: ["seed-d", "seed-e"],
      replies: [{ id: crypto.randomUUID(), author: "WraithMain", accountId: "seed-w", body: "今日いけます。", createdAt: Date.now() - 1000 * 60 * 12 }]
    }
  ],
  threads: [
    {
      id: crypto.randomUUID(),
      title: "最近遊んで面白かったゲーム",
      category: "雑談",
      author: "LobbyHost",
      body: "次に遊ぶゲーム探しの参考にしたいです。",
      createdAt: Date.now() - 1000 * 60 * 34,
      likes: ["seed-f", "seed-g"],
      replies: [{ id: crypto.randomUUID(), author: "CardFan", accountId: "seed-cf", body: "Balatroが楽しかったです。", createdAt: Date.now() - 1000 * 60 * 20 }]
    },
    {
      id: crypto.randomUUID(),
      title: "大会観戦スレ",
      category: "大会観戦",
      author: "Watcher",
      body: "注目カードや感想をどうぞ。",
      createdAt: Date.now() - 1000 * 60 * 90,
      likes: ["seed-h"],
      replies: []
    },
    {
      id: crypto.randomUUID(),
      title: "初心者向けデッキ相談",
      category: "攻略相談",
      author: "DeckHelper",
      body: "扱いやすい構築や立ち回りを相談するスレッドです。",
      createdAt: Date.now() - 1000 * 60 * 140,
      likes: ["seed-i", "seed-j"],
      replies: [{ id: crypto.randomUUID(), author: "Helper", accountId: "seed-hp", body: "まずはよく使うリーダーを書いてみてください。", createdAt: Date.now() - 1000 * 60 * 110 }]
    }
  ],
  reports: [],
  inquiries: [],
  messages: [],
  announcements: [
    {
      id: crypto.randomUUID(),
      title: "Red Threadへようこそ",
      body: "ゲーム仲間募集と雑談を安心して使えるよう、現在も機能を整備しています。",
      tone: "info",
      isActive: true,
      createdAt: Date.now()
    }
  ],
  bannedAccounts: [],
  moderationEvents: [],
  deletedItems: [],
  auditLogs: [],
  adSlots: [
    { id: crypto.randomUUID(), slotKey: "left-rail", label: "左広告", placement: "left_rail", isActive: true },
    { id: crypto.randomUUID(), slotKey: "right-rail", label: "右広告", placement: "right_rail", isActive: true },
    { id: crypto.randomUUID(), slotKey: "feed-inline", label: "一覧内広告", placement: "feed_inline", isActive: true }
  ]
};

if (process.env.NODE_ENV === "production" && !envFlag(process.env.ENABLE_SEED_DATA)) {
  initialData.recruitments = [];
  initialData.threads = [];
  initialData.announcements = [
    {
      id: crypto.randomUUID(),
      title: "Red Threadへようこそ",
      body: "ゲーム仲間募集とフリートークを、気軽に投稿できます。はじめは少人数で、安心して使える場所として運用しています。",
      tone: "info",
      isActive: true,
      createdAt: Date.now()
    }
  ];
}

const store = createStore({ root, initialData });

async function readDb() {
  const db = await store.read();
  runtimeMetrics.readCount += 1;
  runtimeMetrics.lastReadAt = Date.now();
  db.recruitments = Array.isArray(db.recruitments) ? db.recruitments : [];
  db.threads = Array.isArray(db.threads) ? db.threads : [];
  db.reports = Array.isArray(db.reports) ? db.reports : [];
  db.inquiries = Array.isArray(db.inquiries) ? db.inquiries : [];
  db.messages = Array.isArray(db.messages) ? db.messages : [];
  db.announcements = Array.isArray(db.announcements) ? db.announcements : [];
  db.bannedAccounts = Array.isArray(db.bannedAccounts) ? db.bannedAccounts : [];
  db.moderationEvents = Array.isArray(db.moderationEvents) ? db.moderationEvents : [];
  db.deletedItems = Array.isArray(db.deletedItems) ? db.deletedItems : [];
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  db.adSlots = Array.isArray(db.adSlots) ? db.adSlots : [];
  for (const slot of initialData.adSlots) {
    if (!db.adSlots.some(existing => existing.slotKey === slot.slotKey)) {
      db.adSlots.push(slot);
    }
  }
  db.recruitments.forEach(item => {
    item.likes = Array.isArray(item.likes) ? item.likes : [];
    item.replies = Array.isArray(item.replies) ? item.replies : [];
    item.participants = Array.isArray(item.participants) ? item.participants : [];
    item.ownerAccountId = item.ownerAccountId || "";
    item.status = ["open", "closed"].includes(item.status) ? item.status : "open";
    item.capacity = Math.max(1, Math.min(99, Number(item.capacity || 4)));
    item.style = normalizePlayStyle(item.style);
  });
  db.threads.forEach(item => {
    item.likes = Array.isArray(item.likes) ? item.likes : [];
    item.replies = Array.isArray(item.replies) ? item.replies : [];
    item.ownerAccountId = item.ownerAccountId || "";
    item.category = normalizeTalkCategory(item.category);
  });
  db.inquiries.forEach(inquiry => {
    inquiry.category = inquiryCategories.includes(inquiry.category) ? inquiry.category : "その他";
    inquiry.status = inquiry.status === "resolved" ? "resolved" : "open";
    inquiry.resolutionNote = cleanText(inquiry.resolutionNote, 500);
  });
  db.messages.forEach(item => {
    item.recruitmentId = item.recruitmentId || "";
    item.conversationId = item.conversationId || messageConversationId(item.recruitmentId, item.fromAccountId, item.toAccountId);
    item.body = cleanText(item.body, 1000);
    item.status = item.status === "hidden" ? "hidden" : "visible";
    item.createdAt = Number(item.createdAt || Date.now());
  });
  return db;
}

async function writeDb(db) {
  await store.write(db);
  runtimeMetrics.writeCount += 1;
  runtimeMetrics.lastWriteAt = Date.now();
}

function bumpMetric(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function pushRecent(list, item, limit = 30) {
  list.unshift(item);
  if (list.length > limit) list.length = limit;
}

function shortFingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 10);
}

function recordRequest(req, url) {
  runtimeMetrics.requestCount += 1;
  bumpMetric(runtimeMetrics.methodCounts, req.method || "UNKNOWN");
  bumpMetric(runtimeMetrics.pathCounts, url.pathname || "/");
  const ref = cleanText(url.searchParams.get("ref"), 80);
  if (ref) bumpMetric(runtimeMetrics.refCounts, ref);
}

function recordResponse(status, meta = {}) {
  runtimeMetrics.responseCount += 1;
  bumpMetric(runtimeMetrics.statusCounts, String(status));
  if (status >= 500) runtimeMetrics.errorCount += 1;
  if (meta.pathname) {
    const entry = {
      requestId: meta.requestId || "",
      method: meta.method || "",
      path: meta.pathname,
      status,
      durationMs: meta.startedAt ? Date.now() - meta.startedAt : null,
      at: Date.now()
    };
    pushRecent(runtimeMetrics.recentRequests, entry, retentionPolicy.recentRequests);
    if (status >= 500) pushRecent(runtimeMetrics.recentErrors, { ...entry, error: meta.error || runtimeMetrics.lastError || "" }, retentionPolicy.recentErrors);
  }
}

function requestHeaders(res) {
  return res.locals?.requestId ? { "x-request-id": res.locals.requestId } : {};
}

function sendJsonWithHeaders(res, status, data, headers = {}) {
  recordResponse(status, res.locals || {});
  res.writeHead(status, securityHeaders("application/json; charset=utf-8", {
    "cache-control": "no-store",
    ...requestHeaders(res),
    ...headers
  }));
  if (res.locals?.method === "HEAD") {
    res.end();
    return;
  }
  res.end(JSON.stringify(data));
}

function sendJson(res, status, data) {
  sendJsonWithHeaders(res, status, data);
}

function sendText(res, status, text) {
  recordResponse(status, res.locals || {});
  res.writeHead(status, securityHeaders("text/plain; charset=utf-8", requestHeaders(res)));
  if (res.locals?.method === "HEAD") {
    res.end();
    return;
  }
  res.end(text);
}

function sendHtml(res, status, html, headers = {}) {
  recordResponse(status, res.locals || {});
  res.writeHead(status, securityHeaders("text/html; charset=utf-8", {
    "cache-control": "no-cache",
    ...requestHeaders(res),
    ...headers
  }));
  if (res.locals?.method === "HEAD") {
    res.end();
    return;
  }
  res.end(html);
}

function redirect(res, location, headers = {}) {
  recordResponse(302, res.locals || {});
  res.writeHead(302, { location, ...requestHeaders(res), ...headers });
  res.end();
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").filter(Boolean).map(part => {
    const index = part.indexOf("=");
    if (index < 0) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionCookie(account) {
  const payload = base64url(JSON.stringify({
    id: account.id,
    name: account.name,
    discord: account.discord || "",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  }));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `pf_session=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `pf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function sessionAccount(req) {
  const raw = parseCookies(req).pf_session;
  if (!raw || !raw.includes(".")) return null;
  const [payload, signature] = raw.split(".");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(sign(payload))) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  try {
    const account = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!account.exp || account.exp < Date.now()) return null;
    return account;
  } catch (error) {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 1_000_000) {
        tooLarge = true;
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function cleanText(value, max = 280) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeAuthorProfile(profile = {}, fallbackName = "") {
  return {
    displayName: cleanText(profile.displayName || fallbackName, 40),
    discordHandle: cleanText(profile.discordHandle, 40),
    games: cleanText(profile.games, 120),
    playTime: cleanText(profile.playTime, 50),
    style: normalizeProfileStyle(cleanText(profile.style, 40)),
    bio: cleanText(profile.bio, 240)
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 140) {
  const text = stripTags(value);
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function textFingerprint(...values) {
  const normalized = values
    .map(value => String(value || "").toLowerCase())
    .join(" ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, "")
    .trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function linkCount(value) {
  return (String(value || "").match(/https?:\/\//gi) || []).length;
}

function contentViolation(...values) {
  const text = values.join("\n");
  if (linkCount(text) >= 3) return "too_many_links";
  if (/(.)\1{14,}/u.test(text)) return "repeated_characters";
  return "";
}

function absoluteUrl(pathname = "/") {
  return `${publicBaseUrl.replace(/\/$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function requestOrigin(req) {
  const origin = req.headers.origin || "";
  if (origin) return origin;
  const referer = req.headers.referer || "";
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch (error) {
    return "";
  }
}

function allowedRequestOrigins(req) {
  const host = req.headers.host ? `http://${req.headers.host}` : "";
  return new Set([
    publicBaseUrl.replace(/\/$/, ""),
    host,
    host.replace(/^http:/, "https:")
  ].filter(Boolean).map(value => {
    try {
      return new URL(value).origin;
    } catch (error) {
      return "";
    }
  }).filter(Boolean));
}

function verifyWriteOrigin(req, res) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = requestOrigin(req);
  if (!origin) return true;
  if (allowedRequestOrigins(req).has(origin)) return true;
  sendJson(res, 403, { error: "cross-site write request blocked" });
  return false;
}

function betaAccessGranted(req) {
  if (!betaAccessCode) return true;
  if (isStaff(req)) return true;
  return cleanText(req.headers["x-beta-code"], 120) === betaAccessCode;
}

function verifyBetaAccess(req, res, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  if (url.pathname.startsWith("/api/admin/")) return true;
  if (betaAccessGranted(req)) return true;
  sendJson(res, 403, { error: "beta access code required" });
  return false;
}

function isUserContributionWrite(req, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  if (url.pathname.startsWith("/api/admin/")) return false;
  if (url.pathname === "/api/reports" || url.pathname === "/api/inquiries") return false;
  if (url.pathname === "/auth/logout") return false;
  return [
    /^\/api\/recruitments$/,
    /^\/api\/threads$/,
    /^\/api\/messages$/,
    /^\/api\/(recruitments|threads)\/[^/]+\/reply$/,
    /^\/api\/(recruitments|threads)\/[^/]+\/like$/,
    /^\/api\/(recruitments|threads)\/[^/]+\/join$/,
    /^\/api\/(recruitments|threads)\/[^/]+\/status$/,
    /^\/api\/(recruitments|threads)\/[^/]+$/,
    /^\/api\/profiles$/
  ].some(pattern => pattern.test(url.pathname));
}

function verifyBetaWritePause(req, res, url) {
  if (!writePaused) return true;
  if (isStaff(req)) return true;
  if (!isUserContributionWrite(req, url)) return true;
  const publicPause = publicWritePaused && !betaWritePaused;
  sendJson(res, 503, {
    error: publicPause ? "public write paused" : "beta write paused",
    message: publicPause
      ? "現在、投稿受付を一時停止しています。閲覧、通報、お問い合わせは利用できます。"
      : "現在、β版の投稿受付を一時停止しています。閲覧、通報、お問い合わせは利用できます。"
  });
  return false;
}

function safeExternalUrl(value) {
  const text = cleanText(value, 400);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch (error) {
    return "";
  }
}

function sanitizeAdTargetUrl(value) {
  const text = cleanText(value, 400);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
    return parsed.protocol === "https:" && !isLocal ? parsed.toString() : "";
  } catch (error) {
    return "";
  }
}

function securityHeaders(contentType, extra = {}) {
  return {
    "content-type": contentType,
    ...(process.env.NODE_ENV === "production" ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "cross-origin-opener-policy": "same-origin",
    "origin-agent-cluster": "?1",
    ...(betaAccessCode && /^text\/html\b/.test(contentType) ? { "x-robots-tag": "noindex, nofollow, noarchive" } : {}),
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; "),
    ...extra
  };
}

function robotsText() {
  if (betaAccessCode) {
    return [
      "User-agent: *",
      "Disallow: /",
      "",
      "# Closed beta: indexing is disabled while BETA_ACCESS_CODE is set."
    ].join("\n");
  }
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`
  ].join("\n");
}

function securityTxt() {
  const base = publicBaseUrl.replace(/\/$/, "");
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return [
    `Contact: ${publicSecurityContact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: ja, en",
    `Canonical: ${base}/.well-known/security.txt`,
    `Policy: ${base}/privacy.html`,
    ""
  ].join("\n");
}

function sitemapXml(db) {
  const entries = [
    { loc: absoluteUrl("/"), lastmod: new Date().toISOString(), priority: "1.0", changefreq: "daily" }
  ];
  if (!betaAccessCode) {
    entries.push(
      { loc: absoluteUrl("/guidelines.html"), lastmod: new Date().toISOString(), priority: "0.7", changefreq: "monthly" },
      { loc: absoluteUrl("/terms.html"), lastmod: new Date().toISOString(), priority: "0.5", changefreq: "monthly" },
      { loc: absoluteUrl("/privacy.html"), lastmod: new Date().toISOString(), priority: "0.5", changefreq: "monthly" }
    );
    const posts = [
      ...(db.recruitments || []).map(item => ({ ...item, type: "recruitments" })),
      ...(db.threads || []).map(item => ({ ...item, type: "threads" }))
    ]
      .filter(item => item.id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 200);
    for (const item of posts) {
      const lastReplyAt = (item.replies || []).reduce((latest, reply) => Math.max(latest, Number(reply.createdAt || 0)), 0);
      const lastActivityAt = Math.max(Number(item.createdAt || Date.now()), lastReplyAt);
      entries.push({
        loc: absoluteUrl(`/share/${item.type}/${encodeURIComponent(item.id)}`),
        lastmod: new Date(lastActivityAt).toISOString(),
        priority: item.type === "recruitments" ? "0.8" : "0.7",
        changefreq: "weekly"
      });
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(entry => [
    "  <url>",
    `    <loc>${escapeHtml(entry.loc)}</loc>`,
    `    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>`,
    `    <changefreq>${escapeHtml(entry.changefreq)}</changefreq>`,
    `    <priority>${escapeHtml(entry.priority)}</priority>`,
    "  </url>"
  ].join("\n")).join("\n")}\n</urlset>\n`;
}

function feedXml(db) {
  const items = betaAccessCode ? [] : [
    ...(db.recruitments || []).map(item => ({ ...item, type: "recruitments", label: "募集", tag: item.game || "ゲーム募集" })),
    ...(db.threads || []).map(item => ({ ...item, type: "threads", label: "フリートーク", tag: item.category || "フリートーク" }))
  ]
    .filter(item => item.id)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 30);
  const latest = items[0]?.createdAt || Date.now();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Red Thread 新着投稿</title>\n    <link>${escapeHtml(absoluteUrl("/"))}</link>\n    <description>Red Threadのゲーム仲間募集とフリートークの新着投稿です。</description>\n    <language>ja</language>\n    <lastBuildDate>${escapeHtml(new Date(latest).toUTCString())}</lastBuildDate>\n${items.map(item => {
    const url = absoluteUrl(`/share/${item.type}/${encodeURIComponent(item.id)}`);
    return [
      "    <item>",
      `      <title>${escapeHtml(`[${item.label}] ${item.title || item.tag}`)}</title>`,
      `      <link>${escapeHtml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeHtml(url)}</guid>`,
      `      <pubDate>${escapeHtml(new Date(item.createdAt || Date.now()).toUTCString())}</pubDate>`,
      `      <category>${escapeHtml(item.tag || item.label)}</category>`,
      `      <description>${escapeHtml(truncate(item.body || item.title || "", 240))}</description>`,
      "    </item>"
    ].join("\n");
  }).join("\n")}\n  </channel>\n</rss>\n`;
}

function sanitizeAdHtml(value) {
  return String(value || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*(?:javascript|data|file|vbscript):[\s\S]*?\1/gi, "")
    .replace(/\starget\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\srel\s*=\s*(['"]).*?\1/gi, "")
    .replace(/<a\b/gi, '<a target="_blank" rel="sponsored noopener noreferrer"');
}

function publicAdSlot(slot) {
  return {
    ...slot,
    targetUrl: sanitizeAdTargetUrl(slot.targetUrl || ""),
    html: sanitizeAdHtml(slot.html || "")
  };
}

function publicItem(item, viewerId = "", viewerIsAdmin = false) {
  const canManage = viewerIsAdmin || !!item.ownerAccountId && item.ownerAccountId === viewerId;
  const isBotOwned = String(item.ownerAccountId || "").startsWith("bot:");
  const replies = Array.isArray(item.replies) ? item.replies : [];
  const lastReplyAt = replies.reduce((latest, reply) => Math.max(latest, Number(reply.createdAt || 0)), 0);
  return {
    ...item,
    likeCount: item.likes.length,
    lastActivityAt: Math.max(Number(item.createdAt || 0), lastReplyAt),
    lastReplyAt,
    isOfficial: isBotOwned,
    participantCount: Array.isArray(item.participants) ? item.participants.length : 0,
    viewerOwned: !!item.ownerAccountId && item.ownerAccountId === viewerId,
    canMessage: !!item.ownerAccountId && !isBotOwned && item.ownerAccountId !== viewerId,
    viewerJoined: Array.isArray(item.participants) ? item.participants.some(participant => participant.accountId === viewerId) : false,
    participants: Array.isArray(item.participants) ? item.participants.map(participant => ({
      name: participant.name,
      joinedAt: participant.joinedAt
    })) : undefined,
    viewerLiked: item.likes.includes(viewerId),
    viewerReplied: replies.some(reply => reply.accountId === viewerId),
    replies: replies.map(reply => ({
      id: reply.id,
      author: reply.author,
      body: reply.body,
      createdAt: reply.createdAt,
      viewerOwned: !!reply.accountId && reply.accountId === viewerId,
      canDelete: viewerIsAdmin || !!reply.accountId && reply.accountId === viewerId,
      accountId: reply.accountId
    })),
    canDelete: canManage,
    canManage,
    ownerAccountId: undefined,
    likes: undefined
  };
}

function messageConversationId(recruitmentId, firstAccountId, secondAccountId) {
  const pair = [firstAccountId || "", secondAccountId || ""].sort().join(":");
  return crypto.createHash("sha256").update(`${recruitmentId || "general"}:${pair}`).digest("hex").slice(0, 24);
}

function publicMessages(db, viewerId = "") {
  if (!viewerId) return [];
  const conversations = new Map();
  const recruitmentTitles = new Map(db.recruitments.map(item => [item.id, item.title]));
  const items = (db.messages || [])
    .filter(item => item.status !== "hidden")
    .filter(item => item.fromAccountId === viewerId || item.toAccountId === viewerId)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const item of items) {
    const conversationId = item.conversationId || messageConversationId(item.recruitmentId, item.fromAccountId, item.toAccountId);
    const otherName = item.fromAccountId === viewerId ? item.toName : item.fromName;
    const otherAccountId = item.fromAccountId === viewerId ? item.toAccountId : item.fromAccountId;
    const conversation = conversations.get(conversationId) || {
      conversationId,
      recruitmentId: item.recruitmentId || "",
      recruitmentTitle: item.recruitmentTitle || recruitmentTitles.get(item.recruitmentId) || "募集",
      otherName: otherName || "Player",
      otherAccountId,
      lastMessageAt: item.createdAt,
      messages: []
    };
    conversation.lastMessageAt = Math.max(conversation.lastMessageAt, item.createdAt);
    conversation.messages.push({
      id: item.id,
      body: item.body,
      createdAt: item.createdAt,
      author: item.fromName || "Player",
      viewerOwned: item.fromAccountId === viewerId
    });
    conversations.set(conversationId, conversation);
  }
  return [...conversations.values()]
    .map(conversation => ({
      ...conversation,
      messages: conversation.messages.slice(-20)
    }))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

function publicServiceStatus() {
  return {
    mode: writePaused ? "paused" : betaAccessCode ? "beta" : "open",
    label: writePaused ? "投稿一時停止中" : betaAccessCode ? "β版運用中" : "通常運用中",
    message: writePaused
      ? "現在、投稿・返信・いいね・DMを一時停止しています。閲覧、通報、お問い合わせは利用できます。"
      : betaAccessCode
        ? "現在はβ版として運用しています。投稿には参加コードが必要です。"
        : "募集、フリートーク、返信、いいねを利用できます。",
    betaAccessRequired: Boolean(betaAccessCode),
    betaWritePaused,
    publicWritePaused,
    generatedAt: Date.now()
  };
}

function statusHtml(db) {
  const health = healthSnapshot(db);
  const status = publicServiceStatus();
  const deployment = deploymentInfo();
  const updatedAt = new Date(status.generatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const started = new Date(deployment.startedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const modeLabel = status.mode === "paused" ? "投稿停止" : status.mode === "beta" ? "β版" : "公開中";
  const checks = health.checks.map(check => `
        <li>
          <strong>${escapeHtml(check.label)}</strong>
          <span class="badge ${check.ok ? "" : "danger"}">${check.ok ? "OK" : "要確認"}</span>
          <span>${escapeHtml(check.detail || "")}</span>
        </li>`).join("");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>サービス状況 | Red Thread</title>
  <meta name="description" content="Red Threadのサービス状況、投稿受付、β運用状態を確認できます。">
  <meta name="robots" content="${betaAccessCode ? "noindex,nofollow,noarchive" : "noindex,follow"}">
  <link rel="canonical" href="${escapeHtml(absoluteUrl("/status"))}">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="share-page">
    <article class="card shared-focus">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(modeLabel)}</span>
            <span class="badge ${health.ready ? "" : "danger"}">${health.ready ? "稼働中" : "確認中"}</span>
          </div>
          <h1>Red Thread サービス状況</h1>
        </div>
      </div>
      <div class="message">
        <p><strong>${escapeHtml(status.label)}</strong></p>
        <p>${escapeHtml(status.message)}</p>
      </div>
      <div class="details">
        <span>更新: ${escapeHtml(updatedAt)}</span>
        <span>モード: ${escapeHtml(status.mode)}</span>
        <span>リリース: ${escapeHtml(deployment.release || deployment.version)}</span>
        <span>起動: ${escapeHtml(started)}</span>
      </div>
      <ul class="status-list">
        ${checks}
      </ul>
      <div class="actions">
        <a class="btn dark" href="/">Red Threadを開く</a>
        <a class="btn ghost" href="/status.json">JSONで確認</a>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function publicDb(db, viewerId = "", viewerIsAdmin = false) {
  return {
    recruitments: db.recruitments.map(item => publicItem(item, viewerId, viewerIsAdmin)),
    threads: db.threads.map(item => publicItem(item, viewerId, viewerIsAdmin)),
    messages: publicMessages(db, viewerId),
    announcements: (db.announcements || []).filter(item => item.isActive).slice(0, 3),
    adSlots: db.adSlots.filter(slot => slot.isActive && !isPlaceholderAdSlot(slot)).map(publicAdSlot),
    publicStatus: publicServiceStatus()
  };
}

function userDataSummary(db, viewerId = "") {
  const recruitments = db.recruitments || [];
  const threads = db.threads || [];
  const messages = db.messages || [];
  const reports = db.reports || [];
  const inquiries = db.inquiries || [];
  const recruitmentReplies = recruitments.flatMap(item => item.replies || []).filter(reply => reply.accountId === viewerId);
  const threadReplies = threads.flatMap(item => item.replies || []).filter(reply => reply.accountId === viewerId);
  const visibleMessages = messages.filter(message => message.status !== "hidden" && (message.fromAccountId === viewerId || message.toAccountId === viewerId));
  const hiddenMessages = messages.filter(message => message.status === "hidden" && (message.fromAccountId === viewerId || message.toAccountId === viewerId));
  return {
    accountId: viewerId,
    generatedAt: Date.now(),
    counts: {
      recruitments: recruitments.filter(item => item.ownerAccountId === viewerId).length,
      threads: threads.filter(item => item.ownerAccountId === viewerId).length,
      replies: recruitmentReplies.length + threadReplies.length,
      likedRecruitments: recruitments.filter(item => (item.likes || []).includes(viewerId)).length,
      likedThreads: threads.filter(item => (item.likes || []).includes(viewerId)).length,
      joinedRecruitments: recruitments.filter(item => (item.participants || []).some(participant => participant.accountId === viewerId)).length,
      visibleMessages: visibleMessages.length,
      hiddenMessages: hiddenMessages.length,
      reportsSubmitted: reports.filter(report => report.reporterAccountId === viewerId).length,
      reportsAboutYou: reports.filter(report => report.reportedAccountId === viewerId).length,
      inquiries: inquiries.filter(inquiry => inquiry.accountId === viewerId).length
    },
    recentOwnedItems: [
      ...recruitments.filter(item => item.ownerAccountId === viewerId).map(item => ({
        type: "recruitment",
        title: item.title,
        createdAt: item.createdAt
      })),
      ...threads.filter(item => item.ownerAccountId === viewerId).map(item => ({
        type: "thread",
        title: item.title,
        createdAt: item.createdAt
      }))
    ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    dataHandling: {
      exportIncludes: "募集、フリートーク、返信、いいね、参加希望、表示中DM、送信した通報、お問い合わせ",
      deletionRequestTargets: "自分の募集、フリートーク、返信、いいね、参加希望、表示中DM、通報や問い合わせ内の直接的なアカウント紐づけ",
      retainedForSafety: "削除処理後も、復元できない処理概要、対応メモ、監査ログ、バックアップ履歴は安全対策と運用確認のため残る場合があります。",
      hiddenMessagesNote: hiddenMessages.length
        ? "非表示済みDMは通常のエクスポートには含めず、通報対応や削除履歴の確認に必要な範囲で管理者のみ確認します。"
        : "非表示済みDMはありません。"
    }
  };
}

function userDataExport(db, viewerId = "") {
  const recruitments = db.recruitments || [];
  const threads = db.threads || [];
  const messages = db.messages || [];
  const ownedRecruitments = recruitments.filter(item => item.ownerAccountId === viewerId);
  const ownedThreads = threads.filter(item => item.ownerAccountId === viewerId);
  const recruitmentReplies = recruitments.flatMap(item => (item.replies || [])
    .filter(reply => reply.accountId === viewerId)
    .map(reply => ({ ...reply, parentType: "recruitment", parentId: item.id, parentTitle: item.title })));
  const threadReplies = threads.flatMap(item => (item.replies || [])
    .filter(reply => reply.accountId === viewerId)
    .map(reply => ({ ...reply, parentType: "thread", parentId: item.id, parentTitle: item.title })));
  return {
    format: "red-thread-user-data-v1",
    exportedAt: Date.now(),
    accountId: viewerId,
    summary: userDataSummary(db, viewerId),
    recruitments: ownedRecruitments,
    threads: ownedThreads,
    replies: [...recruitmentReplies, ...threadReplies],
    likedItems: [
      ...recruitments.filter(item => (item.likes || []).includes(viewerId)).map(item => ({ type: "recruitment", id: item.id, title: item.title })),
      ...threads.filter(item => (item.likes || []).includes(viewerId)).map(item => ({ type: "thread", id: item.id, title: item.title }))
    ],
    joinedRecruitments: recruitments
      .filter(item => (item.participants || []).some(participant => participant.accountId === viewerId))
      .map(item => ({
        id: item.id,
        title: item.title,
        game: item.game,
        joinedAt: (item.participants || []).find(participant => participant.accountId === viewerId)?.joinedAt || null
      })),
    messages: messages.filter(message => message.status !== "hidden" && (message.fromAccountId === viewerId || message.toAccountId === viewerId)),
    reports: (db.reports || []).filter(report => report.reporterAccountId === viewerId),
    inquiries: (db.inquiries || []).filter(inquiry => inquiry.accountId === viewerId)
  };
}

function eraseAccountData(db, req, targetAccountId, reason = "account_data_erasure") {
  const safeReason = cleanText(reason, 300) || "account_data_erasure";
  const summaryBefore = userDataSummary(db, targetAccountId);
  const removedRecruitments = [];
  const removedThreads = [];
  const removedReplies = [];
  const hiddenMessages = [];
  let removedLikes = 0;
  let removedParticipants = 0;

  for (const item of db.recruitments || []) {
    const likeCount = (item.likes || []).length;
    item.likes = (item.likes || []).filter(account => account !== targetAccountId);
    removedLikes += likeCount - item.likes.length;
    const participantCount = (item.participants || []).length;
    item.participants = (item.participants || []).filter(participant => participant.accountId !== targetAccountId);
    removedParticipants += participantCount - item.participants.length;
    const replies = item.replies || [];
    item.replies = replies.filter(reply => {
      if (reply.accountId !== targetAccountId) return true;
      removedReplies.push({ parentType: "recruitments", parentId: item.id, replyId: reply.id });
      return false;
    });
  }

  for (const item of db.threads || []) {
    const likeCount = (item.likes || []).length;
    item.likes = (item.likes || []).filter(account => account !== targetAccountId);
    removedLikes += likeCount - item.likes.length;
    const replies = item.replies || [];
    item.replies = replies.filter(reply => {
      if (reply.accountId !== targetAccountId) return true;
      removedReplies.push({ parentType: "threads", parentId: item.id, replyId: reply.id });
      return false;
    });
  }

  db.recruitments = (db.recruitments || []).filter(item => {
    if (item.ownerAccountId !== targetAccountId) return true;
    removedRecruitments.push({ id: item.id, title: item.title });
    return false;
  });
  db.threads = (db.threads || []).filter(item => {
    if (item.ownerAccountId !== targetAccountId) return true;
    removedThreads.push({ id: item.id, title: item.title });
    return false;
  });

  for (const message of db.messages || []) {
    if (message.status === "hidden") continue;
    if (message.fromAccountId !== targetAccountId && message.toAccountId !== targetAccountId) continue;
    message.status = "hidden";
    hiddenMessages.push({ id: message.id, conversationId: message.conversationId || "" });
  }

  for (const report of db.reports || []) {
    if (report.reporterAccountId === targetAccountId) {
      report.reporterAccountId = "";
      report.reporterName = "Deleted user";
    }
    if (report.reportedAccountId === targetAccountId) {
      report.reportedAccountId = "";
      report.reportedName = "Deleted user";
    }
  }

  for (const inquiry of db.inquiries || []) {
    if (inquiry.accountId !== targetAccountId) continue;
    inquiry.accountId = "";
    inquiry.name = "Deleted user";
    inquiry.contact = "";
  }

  db.bannedAccounts = (db.bannedAccounts || []).filter(entry => entry.accountId !== targetAccountId);

  const result = {
    accountId: targetAccountId,
    reason: safeReason,
    counts: {
      recruitments: removedRecruitments.length,
      threads: removedThreads.length,
      replies: removedReplies.length,
      likes: removedLikes,
      participants: removedParticipants,
      messages: hiddenMessages.length
    },
    summaryBefore: summaryBefore.counts
  };

  archiveDeletedItem(db, req, "account_erasure", {
    accountId: targetAccountId,
    reason: safeReason,
    counts: result.counts,
    erasedAt: Date.now()
  });
  addAuditLog(db, req, "erase_account_data", result);
  addModerationEvent(db, req, "account_erasure", {
    type: "account",
    accountId: targetAccountId,
    reason: safeReason,
    counts: result.counts
  });
  return result;
}

function isPlaceholderAdSlot(slot = {}) {
  const label = cleanText(slot.label, 120);
  const targetUrl = cleanText(slot.targetUrl, 400);
  const html = stripTags(slot.html || "");
  return !targetUrl && !html || ["左広告", "右広告", "一覧内広告", "広告"].includes(label);
}

function adOperationsSummary(db) {
  const slots = Array.isArray(db.adSlots) ? db.adSlots : [];
  const active = slots.filter(slot => slot.isActive);
  const placeholder = active.filter(isPlaceholderAdSlot);
  const invalidTargets = active.filter(slot => slot.targetUrl && !sanitizeAdTargetUrl(slot.targetUrl));
  const htmlSlots = active.filter(slot => cleanText(slot.html, 2000));
  const linkedSlots = active.filter(slot => sanitizeAdTargetUrl(slot.targetUrl));
  const ready = active.length > 0 && placeholder.length === 0 && invalidTargets.length === 0;
  return {
    total: slots.length,
    active: active.length,
    placeholder: placeholder.length,
    invalidTargets: invalidTargets.length,
    htmlSlots: htmlSlots.length,
    linkedSlots: linkedSlots.length,
    ready,
    label: ready ? "広告枠OK" : active.length ? "広告枠確認" : "広告未設定",
    slots: active.map(slot => ({
      slotKey: slot.slotKey,
      label: slot.label || "広告",
      placement: slot.placement || "",
      isPlaceholder: isPlaceholderAdSlot(slot),
      hasTarget: Boolean(sanitizeAdTargetUrl(slot.targetUrl)),
      hasHtml: Boolean(cleanText(slot.html, 2000))
    }))
  };
}

function enrichReports(db) {
  const items = [...db.recruitments, ...db.threads];
  return (db.reports || []).map(report => {
    if (report.type === "messages") {
      const message = (db.messages || []).find(entry => entry.id === report.itemId);
      return {
        ...report,
        title: report.title || `${message?.recruitmentTitle || "DM"} / Message`,
        reportedAccountId: report.reportedAccountId || message?.fromAccountId || "",
        reportedName: report.reportedName || message?.fromName || "",
        conversationId: message?.conversationId || report.conversationId || "",
        recruitmentId: message?.recruitmentId || report.recruitmentId || "",
        messagePreview: message?.body ? cleanText(message.body, 120) : report.messagePreview || ""
      };
    }
    if (report.type === "replies") {
      const parent = findCollection(db, report.parentType)?.find(entry => entry.id === report.parentId);
      const reply = parent?.replies.find(entry => entry.id === report.replyId || entry.id === report.itemId);
      return {
        ...report,
        title: report.title || `${parent?.title || "Deleted item"} / Reply`,
        reportedAccountId: report.reportedAccountId || reply?.accountId || "",
        reportedName: report.reportedName || reply?.author || ""
      };
    }
    const item = items.find(entry => entry.id === report.itemId);
    return {
      ...report,
      title: report.title || item?.title || "Deleted item",
      reportedAccountId: report.reportedAccountId || item?.ownerAccountId || "",
      reportedName: report.reportedName || item?.author || ""
    };
  });
}

function traceForRequestId(requestId) {
  const id = cleanText(requestId, 120);
  if (!id) return null;
  const entries = [
    ...(runtimeMetrics.recentErrors || []).map(entry => ({ ...entry, kind: "error" })),
    ...(runtimeMetrics.recentRateLimits || []).map(entry => ({ ...entry, kind: "rate_limit" })),
    ...(runtimeMetrics.recentRequests || []).map(entry => ({ ...entry, kind: "request" }))
  ];
  const match = entries.find(entry => entry.requestId === id || entry.requestId?.startsWith(id) || id.startsWith(entry.requestId || "__no_match__"));
  if (!match) return null;
  return {
    kind: match.kind,
    requestId: match.requestId || "",
    method: match.method || "",
    path: match.path || "",
    status: match.status || null,
    durationMs: match.durationMs ?? null,
    at: match.at || null,
    error: match.error || ""
  };
}

function enrichInquiries(db) {
  return (db.inquiries || []).slice(0, 200).map(inquiry => ({
    ...inquiry,
    requestTrace: traceForRequestId(inquiry.requestId)
  }));
}

function adminStats(db) {
  const openReports = (db.reports || []).filter(report => report.status === "open").length;
  const closedRecruitments = db.recruitments.filter(item => item.status === "closed").length;
  const activeAds = (db.adSlots || []).filter(slot => slot.isActive).length;
  const placeholderAds = (db.adSlots || []).filter(slot => slot.isActive && isPlaceholderAdSlot(slot)).length;
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const totalReplies = [...db.recruitments, ...db.threads]
    .reduce((sum, item) => sum + item.replies.length, 0);
  const totalLikes = [...db.recruitments, ...db.threads]
    .reduce((sum, item) => sum + item.likes.length, 0);
  const totalParticipants = db.recruitments
    .reduce((sum, item) => sum + item.participants.length, 0);
  const openInquiries = (db.inquiries || []).filter(inquiry => inquiry.status === "open").length;
  const openDeletionRequests = (db.inquiries || []).filter(inquiry => inquiry.status === "open" && inquiry.category === "削除依頼").length;
  const betaFeedback = (db.inquiries || []).filter(inquiry => inquiry.category === "βフィードバック");
  const openBetaFeedback = betaFeedback.filter(inquiry => inquiry.status === "open").length;
  const highPriorityBetaFeedback = betaFeedback.filter(inquiry => inquiry.betaFeedbackPriority === "高").length;
  const highPriorityOpenBetaFeedback = betaFeedback.filter(inquiry => inquiry.status === "open" && inquiry.betaFeedbackPriority === "高").length;
  const activeAnnouncements = (db.announcements || []).filter(item => item.isActive).length;
  const messages = Array.isArray(db.messages) ? db.messages : [];
  const visibleMessages = messages.filter(message => message.status !== "hidden");
  const messageConversationCount = new Set(visibleMessages.map(message => message.conversationId || messageConversationId(message.recruitmentId, message.fromAccountId, message.toAccountId))).size;
  const hiddenMessages = messages.filter(message => message.status === "hidden").length;
  const openMessageReports = (db.reports || []).filter(report => report.type === "messages" && report.status === "open").length;
  return {
    storage: process.env.STORAGE_DRIVER || "json",
    recruitments: db.recruitments.length,
    openRecruitments: db.recruitments.length - closedRecruitments,
    closedRecruitments,
    threads: db.threads.length,
    openReports,
    openInquiries,
    openDeletionRequests,
    openBetaFeedback,
    highPriorityBetaFeedback,
    highPriorityOpenBetaFeedback,
    activeAnnouncements,
    messageConversations: messageConversationCount,
    directMessages: visibleMessages.length,
    hiddenMessages,
    openMessageReports,
    suspendedUsers: (db.bannedAccounts || []).length,
    activeAds,
    totalAds: (db.adSlots || []).length,
    placeholderAds,
    totalReplies,
    totalLikes,
    totalParticipants,
    posts24h: [...db.recruitments, ...db.threads].filter(item => item.createdAt >= since24h).length,
    replies24h: [...db.recruitments, ...db.threads].reduce((sum, item) => sum + item.replies.filter(reply => reply.createdAt >= since24h).length, 0),
    betaFeedback24h: betaFeedback.filter(inquiry => inquiry.createdAt >= since24h).length,
    moderationEvents24h: (db.moderationEvents || []).filter(event => event.createdAt >= since24h).length,
    deletedItems: (db.deletedItems || []).filter(item => !item.restoredAt).length,
    auditLogs: (db.auditLogs || []).length,
    generatedAt: Date.now()
  };
}

function systemChecks() {
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const production = process.env.NODE_ENV === "production";
  const discord = discordConfigState();
  const publicUrlIsLocal = /localhost|127\.0\.0\.1/i.test(publicBaseUrl);
  const sessionSecretLength = sessionSecret.length;
  const databaseUrl = databaseUrlState();
  const databaseSslOk = process.env.DATABASE_SSL === "true";
  const securityContact = publicSecurityContactState();
  const adminAccounts = staffAccountIdsState(process.env.ADMIN_ACCOUNT_IDS, true);
  const moderatorAccounts = staffAccountIdsState(process.env.MODERATOR_ACCOUNT_IDS, false);
  return [
    {
      label: "管理PIN",
      ok: adminPin !== "admin" && adminPin !== "change-this-before-public-release" && (!production || adminPin.length >= 16),
      detail: adminPin === "admin" ? "初期値のままです" : production && adminPin.length < 16 ? `${adminPin.length}文字 / 16文字以上にしてください` : "変更済み"
    },
    {
      label: "セッション鍵",
      ok: Boolean(process.env.SESSION_SECRET) && sessionSecret !== "local-session-secret",
      detail: sessionSecret === "local-session-secret" ? "ローカル用の値です" : "設定済み"
    },
    {
      label: "セッション鍵長",
      ok: !production || sessionSecretLength >= 32,
      detail: `${sessionSecretLength}文字`
    },
    {
      label: "保存方式",
      ok: !production || storageDriver === "postgres",
      detail: storageDriver
    },
    {
      label: "データベースURL",
      ok: storageDriver !== "postgres" || databaseUrl.ok,
      detail: storageDriver === "postgres" ? databaseUrl.ok ? databaseUrl.detail : databaseUrl.detail === "missing" ? "未設定" : "要修正" : "不要"
    },
    {
      label: "DB SSL",
      ok: storageDriver !== "postgres" || databaseSslOk,
      detail: storageDriver === "postgres" ? databaseSslOk ? "true" : process.env.DATABASE_SSL ? "true にしてください" : "未設定" : "不要"
    },
    {
      label: "Discord連携",
      ok: !production || !discordLoginEnabled || discord.ok,
      detail: discordLoginEnabled ? discord.detail : "無効 / 後で設定"
    },
    {
      label: "管理者ロール",
      ok: !production || !discordLoginEnabled || adminAccounts.ok,
      detail: discordLoginEnabled ? adminAccounts.detail : "Discordログイン無効 / 管理PINで運用"
    },
    {
      label: "モデレーターロール",
      ok: !production || moderatorAccounts.ok,
      detail: moderatorAccounts.count ? moderatorAccounts.detail : "任意 / 未設定"
    },
    {
      label: "モデレーター",
      ok: true,
      detail: moderatorAccountIds.size ? `${moderatorAccountIds.size}件` : "未設定"
    },
    {
      label: "公開URL",
      ok: !production || /^https:\/\//.test(publicBaseUrl) && !publicUrlIsLocal,
      detail: publicUrlIsLocal ? `${publicBaseUrl} / ローカル値` : publicBaseUrl
    },
    {
      label: "セキュリティ連絡先",
      ok: !production || securityContact.ok,
      detail: securityContact.detail
    },
    {
      label: "β書き込み制限",
      ok: true,
      detail: betaAccessCode ? "有効" : "未設定"
    },
    {
      label: "β投稿停止",
      ok: !writePaused,
      detail: writePaused ? publicWritePaused ? "PUBLIC_WRITE_PAUSED=true" : "BETA_WRITE_PAUSED=true" : "通常"
    }
  ];
}

function readinessFromChecks(checks) {
  return checks.every(check => check.ok || (process.env.NODE_ENV !== "production" && ["管理PIN", "セッション鍵", "Discord連携", "管理者ロール", "公開URL"].includes(check.label)));
}

function betaReadiness(db) {
  const openBetaFeedback = (db.inquiries || []).filter(inquiry => inquiry.status === "open" && inquiry.category === "βフィードバック").length;
  const openReports = (db.reports || []).filter(report => report.status === "open").length;
  const activeAds = (db.adSlots || []).filter(slot => slot.isActive).length;
  const activeAnnouncements = (db.announcements || []).filter(item => item.isActive).length;
  return [
    {
      label: "β参加コード",
      ok: Boolean(betaAccessCode),
      detail: betaAccessCode ? "設定済み" : "未設定"
    },
    {
      label: "β投稿停止",
      ok: !writePaused,
      detail: writePaused ? publicWritePaused ? "PUBLIC_WRITE_PAUSED=true" : "BETA_WRITE_PAUSED=true" : "通常"
    },
    {
      label: "管理者",
      ok: adminAccountIds.size > 0 || adminPin !== "admin",
      detail: adminAccountIds.size ? `${adminAccountIds.size}件` : adminPin === "admin" ? "ローカルPINのみ" : "PIN変更済み"
    },
    {
      label: "通報確認",
      ok: true,
      detail: openReports ? `未対応 ${openReports}件` : "未対応なし"
    },
    {
      label: "βフィードバック",
      ok: true,
      detail: openBetaFeedback ? `未対応 ${openBetaFeedback}件` : "受付可能"
    },
    {
      label: "お知らせ",
      ok: activeAnnouncements > 0,
      detail: activeAnnouncements ? `${activeAnnouncements}件表示中` : "未設定"
    },
    {
      label: "広告枠",
      ok: activeAds >= 2,
      detail: `${activeAds}枠表示中`
    },
    {
      label: "バックアップ",
      ok: true,
      detail: "管理画面からエクスポート可能"
    }
  ];
}

function betaPostSummary(item, type) {
  const replies = Array.isArray(item.replies) ? item.replies : [];
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const likes = Array.isArray(item.likes) ? item.likes : [];
  const lastReplyAt = replies.reduce((latest, reply) => Math.max(latest, Number(reply.createdAt || 0)), 0);
  const lastParticipantAt = participants.reduce((latest, participant) => Math.max(latest, Number(participant.joinedAt || 0)), 0);
  const lastActivityAt = Math.max(Number(item.createdAt || 0), lastReplyAt, lastParticipantAt);
  return {
    id: item.id,
    type,
    title: item.title,
    author: item.author,
    game: item.game || "",
    category: item.category || "",
    createdAt: item.createdAt,
    lastActivityAt,
    likes: likes.length,
    replies: replies.length,
    participants: participants.length,
    score: likes.length + replies.length * 2 + participants.length * 3
  };
}

function betaDailyReport(db) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const posts = [...db.recruitments, ...db.threads].filter(item => item.createdAt >= since);
  const allPosts = [...db.recruitments, ...db.threads];
  const activePosts = allPosts.filter(item => {
    const recentReplies = (item.replies || []).some(reply => reply.createdAt >= since);
    const recentParticipants = (item.participants || []).some(participant => participant.joinedAt >= since);
    return item.createdAt >= since || recentReplies || recentParticipants;
  });
  const replies = [...db.recruitments, ...db.threads].flatMap(item => (item.replies || []).filter(reply => reply.createdAt >= since).map(reply => ({
    parentId: item.id,
    parentTitle: item.title,
    body: reply.body,
    author: reply.author,
    createdAt: reply.createdAt
  })));
  const reports = (db.reports || []).filter(report => report.createdAt >= since);
  const betaFeedback = (db.inquiries || []).filter(inquiry => inquiry.category === "βフィードバック" && inquiry.createdAt >= since);
  const moderationEvents = (db.moderationEvents || []).filter(event => event.createdAt >= since);
  const auditLogs = (db.auditLogs || []).filter(log => log.createdAt >= since);
  const activeRecruitments = activePosts.filter(item => db.recruitments.includes(item));
  const activeThreads = activePosts.filter(item => db.threads.includes(item));
  const reactionPosts = activePosts.filter(item =>
    (item.replies || []).some(reply => reply.createdAt >= since)
    || (item.participants || []).some(participant => participant.joinedAt >= since)
    || (item.likes || []).length > 0
  );
  const responseRate = activePosts.length ? Math.round(reactionPosts.length / activePosts.length * 100) : 0;
  const silentPosts = posts.filter(item =>
    !(item.replies || []).some(reply => reply.createdAt >= since)
    && !(item.participants || []).some(participant => participant.joinedAt >= since)
    && !(item.likes || []).length
  );
  const recentParticipants = db.recruitments.flatMap(item => (item.participants || []).filter(participant => participant.joinedAt >= since));
  const totalLikesOnActivePosts = activePosts.reduce((sum, item) => sum + (item.likes || []).length, 0);
  const trendingPosts = [
    ...db.recruitments.map(item => betaPostSummary(item, "recruitments")),
    ...db.threads.map(item => betaPostSummary(item, "threads"))
  ]
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.lastActivityAt - a.lastActivityAt)
    .slice(0, 5);
  const openReports = (db.reports || []).filter(report => report.status === "open");
  const openMessageReports = openReports.filter(report => report.type === "messages");
  const messages = Array.isArray(db.messages) ? db.messages : [];
  const recentMessages = messages.filter(message => message.createdAt >= since && message.status !== "hidden");
  const hiddenMessages = messages.filter(message => message.status === "hidden").length;
  const activeMessageConversations = new Set(recentMessages.map(message => message.conversationId || messageConversationId(message.recruitmentId, message.fromAccountId, message.toAccountId))).size;
  const openInquiries = (db.inquiries || []).filter(inquiry => inquiry.status === "open");
  const openDeletionRequests = openInquiries.filter(inquiry => inquiry.category === "削除依頼");
  const openBetaFeedback = (db.inquiries || []).filter(inquiry => inquiry.status === "open" && inquiry.category === "βフィードバック");
  const highPriorityBetaFeedback = (db.inquiries || []).filter(inquiry => inquiry.category === "βフィードバック" && inquiry.betaFeedbackPriority === "高");
  const highPriorityOpenBetaFeedback = highPriorityBetaFeedback.filter(inquiry => inquiry.status === "open");
  const deletionRequestSummaries = openDeletionRequests.slice(0, 5).map(inquiry => {
    const data = inquiry.accountId ? userDataSummary(db, inquiry.accountId) : null;
    return {
      id: inquiry.id,
      accountId: inquiry.accountId || "",
      name: inquiry.name || "Anonymous",
      requestId: inquiry.requestId || "",
      message: inquiry.message || "",
      createdAt: inquiry.createdAt,
      counts: data?.counts || null
    };
  });
  const lastBackupExport = (db.auditLogs || []).find(log => log.action === "export_backup");
  const backupAgeHours = lastBackupExport ? Math.round((Date.now() - lastBackupExport.createdAt) / (60 * 60 * 1000)) : null;
  const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const staleQueue = [
    ...openReports.map(report => ({
      id: report.id,
      kind: "通報",
      label: report.type || "report",
      detail: report.reason || "",
      createdAt: report.createdAt
    })),
    ...openInquiries.map(inquiry => ({
      id: inquiry.id,
      kind: inquiry.category === "βフィードバック" ? "βFB" : inquiry.category === "削除依頼" ? "削除依頼" : "問い合わせ",
      label: inquiry.category || "その他",
      detail: inquiry.message || "",
      createdAt: inquiry.createdAt
    }))
  ].filter(item => item.createdAt <= staleCutoff).sort((a, b) => a.createdAt - b.createdAt);
  const actions = [];
  if (openReports.length) actions.push({ tone: "warn", label: "通報確認", detail: `未対応通報が${openReports.length}件あります。先に確認してください。` });
  if (openMessageReports.length) actions.push({ tone: "warn", label: "DM通報確認", detail: `未対応DM通報が${openMessageReports.length}件あります。DMプレビューを確認して非表示・却下・停止を判断してください。` });
  if (staleQueue.length) actions.push({ tone: "warn", label: "対応待ち", detail: `24時間以上未対応の通報・問い合わせが${staleQueue.length}件あります。先に処理してください。` });
  if (openDeletionRequests.length) actions.push({ tone: "warn", label: "削除依頼確認", detail: `未対応の削除依頼が${openDeletionRequests.length}件あります。対象と本人確認を進めてください。` });
  if (highPriorityOpenBetaFeedback.length) actions.push({ tone: "warn", label: "高優先未対応", detail: `高優先で未対応のβフィードバックが${highPriorityOpenBetaFeedback.length}件あります。先に方針を決めてください。` });
  if (highPriorityBetaFeedback.length) actions.push({ tone: "warn", label: "高優先βFB", detail: `高優先のβフィードバックが${highPriorityBetaFeedback.length}件あります。次の修正候補にしてください。` });
  if (openBetaFeedback.length) actions.push({ tone: "info", label: "βFB確認", detail: `未対応βフィードバックが${openBetaFeedback.length}件あります。分類と優先度を付けてください。` });
  if (!posts.length) actions.push({ tone: "info", label: "投稿促進", detail: "直近24時間の投稿がありません。テスターへ具体的なお題を出してください。" });
  if (posts.length && silentPosts.length) actions.push({ tone: "info", label: "反応促進", detail: `反応がまだない新規投稿が${silentPosts.length}件あります。DiscordやXで返信を促してください。` });
  if (posts.length && !betaFeedback.length) actions.push({ tone: "info", label: "感想依頼", detail: "投稿はありますがβフィードバックがありません。使いづらさの確認を促してください。" });
  if (moderationEvents.length) actions.push({ tone: "warn", label: "自動ブロック確認", detail: `自動ブロックが${moderationEvents.length}件あります。誤検知がないか確認してください。` });
  if (!lastBackupExport || backupAgeHours > 24 * 7) actions.push({ tone: "warn", label: "バックアップ", detail: lastBackupExport ? `最終バックアップから${backupAgeHours}時間経過しています。管理画面から新しいバックアップを取得してください。` : "まだバックアップがありません。管理画面から取得してください。" });
  if (!actions.length) actions.push({ tone: "ok", label: "通常確認", detail: "大きな未対応はありません。投稿と返信の流れを軽く確認してください。" });
  const operatorQueue = actions
    .map((item, index) => ({
      ...item,
      priority: item.tone === "warn" ? "高" : item.tone === "info" ? "中" : "低",
      order: index + 1
    }))
    .sort((a, b) => {
      const ranks = { "高": 0, "中": 1, "低": 2 };
      return ranks[a.priority] - ranks[b.priority] || a.order - b.order;
    });
  const testerCallouts = [];
  if (!posts.length) {
    testerCallouts.push({ tone: "info", label: "募集のお題", detail: "今日遊びたいゲームを1つ決めて、募集かフリートークを1件投稿してもらってください。" });
  }
  if (silentPosts.length) {
    testerCallouts.push({ tone: "info", label: "反応依頼", detail: `反応なし投稿が${silentPosts.length}件あります。見かけた投稿にいいねか返信を1回お願いしてください。` });
  }
  if (activeRecruitments.length > activeThreads.length + 1) {
    testerCallouts.push({ tone: "info", label: "会話依頼", detail: "募集が多めです。フリートークで大会観戦や攻略相談の話題を出してもらってください。" });
  }
  if (activeThreads.length > activeRecruitments.length + 1) {
    testerCallouts.push({ tone: "info", label: "募集依頼", detail: "会話が多めです。実際に遊ぶ募集を1件立ててもらい、参加希望まで試してもらってください。" });
  }
  if (posts.length && !betaFeedback.length) {
    testerCallouts.push({ tone: "info", label: "感想依頼", detail: "投稿後に迷った点や分かりにくかった場所を、βフィードバックから一言送ってもらってください。" });
  }
  if (!testerCallouts.length) {
    testerCallouts.push({ tone: "ok", label: "継続依頼", detail: "今日も1投稿・1返信・1いいねを目安に、普段の使い方で触ってもらってください。" });
  }
  const summaryText = [
    `Red Thread β日次メモ (${new Date().toLocaleDateString("ja-JP")})`,
    `投稿:${posts.length} / 活動投稿:${activePosts.length} / 返信:${replies.length} / 参加希望:${recentParticipants.length}`,
    `DM:${recentMessages.length} / DM会話:${activeMessageConversations} / 未対応DM通報:${openMessageReports.length} / 非表示DM:${hiddenMessages}`,
    `反応率:${responseRate}% / 反応なし:${silentPosts.length} / βFB:${betaFeedback.length} / 高優先未対応:${highPriorityOpenBetaFeedback.length}`,
    `未対応通報:${openReports.length} / 未対応問合せ:${openInquiries.length} / 削除依頼:${openDeletionRequests.length} / 対応待ち24h+:${staleQueue.length} / 自動ブロック:${moderationEvents.length}`,
    `最終バックアップ:${lastBackupExport ? `${backupAgeHours}時間前` : "未取得"}`,
    "",
    "伸びている投稿:",
    ...(trendingPosts.length ? trendingPosts.map(item => `- ${item.title}: score ${item.score} / いいね${item.likes} 返信${item.replies} 参加${item.participants}`) : ["- まだ反応が集まっている投稿はありません。"]),
    "",
    "今日の確認:",
    ...operatorQueue.map(item => `- [${item.priority}] ${item.label}: ${item.detail}`),
    ...(deletionRequestSummaries.length ? [
      "",
      "未対応削除依頼:",
      ...deletionRequestSummaries.map(item => {
        const counts = item.counts;
        const detail = counts ? `募集${counts.recruitments} / スレッド${counts.threads} / 返信${counts.replies} / DM${counts.visibleMessages}` : "アカウントID未入力";
        return `- ${item.accountId || item.name}: ${detail}`;
      })
    ] : []),
    "",
    "テスターへの声かけ:",
    ...testerCallouts.map(item => `- ${item.label}: ${item.detail}`)
  ].join("\n");
  const watchAccounts = new Map();
  function bumpWatch(accountIdValue, displayName, reason) {
    const key = accountIdValue || displayName || "unknown";
    const entry = watchAccounts.get(key) || { accountId: accountIdValue || "", displayName: displayName || "Unknown", reports: 0, moderationEvents: 0, manualDeletes: 0, reasons: new Set() };
    if (reason === "report") entry.reports += 1;
    if (reason === "moderation") entry.moderationEvents += 1;
    if (reason === "manual_delete") entry.manualDeletes += 1;
    entry.reasons.add(reason);
    watchAccounts.set(key, entry);
  }
  reports.forEach(report => bumpWatch(report.reportedAccountId || "", report.reportedName || "", "report"));
  moderationEvents.forEach(event => bumpWatch(event.accountId || "", event.displayName || "", event.action === "manual_delete" ? "manual_delete" : "moderation"));
  const safetyWatch = Array.from(watchAccounts.values())
    .map(entry => ({
      ...entry,
      score: entry.reports * 2 + entry.moderationEvents + entry.manualDeletes * 3,
      reasons: Array.from(entry.reasons)
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return {
    generatedAt: Date.now(),
    since,
    summary: {
      posts: posts.length,
      activePosts: activePosts.length,
      activeRecruitments: activeRecruitments.length,
      activeThreads: activeThreads.length,
      replies: replies.length,
      participants: recentParticipants.length,
      likesOnActivePosts: totalLikesOnActivePosts,
      reactionPosts: reactionPosts.length,
      silentPosts: silentPosts.length,
      responseRate,
      reports: reports.length,
      openReports: openReports.length,
      openMessageReports: openMessageReports.length,
      directMessages: recentMessages.length,
      messageConversations: activeMessageConversations,
      hiddenMessages,
      openInquiries: openInquiries.length,
      openDeletionRequests: openDeletionRequests.length,
      staleQueue: staleQueue.length,
      betaFeedback: betaFeedback.length,
      highPriorityBetaFeedback: highPriorityBetaFeedback.length,
      highPriorityOpenBetaFeedback: highPriorityOpenBetaFeedback.length,
      moderationEvents: moderationEvents.length,
      backupAgeHours,
      lastBackupAt: lastBackupExport?.createdAt || null,
      adminActions: auditLogs.length
    },
    summaryText,
    actions,
    operatorQueue,
    testerCallouts,
    recentPosts: posts.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(item => ({
      id: item.id,
      title: item.title,
      type: db.recruitments.includes(item) ? "recruitments" : "threads",
      author: item.author,
      createdAt: item.createdAt
    })),
    trendingPosts,
    silentPosts: silentPosts.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(item => ({
      id: item.id,
      title: item.title,
      type: db.recruitments.includes(item) ? "recruitments" : "threads",
      author: item.author,
      createdAt: item.createdAt
    })),
    recentBetaFeedback: betaFeedback.sort(sortBetaFeedback).slice(0, 5).map(inquiry => ({
      id: inquiry.id,
      name: inquiry.name,
      message: inquiry.message,
      status: inquiry.status,
      betaFeedbackType: inquiry.betaFeedbackType || "",
      betaFeedbackPriority: inquiry.betaFeedbackPriority || "",
      betaFeedbackNote: inquiry.betaFeedbackNote || "",
      requestId: inquiry.requestId || "",
      createdAt: inquiry.createdAt
    })),
    openReports: openReports.slice(0, 5).map(report => ({
      id: report.id,
      type: report.type,
      reason: report.reason,
      createdAt: report.createdAt
    })),
    openDeletionRequests: deletionRequestSummaries,
    staleQueue: staleQueue.slice(0, 5),
    safetyWatch
  };
}

function publicOperationsReport(db) {
  const base = betaDailyReport(db);
  const summary = base.summary || {};
  const ads = adOperationsSummary(db);
  const referrers = Object.entries(runtimeMetrics.refCounts || {})
    .map(([ref, count]) => ({ ref, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const recentErrors = (runtimeMetrics.recentErrors || []).slice(0, 5).map(entry => ({
    requestId: entry.requestId || "",
    method: entry.method || "",
    path: entry.path || "",
    status: entry.status,
    durationMs: entry.durationMs,
    error: entry.error || "",
    at: entry.at
  }));
  const recentRateLimits = (runtimeMetrics.recentRateLimits || []).slice(0, 5);
  const actions = [];

  if (summary.openReports) actions.push({ tone: "warn", label: "通報確認", detail: `未対応通報が${summary.openReports}件あります。公開中は最優先で確認してください。` });
  if (summary.openMessageReports) actions.push({ tone: "warn", label: "DM通報確認", detail: `未対応DM通報が${summary.openMessageReports}件あります。DMプレビューと対象アカウントを確認してください。` });
  if (summary.openDeletionRequests) actions.push({ tone: "warn", label: "削除依頼確認", detail: `未対応の削除依頼が${summary.openDeletionRequests}件あります。本人確認と対象確認を進めてください。` });
  if (summary.openInquiries) actions.push({ tone: "warn", label: "問い合わせ確認", detail: `未対応問い合わせが${summary.openInquiries}件あります。返信要否と不具合傾向を確認してください。` });
  if (summary.staleQueue) actions.push({ tone: "warn", label: "対応待ち24h+", detail: `24時間以上未対応の項目が${summary.staleQueue}件あります。先に片付けてください。` });
  if (summary.silentPosts) actions.push({ tone: "info", label: "反応なし投稿", detail: `直近投稿のうち${summary.silentPosts}件に反応がありません。SNS告知やフリートーク誘導を検討してください。` });
  if (!summary.posts) actions.push({ tone: "info", label: "投稿促進", detail: "直近24時間の投稿がありません。告知や投稿例の固定表示を検討してください。" });
  if (summary.backupAgeHours === null || summary.backupAgeHours > 24 * 7) actions.push({ tone: "warn", label: "バックアップ", detail: summary.backupAgeHours === null ? "まだバックアップがありません。" : `最終バックアップから${summary.backupAgeHours}時間経過しています。` });
  if (ads.invalidTargets) actions.push({ tone: "warn", label: "広告URL確認", detail: `無効な広告URLが${ads.invalidTargets}件あります。httpsの公開URLへ差し替えてください。` });
  if (ads.active && ads.placeholder) actions.push({ tone: "info", label: "広告差し替え", detail: `有効な広告枠のうち${ads.placeholder}枠が未差し替えです。掲載開始前にラベルとリンクを設定してください。` });
  if (!ads.active) actions.push({ tone: "info", label: "広告枠", detail: "有効な広告枠がありません。掲載予定がある場合は管理画面から有効化してください。" });
  if (recentErrors.length) actions.push({ tone: "warn", label: "エラー確認", detail: `直近の5xxエラーが${recentErrors.length}件あります。リクエストIDで問い合わせと照合してください。` });
  if (recentRateLimits.length) actions.push({ tone: "info", label: "429確認", detail: `直近の制限ログが${recentRateLimits.length}件あります。通常利用が止まっていないか確認してください。` });
  if (!actions.length) actions.push({ tone: "ok", label: "通常運用", detail: "大きな未対応はありません。投稿、通報、問い合わせを軽く確認してください。" });
  const openInquirySummaries = (db.inquiries || [])
    .filter(inquiry => inquiry.status === "open")
    .sort((a, b) => {
      const ranks = { "削除依頼": 0, "不具合": 1, "βフィードバック": 2 };
      return (ranks[a.category] ?? 9) - (ranks[b.category] ?? 9) || a.createdAt - b.createdAt;
    })
    .slice(0, 5)
    .map(inquiry => ({
      id: inquiry.id,
      category: inquiry.category || "その他",
      requestId: inquiry.requestId || "",
      ageHours: Math.max(0, Math.round((Date.now() - inquiry.createdAt) / 36e5)),
      contact: inquiry.contact ? cleanText(inquiry.contact, 80) : "",
      preview: cleanText(inquiry.message || "", 120)
    }));

  const operatorQueue = actions
    .map((item, index) => ({
      ...item,
      priority: item.tone === "warn" ? "高" : item.tone === "info" ? "中" : "低",
      order: index + 1
    }))
    .sort((a, b) => {
      const ranks = { "高": 0, "中": 1, "低": 2 };
      return ranks[a.priority] - ranks[b.priority] || a.order - b.order;
    });
  const launchManualChecks = [
    { label: "募集投稿", detail: "公開URLで募集を1件投稿し、一覧と詳細に表示されることを確認" },
    { label: "フリートーク", detail: "フリートークを1件投稿し、カテゴリ絞り込みと返信が動くことを確認" },
    { label: "反応", detail: "いいね、いいね解除、参加希望、返信が意図通り反映されることを確認" },
    { label: "DM", detail: "募集者プロフィールからDMを送り、マイページのメッセージに出ることを確認" },
    { label: "安全導線", detail: "投稿通報、DM通報、お問い合わせが送れることを確認" },
    { label: "管理", detail: "管理画面で通報、問い合わせ、運用ダイジェスト、公開直前チェックを確認" },
    { label: "バックアップ", detail: "管理画面から本番初回バックアップを取得し、照合IDを控える" },
    { label: "緊急停止", detail: "PUBLIC_WRITE_PAUSED=true にできる場所を hosting dashboard で確認" }
  ];
  const launchWatchPlan = [
    {
      window: "公開直後",
      label: "ステータス",
      detail: "/healthz、/readyz、/status.json、公開運用レポートを開いたままにする"
    },
    {
      window: "最初の10分",
      label: "投稿導線",
      detail: "募集、フリートーク、返信、いいね、参加希望、DMが1回ずつ通るか確認"
    },
    {
      window: "最初の30分",
      label: "安全導線",
      detail: "通報、DM通報、問い合わせ、5xx、429、広告URL確認を見て増加がないか確認"
    },
    {
      window: "異常時",
      label: "一時停止",
      detail: "迷ったら PUBLIC_WRITE_PAUSED=true で投稿だけ止め、閲覧・通報・問い合わせを残す"
    }
  ];
  const summaryText = [
    `Red Thread 公開運用メモ (${new Date().toLocaleDateString("ja-JP")})`,
    `投稿:${summary.posts || 0} / 活動投稿:${summary.activePosts || 0} / 返信:${summary.replies || 0} / 参加希望:${summary.participants || 0}`,
    `反応率:${summary.responseRate || 0}% / 反応なし:${summary.silentPosts || 0} / 24h DM:${summary.directMessages || 0} / DM会話:${summary.messageConversations || 0}`,
    `未対応通報:${summary.openReports || 0} / 未対応DM通報:${summary.openMessageReports || 0} / 未対応問合せ:${summary.openInquiries || 0} / 削除依頼:${summary.openDeletionRequests || 0} / 対応待ち24h+:${summary.staleQueue || 0}`,
    `自動ブロック:${summary.moderationEvents || 0} / 5xx:${recentErrors.length} / 429:${recentRateLimits.length} / 最終バックアップ:${summary.backupAgeHours === null || summary.backupAgeHours === undefined ? "未取得" : `${summary.backupAgeHours}時間前`}`,
    `広告:${ads.active}/${ads.total} / 未差し替え:${ads.placeholder} / 無効URL:${ads.invalidTargets}`,
    "",
    "参照元:",
    ...(referrers.length ? referrers.map(item => `- ${item.ref}: ${item.count}`) : ["- まだ参照元は記録されていません。"]),
    "",
    "今日の確認:",
    ...operatorQueue.map(item => `- [${item.priority}] ${item.label}: ${item.detail}`),
    "",
    "未対応問い合わせ:",
    ...(openInquirySummaries.length
      ? openInquirySummaries.map(item => `- ${item.category} ${item.requestId ? `#${item.requestId.slice(0, 8)} ` : ""}${item.ageHours}h: ${item.preview}`)
      : ["- なし"]),
    "",
    "公開後手動確認:",
    ...launchManualChecks.map(item => `- [ ] ${item.label}: ${item.detail}`),
    "",
    "公開直後の監視:",
    ...launchWatchPlan.map(item => `- ${item.window} / ${item.label}: ${item.detail}`)
  ].join("\n");

  return {
    generatedAt: Date.now(),
    since: base.since,
    summary: {
      ...summary,
      activeAds: ads.active,
      totalAds: ads.total,
      placeholderAds: ads.placeholder,
      invalidAdTargets: ads.invalidTargets,
      adHtmlSlots: ads.htmlSlots,
      adLinkedSlots: ads.linkedSlots
    },
    ads,
    actions,
    operatorQueue,
    launchManualChecks,
    launchWatchPlan,
    summaryText,
    referrers,
    trendingPosts: base.trendingPosts,
    silentPosts: base.silentPosts,
    openReports: base.openReports,
    openDeletionRequests: base.openDeletionRequests,
    openInquirySummaries,
    staleQueue: base.staleQueue,
    safetyWatch: base.safetyWatch,
    recentErrors,
    recentRateLimits
  };
}

function operatorDigest(db) {
  const betaReport = betaDailyReport(db);
  const publicReport = publicOperationsReport(db);
  const betaLaunch = betaLaunchDecision(db);
  const publicLaunch = publicLaunchDecision(db);
  const health = healthSnapshot(db);
  const publicBlockers = (publicLaunch.checks || []).filter(check => !check.ok && check.level === "blocker");
  const betaBlockers = (betaLaunch.checks || []).filter(check => !check.ok && check.level === "blocker");
  const publicQueue = (publicReport.operatorQueue || []).slice(0, 4);
  const betaQueue = (betaReport.operatorQueue || []).slice(0, 4);
  const merged = [...publicQueue, ...betaQueue]
    .map((item, index) => ({ ...item, order: index + 1 }))
    .sort((a, b) => {
      const ranks = { "高": 0, "中": 1, "低": 2 };
      return (ranks[a.priority] ?? 9) - (ranks[b.priority] ?? 9) || a.order - b.order;
    });
  const seen = new Set();
  const priorityQueue = merged.filter(item => {
    const key = `${item.priority}:${item.label}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
  if (!priorityQueue.length) {
    priorityQueue.push({ priority: "低", tone: "ok", label: "通常確認", detail: "大きな未対応はありません。投稿、通報、問い合わせ、バックアップを軽く確認してください。" });
  }
  const mode = betaAccessCode ? "closed_beta" : "public";
  const topRisk = publicBlockers[0] || betaBlockers[0] || null;
  const summaryText = [
    `Red Thread 運用ダイジェスト (${new Date().toLocaleString("ja-JP")})`,
    `モード:${mode === "closed_beta" ? "クローズドβ" : "一般公開"} / ヘルス:${health.ready ? "ready" : "not ready"} / 投稿停止:${writePaused ? "ON" : "OFF"}`,
    `公開判定:${publicLaunch.label || publicLaunch.status} / β判定:${betaLaunch.label || betaLaunch.status}`,
    `未対応通報:${publicReport.summary.openReports || 0} / 未対応DM通報:${publicReport.summary.openMessageReports || 0} / 未対応問合せ:${publicReport.summary.openInquiries || 0} / 削除依頼:${publicReport.summary.openDeletionRequests || 0} / 対応待ち24h+:${publicReport.summary.staleQueue || 0}`,
    `24h投稿:${publicReport.summary.posts || 0} / 反応率:${publicReport.summary.responseRate || 0}% / 5xx:${publicReport.recentErrors.length} / 429:${publicReport.recentRateLimits.length}`,
    `バックアップ:${publicReport.summary.backupAgeHours === null || publicReport.summary.backupAgeHours === undefined ? "未取得" : `${publicReport.summary.backupAgeHours}時間前`} / 広告:${publicReport.summary.activeAds || 0}/${publicReport.summary.totalAds || 0} / 未差替:${publicReport.summary.placeholderAds || 0} / 無効URL:${publicReport.summary.invalidAdTargets || 0}`,
    "",
    "優先対応:",
    ...priorityQueue.map(item => `- [${item.priority || "-"}] ${item.label}: ${item.detail}`),
    "",
    "未対応問い合わせ:",
    ...((publicReport.openInquirySummaries || []).length
      ? publicReport.openInquirySummaries.map(item => `- ${item.category} ${item.requestId ? `#${item.requestId.slice(0, 8)} ` : ""}${item.ageHours}h: ${item.preview}`)
      : ["- なし"]),
    ...(topRisk ? ["", `最初に見る停止項目: ${topRisk.label}: ${topRisk.detail}`] : [])
  ].join("\n");

  return {
    generatedAt: Date.now(),
    mode,
    health: {
      ready: health.ready,
      storage: health.storage,
      uptimeSec: health.uptimeSec,
      recentErrors: (health.runtime?.recentErrors || []).length,
      recentRateLimits: (health.runtime?.recentRateLimits || []).length
    },
    launch: {
      publicStatus: publicLaunch.status,
      publicLabel: publicLaunch.label,
      publicBlockers: publicBlockers.length,
      betaStatus: betaLaunch.status,
      betaLabel: betaLaunch.label,
      betaBlockers: betaBlockers.length,
      topRisk
    },
    summary: {
      posts: publicReport.summary.posts || 0,
      responseRate: publicReport.summary.responseRate || 0,
      openReports: publicReport.summary.openReports || 0,
      openMessageReports: publicReport.summary.openMessageReports || 0,
      openInquiries: publicReport.summary.openInquiries || 0,
      openDeletionRequests: publicReport.summary.openDeletionRequests || 0,
      staleQueue: publicReport.summary.staleQueue || 0,
      backupAgeHours: publicReport.summary.backupAgeHours,
      activeAds: publicReport.summary.activeAds || 0,
      totalAds: publicReport.summary.totalAds || 0,
      placeholderAds: publicReport.summary.placeholderAds || 0,
      invalidAdTargets: publicReport.summary.invalidAdTargets || 0,
      writePaused,
      betaAccessRequired: Boolean(betaAccessCode)
    },
    openInquirySummaries: publicReport.openInquirySummaries || [],
    priorityQueue,
    summaryText
  };
}

function betaPriorityRank(priority) {
  const index = betaFeedbackPriorities.indexOf(priority);
  return index === -1 ? betaFeedbackPriorities.length : index;
}

function sortBetaFeedback(a, b) {
  return betaPriorityRank(a.betaFeedbackPriority) - betaPriorityRank(b.betaFeedbackPriority) || b.createdAt - a.createdAt;
}

function applyBetaFeedbackTriage(inquiry, body = {}) {
  if (inquiry.category !== "βフィードバック") return;
  const betaFeedbackType = cleanText(body.betaFeedbackType, 40);
  if (betaFeedbackType || !inquiry.betaFeedbackType) {
    inquiry.betaFeedbackType = betaFeedbackTypes.includes(betaFeedbackType) ? betaFeedbackType : "保留";
  }
  const betaFeedbackPriority = cleanText(body.betaFeedbackPriority, 10);
  if (betaFeedbackPriority || !inquiry.betaFeedbackPriority) {
    inquiry.betaFeedbackPriority = betaFeedbackPriorities.includes(betaFeedbackPriority) ? betaFeedbackPriority : "中";
  }
  if (Object.prototype.hasOwnProperty.call(body, "betaFeedbackNote")) {
    inquiry.betaFeedbackNote = cleanText(body.betaFeedbackNote, 500);
  }
}

function betaBacklog(db) {
  const feedback = (db.inquiries || [])
    .filter(inquiry => inquiry.category === "βフィードバック")
    .sort(sortBetaFeedback);
  const openFeedback = feedback.filter(inquiry => inquiry.status === "open");
  const resolvedFeedback = feedback.filter(inquiry => inquiry.status !== "open");
  const prioritySummary = betaFeedbackPriorities.map(priority => ({
    priority,
    open: openFeedback.filter(inquiry => inquiry.betaFeedbackPriority === priority).length,
    total: feedback.filter(inquiry => inquiry.betaFeedbackPriority === priority).length
  }));
  const fixCandidates = feedback
    .filter(inquiry => inquiry.status === "open" && inquiry.betaFeedbackType !== "対応不要")
    .slice(0, 5)
    .map(inquiry => ({
      id: inquiry.id,
      type: inquiry.betaFeedbackType || "未分類",
      priority: inquiry.betaFeedbackPriority || "",
      status: inquiry.status,
      message: inquiry.message,
      note: inquiry.betaFeedbackNote || "",
      requestId: inquiry.requestId || "",
      createdAt: inquiry.createdAt
    }));
  const groups = ["未分類", ...betaFeedbackTypes].map(type => {
    const items = feedback.filter(inquiry => (inquiry.betaFeedbackType || "未分類") === type);
    return {
      type,
      count: items.length,
      open: items.filter(inquiry => inquiry.status === "open").length,
      latest: items.slice(0, 5).map(inquiry => ({
        id: inquiry.id,
        status: inquiry.status,
        name: inquiry.name,
        message: inquiry.message,
        priority: inquiry.betaFeedbackPriority || "",
        note: inquiry.betaFeedbackNote || "",
        requestId: inquiry.requestId || "",
        createdAt: inquiry.createdAt,
        resolvedAt: inquiry.resolvedAt || null
      }))
    };
  }).filter(group => group.count > 0 || group.type === "未分類");
  return {
    generatedAt: Date.now(),
    total: feedback.length,
    open: openFeedback.length,
    resolved: resolvedFeedback.length,
    highOpen: openFeedback.filter(inquiry => inquiry.betaFeedbackPriority === "高").length,
    prioritySummary,
    fixCandidates,
    groups
  };
}

function betaTesterProgress(db) {
  const recruitmentAccounts = new Set((db.recruitments || []).map(item => item.ownerAccountId).filter(Boolean));
  const threadAccounts = new Set((db.threads || []).map(item => item.ownerAccountId).filter(Boolean));
  const feedbackAccounts = new Set((db.inquiries || [])
    .filter(inquiry => inquiry.category === "βフィードバック")
    .map(inquiry => inquiry.accountId || inquiry.contact || inquiry.name)
    .filter(Boolean));
  const accounts = new Set([...recruitmentAccounts, ...threadAccounts, ...feedbackAccounts]);
  const completedAccounts = [...accounts].filter(account =>
    recruitmentAccounts.has(account) && threadAccounts.has(account) && feedbackAccounts.has(account)
  );
  const inviteVisits = runtimeMetrics.refCounts["beta-invite"] || 0;
  const needsRecruitment = [...accounts].filter(account => !recruitmentAccounts.has(account)).length;
  const needsThread = [...accounts].filter(account => !threadAccounts.has(account)).length;
  const needsFeedback = [...accounts].filter(account => !feedbackAccounts.has(account)).length;
  const inviteDropoff = Math.max(inviteVisits - accounts.size, 0);
  const bottlenecks = [
    inviteDropoff ? { tone: "info", label: "招待後未行動", count: inviteDropoff, detail: "招待URL訪問後、まだ投稿やフィードバックにつながっていない可能性があります。" } : null,
    needsRecruitment ? { tone: "info", label: "募集未投稿", count: needsRecruitment, detail: "募集投稿をまだ試していないテスターがいます。" } : null,
    needsThread ? { tone: "info", label: "フリートーク未投稿", count: needsThread, detail: "フリートーク投稿をまだ試していないテスターがいます。" } : null,
    needsFeedback ? { tone: "info", label: "感想未送信", count: needsFeedback, detail: "βフィードバックをまだ送っていないテスターがいます。" } : null
  ].filter(Boolean);
  return {
    testers: accounts.size,
    completed: completedAccounts.length,
    completionRate: accounts.size ? Math.round(completedAccounts.length / accounts.size * 100) : 0,
    inviteVisits,
    inviteToTesterRate: inviteVisits ? Math.round(accounts.size / inviteVisits * 100) : 0,
    inviteDropoff,
    recruitmentPosters: recruitmentAccounts.size,
    threadPosters: threadAccounts.size,
    feedbackSenders: feedbackAccounts.size,
    needsRecruitment,
    needsThread,
    needsFeedback,
    bottlenecks
  };
}

function betaSuccessMetrics(db, testerProgress = betaTesterProgress(db)) {
  const posts = [...(db.recruitments || []), ...(db.threads || [])];
  const replies = posts.flatMap(item => Array.isArray(item.replies) ? item.replies : []);
  const participants = (db.recruitments || []).flatMap(item => Array.isArray(item.participants) ? item.participants : []);
  const betaFeedback = (db.inquiries || []).filter(inquiry => inquiry.category === "βフィードバック");
  const reactedPosts = posts.filter(item => (item.likes || []).length || (item.replies || []).length || (item.participants || []).length);
  const responseRate = posts.length ? Math.round(reactedPosts.length / posts.length * 100) : 0;
  const goals = [
    { key: "testers", label: "テスター行動", value: testerProgress.testers, target: 3, unit: "人", detail: "投稿またはβフィードバックまで進んだ人数" },
    { key: "posts", label: "投稿数", value: posts.length, target: 6, unit: "件", detail: "募集とフリートークの合計" },
    { key: "responseRate", label: "反応率", value: responseRate, target: 50, unit: "%", detail: "いいね、返信、参加希望が付いた投稿の割合" },
    { key: "participants", label: "参加希望", value: participants.length, target: 2, unit: "件", detail: "募集に参加希望が押された回数" },
    { key: "feedback", label: "βフィードバック", value: betaFeedback.length, target: 3, unit: "件", detail: "改善判断に使える感想の数" },
    { key: "completionRate", label: "完了率", value: testerProgress.completionRate, target: 30, unit: "%", detail: "募集、フリートーク、感想まで試した割合" }
  ].map(goal => ({
    ...goal,
    ok: goal.value >= goal.target,
    progress: goal.target ? Math.min(100, Math.round(goal.value / goal.target * 100)) : 0
  }));
  const achieved = goals.filter(goal => goal.ok).length;
  const score = Math.round(achieved / goals.length * 100);
  const nextGoal = goals.find(goal => !goal.ok) || null;
  return {
    score,
    achieved,
    total: goals.length,
    label: score >= 80 ? "拡大候補" : score >= 50 ? "継続検証" : "初期検証",
    goals,
    nextGoal
  };
}

function betaLaunchDecision(db) {
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const production = process.env.NODE_ENV === "production";
  const openReports = (db.reports || []).filter(report => report.status === "open");
  const openMessageReports = openReports.filter(report => report.type === "messages");
  const messages = Array.isArray(db.messages) ? db.messages : [];
  const hiddenMessages = messages.filter(message => message.status === "hidden").length;
  const visibleMessages = messages.filter(message => message.status !== "hidden");
  const messageConversationCount = new Set(visibleMessages.map(message => message.conversationId || messageConversationId(message.recruitmentId, message.fromAccountId, message.toAccountId))).size;
  const openBetaFeedback = (db.inquiries || []).filter(inquiry => inquiry.status === "open" && inquiry.category === "βフィードバック");
  const highPriorityOpenBetaFeedback = openBetaFeedback.filter(inquiry => inquiry.betaFeedbackPriority === "高");
  const activeAnnouncements = (db.announcements || []).filter(item => item.isActive);
  const activeAds = (db.adSlots || []).filter(slot => slot.isActive);
  const placeholderAds = activeAds.filter(isPlaceholderAdSlot);
  const ads = adOperationsSummary(db);
  const lastBackupExport = (db.auditLogs || []).find(log => log.action === "export_backup");
  const backupAgeHours = lastBackupExport ? Math.round((Date.now() - lastBackupExport.createdAt) / (60 * 60 * 1000)) : null;
  const recentModerationEvents = (db.moderationEvents || []).filter(event => event.createdAt >= Date.now() - 24 * 60 * 60 * 1000);
  const testerProgress = betaTesterProgress(db);
  const successMetrics = betaSuccessMetrics(db, testerProgress);
  const blockers = [];
  const warnings = [];
  const checks = [];

  function addCheck(label, ok, detail, level = "warning") {
    const item = { label, ok, detail, level };
    checks.push(item);
    if (!ok && level === "blocker") blockers.push(item);
    if (!ok && level !== "blocker") warnings.push(item);
  }

  addCheck("β参加コード", Boolean(betaAccessCode), betaAccessCode ? "設定済み" : "未設定", "blocker");
  addCheck("β投稿停止", !writePaused, writePaused ? publicWritePaused ? "PUBLIC_WRITE_PAUSED=true" : "BETA_WRITE_PAUSED=true" : "通常", "blocker");
  addCheck("管理者設定", adminAccountIds.size > 0 || adminPin !== "admin", adminAccountIds.size ? `${adminAccountIds.size}件` : adminPin === "admin" ? "初期PINのまま" : "PIN変更済み", "blocker");
  addCheck("未対応通報", openReports.length === 0, openReports.length ? `${openReports.length}件` : "なし", "blocker");
  addCheck("未対応DM通報", openMessageReports.length === 0, openMessageReports.length ? `${openMessageReports.length}件` : "なし", "blocker");
  addCheck("24h安全イベント", recentModerationEvents.length < 5, recentModerationEvents.length ? `${recentModerationEvents.length}件` : "なし");
  addCheck("高優先未対応βFB", highPriorityOpenBetaFeedback.length === 0, highPriorityOpenBetaFeedback.length ? `${highPriorityOpenBetaFeedback.length}件` : "なし", "blocker");
  addCheck("お知らせ", activeAnnouncements.length > 0, activeAnnouncements.length ? `${activeAnnouncements.length}件表示中` : "テスター向け案内が未設定");
  addCheck("広告枠", activeAds.length > 0, activeAds.length ? `${activeAds.length}枠表示中` : "広告は未設定");
  addCheck("広告差し替え", placeholderAds.length === 0, placeholderAds.length ? `未差し替え ${placeholderAds.length}枠` : "差し替え済み");
  addCheck("バックアップ", Boolean(lastBackupExport) && backupAgeHours <= 24 * 7, lastBackupExport ? `${new Date(lastBackupExport.createdAt).toLocaleString("ja-JP")} / ${backupAgeHours}時間前` : "管理画面から未エクスポート");
  addCheck("保存方式", !production || storageDriver === "postgres", storageDriver, production ? "blocker" : "warning");
  addCheck("未分類βFB", openBetaFeedback.every(inquiry => inquiry.betaFeedbackType && inquiry.betaFeedbackPriority), openBetaFeedback.filter(inquiry => !inquiry.betaFeedbackType || !inquiry.betaFeedbackPriority).length ? "未分類あり" : "分類済み");
  addCheck("βテスター進捗", testerProgress.testers === 0 || testerProgress.completed > 0, testerProgress.testers ? `${testerProgress.completed}/${testerProgress.testers}人完了` : "未計測");
  addCheck("β成功指標", successMetrics.score >= 50, `${successMetrics.achieved}/${successMetrics.total}達成 / ${successMetrics.label}`);

  const status = blockers.length ? "stop" : warnings.length ? "caution" : "ready";
  const nextActions = blockers.length
    ? blockers.map(item => ({ tone: "warn", label: item.label, detail: item.detail }))
    : warnings.length
      ? warnings.slice(0, 5).map(item => ({ tone: "info", label: item.label, detail: item.detail }))
      : [
          { tone: "ok", label: "招待開始", detail: "少人数のテスターへURLと参加コードを共有できます。" },
          { tone: "ok", label: "日次確認", detail: "公開後はβ日次レポートとβ改善バックログを毎日確認してください。" }
        ];
  const inviteTemplate = [
    "Red Threadの小規模βテストに参加してくれる方を募集しています。",
    "",
    `URL: ${publicBaseUrl}?ref=beta-invite`,
    "参加コード: 別途お送りします",
    "",
    "最初に表示される「βクイックスタート」か「βテストで試してほしいこと」から始めてください。",
    "",
    "お願いしたいこと:",
    "- ゲーム仲間募集を1件投稿する",
    "- フリートークへ短く投稿する",
    "- 気になった点をお問い合わせの「βフィードバック」から送る",
    "- できればスマホでも表示を確認する",
    "",
    "個人情報や外部IDは必要な範囲だけで大丈夫です。",
    "うまく動かない時は、エラー表示の「問い合わせへ」から送ってください。"
  ].join("\n");
  const followupTemplates = [
    {
      label: "初日のお願い",
      text: [
        "Red Thread βテスト初日のお願いです。",
        "",
        "まずは気軽に、募集を1件かフリートークを1件だけ試してみてください。",
        "投稿後に分かりづらい場所があれば、βフィードバックから一言送ってもらえると助かります。"
      ].join("\n")
    },
    {
      label: "反応促進",
      text: [
        "Red Thread βテストの追加お願いです。",
        "",
        "まだ反応が少ない投稿があるので、見かけた募集やフリートークにいいねか返信を1回だけお願いします。",
        "短い一言でも、掲示板として動いているか確認できます。"
      ].join("\n")
    },
    {
      label: "感想依頼",
      text: [
        "Red Thread βテストの感想を集めています。",
        "",
        "使ってみて迷った場所、投稿しづらかった場所、逆に分かりやすかった場所をβフィードバックから送ってください。",
        "一言だけでも次の修正候補にできます。"
      ].join("\n")
    }
  ];
  return {
    generatedAt: Date.now(),
    status,
    label: status === "ready" ? "公開可能" : status === "caution" ? "注意して公開" : "公開前に対応",
    blockers,
    warnings,
    nextActions,
    inviteTemplate,
    followupTemplates,
    checks,
    testerProgress,
    successMetrics,
    counts: {
      openReports: openReports.length,
      openMessageReports: openMessageReports.length,
      messageConversations: messageConversationCount,
      directMessages: visibleMessages.length,
      hiddenMessages,
      openBetaFeedback: openBetaFeedback.length,
      highPriorityOpenBetaFeedback: highPriorityOpenBetaFeedback.length,
      recentModerationEvents: recentModerationEvents.length,
      activeAnnouncements: activeAnnouncements.length,
      activeAds: activeAds.length,
      placeholderAds: placeholderAds.length,
      lastBackupAt: lastBackupExport?.createdAt || null,
      backupAgeHours
    }
  };
}

function publicLaunchDecision(db) {
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const production = process.env.NODE_ENV === "production";
  const databaseUrl = databaseUrlState();
  const databaseSslOk = process.env.DATABASE_SSL === "true";
  const discord = discordConfigState();
  const adminAccounts = staffAccountIdsState(process.env.ADMIN_ACCOUNT_IDS, true);
  const moderatorAccounts = staffAccountIdsState(process.env.MODERATOR_ACCOUNT_IDS, false);
  const publicUrlIsLocal = /localhost|127\.0\.0\.1/i.test(publicBaseUrl);
  const openReports = (db.reports || []).filter(report => report.status === "open");
  const openInquiries = (db.inquiries || []).filter(inquiry => inquiry.status === "open");
  const activeAnnouncements = (db.announcements || []).filter(item => item.isActive);
  const activeAds = (db.adSlots || []).filter(slot => slot.isActive);
  const placeholderAds = activeAds.filter(isPlaceholderAdSlot);
  const ads = adOperationsSummary(db);
  const lastBackupExport = (db.auditLogs || []).find(log => log.action === "export_backup");
  const backupAgeHours = lastBackupExport ? Math.round((Date.now() - lastBackupExport.createdAt) / (60 * 60 * 1000)) : null;
  const seedAuthors = new Set(["RuneCraft", "NeonSamurai", "LobbyHost", "Watcher", "DeckHelper"]);
  const seedPosts = [...(db.recruitments || []), ...(db.threads || [])].filter(item => seedAuthors.has(item.author));
  const blockers = [];
  const warnings = [];
  const checks = [];

  function addCheck(label, ok, detail, level = "warning") {
    const item = { label, ok, detail, level };
    checks.push(item);
    if (!ok && level === "blocker") blockers.push(item);
    if (!ok && level !== "blocker") warnings.push(item);
  }

  addCheck("公開URL", !production || /^https:\/\//.test(publicBaseUrl) && !publicUrlIsLocal, publicUrlIsLocal ? `${publicBaseUrl} / ローカル値` : publicBaseUrl, "blocker");
  addCheck("保存方式", !production || storageDriver === "postgres", storageDriver, production ? "blocker" : "warning");
  addCheck("データベースURL", !production || storageDriver !== "postgres" || databaseUrl.ok, storageDriver === "postgres" ? databaseUrl.ok ? databaseUrl.detail : databaseUrl.detail === "missing" ? "未設定" : "仮URLまたは不正なURL" : "Postgres未使用", production ? "blocker" : "warning");
  addCheck("DB SSL", !production || storageDriver !== "postgres" || databaseSslOk, storageDriver === "postgres" ? databaseSslOk ? "true" : process.env.DATABASE_SSL ? "true にしてください" : "未設定" : "Postgres未使用", production ? "blocker" : "warning");
  addCheck("管理者ロール", !production || !discordLoginEnabled || adminAccounts.ok, discordLoginEnabled ? adminAccounts.detail : "Discordログイン無効 / 管理PINで運用", discordLoginEnabled ? "blocker" : "warning");
  addCheck("モデレーターロール", !production || moderatorAccounts.ok, moderatorAccounts.count ? moderatorAccounts.detail : "任意 / 未設定", production && !moderatorAccounts.ok ? "blocker" : "warning");
  addCheck("Discord連携", !production || !discordLoginEnabled || discord.ok, discordLoginEnabled ? discord.detail : "無効 / 後で設定", discordLoginEnabled ? "blocker" : "warning");
  addCheck("投稿停止", !writePaused, writePaused ? publicWritePaused ? "PUBLIC_WRITE_PAUSED=true" : "BETA_WRITE_PAUSED=true" : "通常", "blocker");
  addCheck("一般公開モード", !betaAccessCode, betaAccessCode ? "参加コードが有効です" : "誰でも投稿可能", "blocker");
  addCheck("シード投稿", seedPosts.length === 0 && !envFlag(process.env.ENABLE_SEED_DATA), seedPosts.length ? `サンプル投稿 ${seedPosts.length}件` : envFlag(process.env.ENABLE_SEED_DATA) ? "ENABLE_SEED_DATA=true" : "なし", "blocker");
  addCheck("未対応通報", openReports.length === 0, openReports.length ? `${openReports.length}件` : "なし", "blocker");
  addCheck("未対応お問い合わせ", openInquiries.length === 0, openInquiries.length ? `${openInquiries.length}件` : "なし");
  addCheck("バックアップ", Boolean(lastBackupExport) && backupAgeHours <= 24 * 7, lastBackupExport ? `${backupAgeHours}時間前` : "未取得", "blocker");
  addCheck("お知らせ", activeAnnouncements.length > 0, activeAnnouncements.length ? `${activeAnnouncements.length}件表示中` : "未設定");
  addCheck("広告枠", placeholderAds.length === 0, placeholderAds.length ? `未差し替え ${placeholderAds.length}枠` : "公開面に未設定広告なし");
  addCheck("広告URL", ads.invalidTargets === 0, ads.invalidTargets ? `無効URL ${ads.invalidTargets}件` : "https公開URLのみ");

  const status = blockers.length ? "stop" : warnings.length ? "caution" : "ready";
  const nextActions = blockers.length
    ? blockers.map(item => ({ tone: "warn", label: item.label, detail: item.detail }))
    : warnings.length
      ? warnings.slice(0, 5).map(item => ({ tone: "info", label: item.label, detail: item.detail }))
      : [
          { tone: "ok", label: "一般公開可能", detail: "公開URLをSNSやコミュニティへ共有できます。" },
          { tone: "ok", label: "公開週の運用", detail: "通報、お問い合わせ、バックアップを毎日確認してください。" }
        ];
  const publicTemplates = [
    {
      label: "X告知",
      text: [
        "ゲーム仲間を気軽に探せる掲示板「Red Thread」を公開しました。",
        "",
        "募集、フリートーク、いいね、返信、DMで、一緒に遊ぶ相手をゆるく探せます。",
        "まずはPCブラウザ向けに小さく運用しています。",
        "",
        publicBaseUrl,
        "",
        "#ゲーム募集 #ゲーム仲間募集"
      ].join("\n")
    },
    {
      label: "Discord告知",
      text: [
        "Red Threadを公開しました。",
        "",
        "ゲーム仲間募集とフリートーク用の掲示板です。",
        "気軽な募集、攻略相談、大会観戦の話題などに使えます。",
        "",
        `URL: ${publicBaseUrl}`,
        "",
        "使っていて気になる点があれば、サイト内のお問い合わせから送ってください。"
      ].join("\n")
    },
    {
      label: "初回お知らせ",
      text: [
        "Red Threadへようこそ",
        "",
        "ゲーム仲間募集とフリートークを気軽に投稿できます。",
        "外部IDや個人情報は必要な範囲だけで大丈夫です。",
        "不安な投稿やDMは通報できます。"
      ].join("\n")
    }
  ];

  return {
    generatedAt: Date.now(),
    status,
    label: status === "ready" ? "一般公開可能" : status === "caution" ? "注意して公開" : "一般公開前に対応",
    blockers,
    warnings,
    checks,
    nextActions,
    publicTemplates,
    counts: {
      openReports: openReports.length,
      openInquiries: openInquiries.length,
      activeAnnouncements: activeAnnouncements.length,
      activeAds: activeAds.length,
      placeholderAds: placeholderAds.length,
      invalidAdTargets: ads.invalidTargets,
      seedPosts: seedPosts.length,
      lastBackupAt: lastBackupExport?.createdAt || null,
      backupAgeHours
    }
  };
}

function publicReleaseChecklist(db) {
  const launch = publicLaunchDecision(db);
  const report = publicOperationsReport(db);
  const health = healthSnapshot(db);
  const production = process.env.NODE_ENV === "production";
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const databaseUrl = databaseUrlState();
  const databaseSslOk = process.env.DATABASE_SSL === "true";
  const publicUrlIsHttps = /^https:\/\//.test(publicBaseUrl);
  const publicUrlIsLocal = /localhost|127\.0\.0\.1/i.test(publicBaseUrl);
  const securityContact = publicSecurityContactState();
  const discord = discordConfigState();
  const adminAccounts = staffAccountIdsState(process.env.ADMIN_ACCOUNT_IDS, true);
  const backupFresh = launch.counts?.backupAgeHours !== null && launch.counts?.backupAgeHours !== undefined && launch.counts.backupAgeHours <= 24 * 7;
  const checks = [
    {
      phase: "ローカル最終確認",
      items: [
        { label: "公開前チェック", ok: launch.status !== "stop", detail: launch.status === "stop" ? `${launch.blockers.length}件の停止項目があります` : "一般公開判定に停止項目はありません", command: "npm run public:prelaunch" },
        { label: "バックアップ", ok: backupFresh, detail: backupFresh ? `${launch.counts.backupAgeHours}時間前` : "管理画面からバックアップを取得してください" },
        { label: "未対応安全項目", ok: !report.summary.openReports && !report.summary.openMessageReports && !report.summary.openDeletionRequests, detail: `通報${report.summary.openReports || 0} / DM通報${report.summary.openMessageReports || 0} / 削除依頼${report.summary.openDeletionRequests || 0}` },
        { label: "広告URL", ok: !report.summary.invalidAdTargets, detail: `無効URL ${report.summary.invalidAdTargets || 0} / 未差替 ${report.summary.placeholderAds || 0}` }
      ]
    },
    {
      phase: "ホスティング設定",
      items: [
        { label: "本番モード", ok: production, detail: `NODE_ENV=${process.env.NODE_ENV || "development"}` },
        { label: "保存方式", ok: storageDriver === "postgres", detail: `STORAGE_DRIVER=${storageDriver}` },
        { label: "データベースURL", ok: storageDriver !== "postgres" || databaseUrl.ok, detail: storageDriver === "postgres" ? databaseUrl.ok ? databaseUrl.detail : databaseUrl.detail === "missing" ? "未設定" : "仮URLまたは不正なURL" : "Postgres未使用" },
        { label: "DB SSL", ok: storageDriver !== "postgres" || databaseSslOk, detail: storageDriver === "postgres" ? databaseSslOk ? "true" : process.env.DATABASE_SSL ? "true にしてください" : "未設定" : "Postgres未使用" },
        { label: "公開URL", ok: publicUrlIsHttps && !publicUrlIsLocal, detail: publicBaseUrl },
        { label: "セキュリティ連絡先", ok: securityContact.ok, detail: securityContact.detail },
        { label: "管理者アカウント", ok: adminAccounts.ok, detail: adminAccounts.detail },
        { label: "Staff roles SQL", ok: adminAccounts.ok, detail: adminAccounts.ok ? "npm run admin:roles:write で生成して適用" : `${adminAccounts.detail} / npm run admin:roles:write で生成` },
        { label: "Discord連携", ok: discord.ok, detail: discord.ok ? "設定済み" : discord.detail },
        { label: "投稿停止", ok: !writePaused, detail: writePaused ? "投稿停止中" : "通常" },
        { label: "公開モード", ok: !betaAccessCode, detail: betaAccessCode ? "BETA_ACCESS_CODE が有効です" : "誰でも投稿可能" }
      ]
    },
    {
      phase: "ライブURL確認",
      items: [
        { label: "ヘルスチェック", ok: health.ready, detail: health.ready ? "/api/health ready" : "システムチェックに注意があります", command: "npm run live:check" },
        { label: "公開ステータス", ok: true, detail: "/status と /status.json、リクエストIDを status:check で確認", command: "npm run status:check" },
        { label: "SEO基本", ok: true, detail: "robots.txt / sitemap.xml / feed.xml を live:check で確認" },
        { label: "セキュリティヘッダー", ok: true, detail: "HSTS / CSP / COOP を live:check で確認", command: "npm run live:check" },
        { label: "ガイドライン", ok: true, detail: "/guidelines.html を live:check で確認" },
        { label: "ログイン確認", ok: discord.ok, detail: "Discordログイン後に管理者ロールを確認" },
        { label: "基本投稿導線", ok: true, detail: "募集、フリートーク、返信、いいね、DM、通報、お問い合わせを手動確認" }
      ]
    },
    {
      phase: "公開直後30分",
      items: [
        { label: "運用ダイジェスト", ok: (report.operatorQueue || []).length === 0, detail: (report.operatorQueue || []).length ? `${report.operatorQueue.length}件の優先対応` : "優先対応なし" },
        { label: "5xx", ok: (report.recentErrors || []).length === 0, detail: `${(report.recentErrors || []).length}件` },
        { label: "429", ok: (report.recentRateLimits || []).length === 0, detail: `${(report.recentRateLimits || []).length}件` },
        { label: "緊急停止手段", ok: true, detail: "必要なら PUBLIC_WRITE_PAUSED=true にする" }
      ]
    }
  ];
  const flat = checks.flatMap(group => group.items);
  const blockers = flat.filter(item => !item.ok);
  const stopLabels = new Set([
    "公開前チェック",
    "バックアップ",
    "未対応安全項目",
    "本番モード",
    "保存方式",
    "データベースURL",
    "DB SSL",
    "公開URL",
    "セキュリティ連絡先",
    "管理者アカウント",
    "Staff roles SQL",
    "Discord連携",
    "投稿停止",
    "公開モード",
    "ヘルスチェック",
    "ログイン確認"
  ]);
  const stopItems = blockers.filter(item => stopLabels.has(item.label));
  const cautionItems = blockers.filter(item => !stopLabels.has(item.label));
  const manualChecks = flat.filter(item => item.command || ["基本投稿導線", "緊急停止手段"].includes(item.label));
  const firstActions = (stopItems.length ? stopItems : cautionItems).slice(0, 5).map(item => ({
    label: item.label,
    detail: item.command ? `${item.detail} / ${item.command}` : item.detail
  }));
  return {
    generatedAt: Date.now(),
    status: stopItems.length ? "stop" : cautionItems.length ? "caution" : "ready",
    label: stopItems.length ? `公開停止 ${stopItems.length}件` : cautionItems.length ? `公開直前確認 ${cautionItems.length}件` : "公開直前確認 OK",
    gateSummary: {
      stop: stopItems.length,
      caution: cautionItems.length,
      manual: manualChecks.length,
      firstActions
    },
    checks,
    summaryText: [
      "Red Thread 公開直前チェック",
      `判定:${stopItems.length ? `停止 ${stopItems.length}件` : cautionItems.length ? `要確認 ${cautionItems.length}件` : "OK"}`,
      `手動確認:${manualChecks.length}件`,
      `公開URL:${publicBaseUrl}`,
      `保存方式:${storageDriver}`,
      `Security contact:${securityContact.ok ? "OK" : "要確認"}`,
      "Staff SQL:npm run admin:roles:write",
      `バックアップ:${backupFresh ? `${launch.counts.backupAgeHours}時間前` : "未取得または古い"}`,
      `広告: ${report.summary.activeAds || 0}/${report.summary.totalAds || 0} / 未差替${report.summary.placeholderAds || 0} / 無効URL${report.summary.invalidAdTargets || 0}`,
      `未対応: 通報${report.summary.openReports || 0} / DM${report.summary.openMessageReports || 0} / 削除${report.summary.openDeletionRequests || 0} / 問合せ${report.summary.openInquiries || 0}`,
      "",
      "最初に見る項目:",
      ...(firstActions.length ? firstActions.map(item => `- ${item.label}: ${item.detail}`) : ["- なし"]),
      "",
      "公開前:npm run public:prelaunch",
      "公開後:LIVE_BASE_URLを設定して npm run deploy:verify（status/live確認）",
      "異常時:PUBLIC_WRITE_PAUSED=true"
    ].join("\n")
  };
}

function deploymentHandoff(db) {
  const production = process.env.NODE_ENV === "production";
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const publicUrlIsHttps = /^https:\/\//.test(publicBaseUrl);
  const publicUrlIsLocal = /localhost|127\.0\.0\.1/i.test(publicBaseUrl);
  const databaseUrl = databaseUrlState();
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const databaseSslOk = process.env.DATABASE_SSL === "true";
  const securityContact = publicSecurityContactState();
  const databaseReady = storageDriver === "postgres" && databaseUrl.ok && databaseSslOk;
  const discord = discordConfigState();
  const discordRedirectUrl = `${publicBaseUrl.replace(/\/$/, "")}/auth/discord/callback`;
  const adminAccounts = staffAccountIdsState(process.env.ADMIN_ACCOUNT_IDS, true);
  const moderatorAccounts = staffAccountIdsState(process.env.MODERATOR_ACCOUNT_IDS, false);
  const lastBackupExport = (db.auditLogs || []).find(log => log.action === "export_backup");
  const backupAgeHours = lastBackupExport ? Math.round((Date.now() - lastBackupExport.createdAt) / (60 * 60 * 1000)) : null;
  const services = [
    {
      name: "Supabase/Postgres",
      status: databaseReady ? "ready" : "todo",
      items: [
        { label: "STORAGE_DRIVER", ok: storageDriver === "postgres", detail: storageDriver },
        { label: "DATABASE_URL", ok: databaseReady, detail: storageDriver === "postgres" ? databaseUrl.ok ? databaseUrl.detail : databaseUrl.detail === "missing" ? "未設定" : "仮URLまたは不正なURL" : "Postgres未使用" },
        { label: "DATABASE_SSL", ok: storageDriver !== "postgres" || databaseSslOk, detail: storageDriver === "postgres" ? databaseSslOk ? "true" : process.env.DATABASE_SSL ? "true にしてください" : "未設定" : "Postgres未使用" },
        { label: "Staff roles SQL", ok: adminAccounts.ok, detail: adminAccounts.ok ? "npm run admin:roles:write で生成して適用" : `${adminAccounts.detail} / npm run admin:roles:write で生成` }
      ]
    },
    {
      name: "Discord",
      status: discord.ok && adminAccounts.ok ? "ready" : "todo",
      items: [
        { label: "OAuth credentials", ok: discord.ok, detail: discord.detail },
        { label: "Redirect URL", ok: publicUrlIsHttps && !publicUrlIsLocal, detail: discordRedirectUrl },
        { label: "Admin account", ok: adminAccounts.ok, detail: adminAccounts.detail },
        { label: "Moderator accounts", ok: moderatorAccounts.ok, detail: moderatorAccounts.count ? moderatorAccounts.detail : "任意 / 未設定" }
      ]
    },
    {
      name: "Hosting",
      status: production && publicUrlIsHttps && !publicUrlIsLocal && !writePaused && !betaAccessCode ? "ready" : "todo",
      items: [
        { label: "NODE_ENV", ok: production, detail: process.env.NODE_ENV || "development" },
        { label: "PUBLIC_BASE_URL", ok: publicUrlIsHttps && !publicUrlIsLocal, detail: publicBaseUrl },
        { label: "PUBLIC_SECURITY_CONTACT", ok: securityContact.ok, detail: securityContact.detail },
        { label: "Public posting", ok: !writePaused, detail: writePaused ? publicWritePaused ? "PUBLIC_WRITE_PAUSED=true" : "BETA_WRITE_PAUSED=true" : "通常" },
        { label: "Public access", ok: !betaAccessCode, detail: betaAccessCode ? "BETA_ACCESS_CODE 有効" : "一般公開" },
        { label: "Seed data", ok: !envFlag(process.env.ENABLE_SEED_DATA), detail: envFlag(process.env.ENABLE_SEED_DATA) ? "ENABLE_SEED_DATA=true" : "無効" }
      ]
    },
    {
      name: "Launch operations",
      status: lastBackupExport && backupAgeHours <= 24 * 7 ? "ready" : "todo",
      items: [
        { label: "First backup", ok: Boolean(lastBackupExport), detail: lastBackupExport ? `${backupAgeHours}時間前` : "未取得" },
        { label: "Live verify", ok: false, detail: "公開URL発行後に npm run deploy:verify" },
        { label: "Emergency brake", ok: true, detail: "PUBLIC_WRITE_PAUSED=true" },
        { label: "Work order", ok: true, detail: "docs/external-service-work-order.md" }
      ]
    }
  ];
  const openItems = services.flatMap(service => service.items.map(item => ({ service: service.name, ...item }))).filter(item => !item.ok);
  const nextActions = openItems.slice(0, 8).map(item => ({
    label: `${item.service}: ${item.label}`,
    detail: item.detail
  }));
  const handoffSteps = [
    {
      label: "DB作成",
      ok: databaseReady,
      detail: databaseReady ? "Postgres接続とSSL設定は本番相当です" : "Supabase/Postgresを作成し、db/schema.sql と db/rls.sql を適用"
    },
    {
      label: "ホスティング環境変数",
      ok: production && publicUrlIsHttps && !publicUrlIsLocal && securityContact.ok && !envFlag(process.env.ENABLE_SEED_DATA),
      detail: "Render等の管理画面へ NODE_ENV、STORAGE_DRIVER、DATABASE_URL、PUBLIC_BASE_URL、PUBLIC_SECURITY_CONTACT を設定"
    },
    {
      label: "Discord OAuth",
      ok: discord.ok && publicUrlIsHttps && !publicUrlIsLocal,
      detail: `Discord Developer Portalに ${discordRedirectUrl} を登録し、ID/Secretを本番環境へ設定`
    },
    {
      label: "初回ログイン",
      ok: adminAccounts.ok,
      detail: adminAccounts.ok ? "管理者アカウントIDは設定済みです" : "本番で一度ログインし、ADMIN_ACCOUNT_IDSへ自分のaccount idを設定"
    },
    {
      label: "Staff SQL",
      ok: adminAccounts.ok,
      detail: "npm run admin:roles:write で出力したSQLを本番DBへ適用"
    },
    {
      label: "デプロイ検証",
      ok: false,
      detail: "公開URLを LIVE_BASE_URL に入れて npm run deploy:verify を実行"
    },
    {
      label: "初回バックアップ",
      ok: Boolean(lastBackupExport),
      detail: lastBackupExport ? `${backupAgeHours}時間前に取得済み` : "管理画面から本番初回バックアップをエクスポート"
    },
    {
      label: "小規模共有",
      ok: false,
      detail: "まず少人数に共有し、公開運用メモ・通報・問い合わせ・広告表示を確認"
    }
  ];
  const envChecklist = [
    { key: "NODE_ENV", status: production ? "ok" : "missing", target: "hosting", expected: "production", secret: false },
    { key: "STORAGE_DRIVER", status: storageDriver === "postgres" ? "ok" : "missing", target: "hosting", expected: "postgres", secret: false },
    { key: "DATABASE_URL", status: databaseReady ? "ok" : databaseConfigured ? "invalid" : "missing", target: "hosting", expected: "real production Postgres URL", secret: true },
    { key: "DATABASE_SSL", status: storageDriver !== "postgres" ? "pending" : databaseSslOk ? "ok" : "missing", target: "hosting", expected: "true", secret: false },
    { key: "PUBLIC_BASE_URL", status: publicUrlIsHttps && !publicUrlIsLocal ? "ok" : "missing", target: "hosting", expected: "final https origin only", secret: false },
    { key: "PUBLIC_SECURITY_CONTACT", status: securityContact.ok ? "ok" : publicSecurityContact ? "invalid" : "missing", target: "hosting", expected: "real mailto: or https contact", secret: false },
    { key: "ADMIN_PIN", status: adminPin && adminPin !== "admin" ? "set" : "missing", target: "hosting", expected: "generated by npm run secrets", secret: true },
    { key: "SESSION_SECRET", status: process.env.SESSION_SECRET ? "set" : "missing", target: "hosting", expected: "generated by npm run secrets", secret: true },
    { key: "ADMIN_ACCOUNT_IDS", status: adminAccounts.ok ? "ok" : "missing", target: "hosting", expected: "discord:numeric-id", secret: false },
    { key: "DISCORD_CLIENT_ID", status: process.env.DISCORD_CLIENT_ID ? discord.ok ? "ok" : "invalid" : "missing", target: "hosting", expected: "Discord application client ID", secret: false },
    { key: "DISCORD_CLIENT_SECRET", status: process.env.DISCORD_CLIENT_SECRET ? discord.ok ? "set" : "invalid" : "missing", target: "hosting", expected: "Discord application secret", secret: true },
    { key: "PUBLIC_WRITE_PAUSED", status: publicWritePaused ? "check" : "ok", target: "hosting", expected: "false for launch, true only for emergency pause", secret: false },
    { key: "BETA_ACCESS_CODE", status: betaAccessCode ? "check" : "ok", target: "hosting", expected: "blank for public launch", secret: true },
    { key: "ENABLE_SEED_DATA", status: envFlag(process.env.ENABLE_SEED_DATA) ? "check" : "ok", target: "hosting", expected: "false", secret: false }
  ];
  return {
    generatedAt: Date.now(),
    status: openItems.length ? "todo" : "ready",
    label: openItems.length ? `外部設定 ${openItems.length}件` : "外部設定 OK",
    services,
    nextActions,
    handoffSteps,
    envChecklist,
    safeEnv: {
      NODE_ENV: process.env.NODE_ENV || "development",
      STORAGE_DRIVER: storageDriver,
      DATABASE_URL: databaseReady ? "valid" : databaseConfigured ? "invalid" : "missing",
      DATABASE_SSL: process.env.DATABASE_SSL || "missing",
      PUBLIC_BASE_URL: publicBaseUrl,
      PUBLIC_SECURITY_CONTACT: securityContact.ok ? "valid" : publicSecurityContact ? "invalid" : "missing",
      ADMIN_ACCOUNT_IDS: adminAccountIds.size ? `${adminAccountIds.size} account(s)` : "missing",
      MODERATOR_ACCOUNT_IDS: moderatorAccountIds.size ? `${moderatorAccountIds.size} account(s)` : "optional",
      BETA_ACCESS_CODE: betaAccessCode ? "set" : "blank",
      BETA_WRITE_PAUSED: String(betaWritePaused),
      PUBLIC_WRITE_PAUSED: String(publicWritePaused),
      ENABLE_SEED_DATA: String(envFlag(process.env.ENABLE_SEED_DATA)),
      DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ? "set" : "missing",
      DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ? discord.ok ? "valid" : "invalid" : "missing"
    },
    summaryText: [
      "Red Thread 外部サービス設定ハンドオフ",
      `判定:${openItems.length ? `未完了 ${openItems.length}件` : "OK"}`,
      `公開URL:${publicBaseUrl}`,
      `DB:${storageDriver} / ${databaseReady ? "DATABASE_URL valid" : databaseConfigured ? "DATABASE_URL invalid" : "DATABASE_URL missing"}`,
      `Discord:${discord.ok ? "valid" : process.env.DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_SECRET ? "invalid" : "missing"}`,
      `Admin:${adminAccountIds.size}件`,
      `Backup:${lastBackupExport ? `${backupAgeHours}時間前` : "未取得"}`,
      "Staff SQL:npm run admin:roles:write",
      "",
      "実行順:",
      ...handoffSteps.map((step, index) => `${index + 1}. ${step.ok ? "[OK]" : "[ ]"} ${step.label}: ${step.detail}`),
      "",
      "安全な環境変数チェック:",
      ...envChecklist.map(item => `- ${item.key}: ${item.status} / ${item.expected}${item.secret ? " / 値は貼らない" : ""}`),
      "",
      "秘密情報はこのメモに含めないでください。",
      "外部作業票: docs/external-service-work-order.md"
    ].join("\n")
  };
}

function incidentBrief(db) {
  const digest = operatorDigest(db);
  const report = publicOperationsReport(db);
  const health = healthSnapshot(db);
  const summary = digest.summary || {};
  const recentErrors = report.recentErrors || [];
  const recentRateLimits = report.recentRateLimits || [];
  const queue = digest.priorityQueue || [];
  const severity = !health.ready || writePaused || recentErrors.length >= 3
    ? "高"
    : summary.openReports || summary.openMessageReports || summary.openInquiries || recentErrors.length || recentRateLimits.length
      ? "中"
      : "低";
  const immediateActions = [
    !health.ready ? { label: "ヘルス確認", detail: "/api/health と /readyz を確認する" } : null,
    writePaused ? { label: "投稿停止中", detail: publicWritePaused ? "PUBLIC_WRITE_PAUSED=true" : "BETA_WRITE_PAUSED=true" } : null,
    recentErrors.length ? { label: "直近エラー", detail: `${recentErrors.length}件。requestId付きでログを確認する` } : null,
    recentRateLimits.length ? { label: "429増加", detail: `${recentRateLimits.length}件。告知や導線から急増していないか確認する` } : null,
    ...(queue.slice(0, 4).map(item => ({ label: item.label, detail: item.detail })) || [])
  ].filter(Boolean).slice(0, 6);
  if (!immediateActions.length) {
    immediateActions.push({ label: "通常監視", detail: "投稿、通報、問い合わせ、DM、バックアップを通常どおり確認する" });
  }
  const statusLabel = severity === "高" ? "要対応" : severity === "中" ? "注意" : "通常";
  const publicNoticeText = [
    severity === "高"
      ? "Red Threadで一部機能に問題が発生している可能性があるため、現在確認しています。"
      : severity === "中"
        ? "Red Threadの運用状況を確認中です。閲覧や投稿で気になる点があればお問い合わせからお知らせください。"
        : "Red Threadは通常どおり運用中です。",
    writePaused ? "現在、投稿やDMなど一部の書き込み機能を一時停止しています。閲覧、通報、お問い合わせは利用できます。" : "",
    "状況が変わり次第、サービス状況ページと管理から更新します。",
    `${publicBaseUrl.replace(/\/$/, "")}/status`
  ].filter(Boolean).join("\n");
  const internalHandoffText = [
    `Red Thread internal handoff / ${statusLabel}`,
    `severity=${severity} ready=${health.ready ? "yes" : "no"} writePaused=${writePaused ? "yes" : "no"}`,
    `reports=${summary.openReports || 0} dmReports=${summary.openMessageReports || 0} inquiries=${summary.openInquiries || 0} deletion=${summary.openDeletionRequests || 0}`,
    `5xx=${recentErrors.length} 429=${recentRateLimits.length} backup=${summary.backupAgeHours === null || summary.backupAgeHours === undefined ? "missing" : `${summary.backupAgeHours}h`}`,
    "next:",
    ...immediateActions.map(item => `- ${item.label}: ${item.detail}`)
  ].join("\n");
  return {
    generatedAt: Date.now(),
    status: severity === "高" ? "incident" : severity === "中" ? "watch" : "normal",
    label: `インシデント共有 ${statusLabel}`,
    severity,
    publicStatus: publicServiceStatus(),
    health: {
      ready: health.ready,
      uptimeSeconds: health.uptimeSeconds,
      recentErrors: recentErrors.length,
      recentRateLimits: recentRateLimits.length,
      requestCount: health.runtime?.requestCount || 0,
      errorCount: health.runtime?.errorCount || 0
    },
    summary,
    recentErrors: recentErrors.slice(0, 5),
    recentRateLimits: recentRateLimits.slice(0, 5),
    immediateActions,
    publicNoticeText,
    internalHandoffText,
    summaryText: [
      `Red Thread インシデント共有メモ (${new Date().toLocaleString("ja-JP")})`,
      `状態:${statusLabel} / 重要度:${severity} / ヘルス:${health.ready ? "ready" : "not ready"} / 投稿停止:${writePaused ? "ON" : "OFF"}`,
      `公開状態:${publicServiceStatus().label} / URL:${publicBaseUrl}`,
      `未対応: 通報${summary.openReports || 0} / DM通報${summary.openMessageReports || 0} / 問合せ${summary.openInquiries || 0} / 削除依頼${summary.openDeletionRequests || 0}`,
      `24h投稿:${summary.posts || 0} / 反応率:${summary.responseRate || 0}% / 5xx:${recentErrors.length} / 429:${recentRateLimits.length}`,
      "",
      "直近対応:",
      ...immediateActions.map(item => `- ${item.label}: ${item.detail}`),
      "",
      "利用者向けお知らせ:",
      publicNoticeText,
      "",
      "内部引き継ぎ:",
      internalHandoffText,
      "",
      "必要なら PUBLIC_WRITE_PAUSED=true で投稿だけ止め、閲覧・通報・問い合わせは残す。"
    ].join("\n")
  };
}

function healthSnapshot(db) {
  const memory = process.memoryUsage();
  const checks = systemChecks();
  return {
    ok: true,
    ready: readinessFromChecks(checks),
    app: packageInfo.name,
    version: packageInfo.version,
    deployment: deploymentInfo(),
    environment: process.env.NODE_ENV || "development",
    storage: process.env.STORAGE_DRIVER || "json",
    checks,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal
    },
    runtime: {
      requestCount: runtimeMetrics.requestCount,
      responseCount: runtimeMetrics.responseCount,
      errorCount: runtimeMetrics.errorCount,
      statusCounts: runtimeMetrics.statusCounts,
      methodCounts: runtimeMetrics.methodCounts,
      pathCounts: Object.fromEntries(Object.entries(runtimeMetrics.pathCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)),
      refCounts: Object.fromEntries(Object.entries(runtimeMetrics.refCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)),
      recentRequests: runtimeMetrics.recentRequests.slice(0, 10),
      recentErrors: runtimeMetrics.recentErrors.slice(0, 10),
      rateLimitBlockedCount: runtimeMetrics.rateLimitBlockedCount,
      recentRateLimits: runtimeMetrics.recentRateLimits.slice(0, 10),
      readCount: runtimeMetrics.readCount,
      writeCount: runtimeMetrics.writeCount,
      lastReadAt: runtimeMetrics.lastReadAt,
      lastWriteAt: runtimeMetrics.lastWriteAt,
      lastErrorAt: runtimeMetrics.lastErrorAt,
      lastError: runtimeMetrics.lastError
    },
    data: {
      recruitments: db.recruitments.length,
      threads: db.threads.length,
      reports: (db.reports || []).length,
      inquiries: (db.inquiries || []).length,
      deletedItems: (db.deletedItems || []).filter(item => !item.restoredAt).length
    },
    retention: retentionPolicy,
    generatedAt: Date.now()
  };
}

function systemReport(db) {
  const storageDriver = process.env.STORAGE_DRIVER || "json";
  const checks = systemChecks();
  return {
    app: packageInfo.name,
    version: packageInfo.version,
    deployment: deploymentInfo(),
    environment: process.env.NODE_ENV || "development",
    storage: storageDriver,
    publicBaseUrl,
    startedAt,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    rateLimitBuckets: rateBuckets.size,
    health: healthSnapshot(db),
    data: {
      recruitments: db.recruitments.length,
      threads: db.threads.length,
      reports: (db.reports || []).length,
      inquiries: (db.inquiries || []).length,
      announcements: (db.announcements || []).length,
      adSlots: (db.adSlots || []).length,
      auditLogs: (db.auditLogs || []).length,
      moderationEvents: (db.moderationEvents || []).length
      ,
      deletedItems: (db.deletedItems || []).length
    },
    checks,
    betaReadiness: betaReadiness(db),
    retention: retentionPolicy,
    ready: readinessFromChecks(checks)
  };
}

function backupPayload(db) {
  const dataJson = JSON.stringify(db);
  return {
    exportedAt: new Date().toISOString(),
    format: "partyfinder-backup-v1",
    checksum: `sha256:${crypto.createHash("sha256").update(dataJson).digest("hex")}`,
    data: db
  };
}

function backupStatus(db) {
  const latest = (db.auditLogs || []).find(log => log.action === "export_backup");
  const ageHours = latest ? Math.round((Date.now() - latest.createdAt) / (60 * 60 * 1000)) : null;
  const fresh = latest && ageHours <= 24 * 7;
  const dataCounts = {
    recruitments: (db.recruitments || []).length,
    threads: (db.threads || []).length,
    messages: (db.messages || []).length,
    reports: (db.reports || []).length,
    inquiries: (db.inquiries || []).length,
    deletedItems: (db.deletedItems || []).length,
    auditLogs: (db.auditLogs || []).length
  };
  const nextActions = [];
  if (!latest) nextActions.push("公開前、削除依頼対応前、広告差し替え前にバックアップを取得してください。");
  if (latest && !fresh) nextActions.push("最終バックアップが7日以上前です。作業前に新しいバックアップを取得してください。");
  if (!nextActions.length) nextActions.push("大きな変更前だけ追加でバックアップを取得してください。");
  return {
    generatedAt: Date.now(),
    status: fresh ? "fresh" : latest ? "stale" : "missing",
    label: fresh ? "バックアップ OK" : latest ? "バックアップ要更新" : "バックアップ未取得",
    latest: latest ? {
      exportedAt: latest.createdAt,
      ageHours,
      actorName: latest.actorName || "Admin",
      checksumPrefix: latest.details?.checksumPrefix || "",
      itemCount: latest.details?.itemCount || null
    } : null,
    dataCounts,
    nextActions,
    summaryText: [
      "Red Thread バックアップ確認メモ",
      `状態:${fresh ? "OK" : latest ? "要更新" : "未取得"}`,
      `最新:${latest ? `${ageHours}時間前 / ${latest.actorName || "Admin"}` : "未取得"}`,
      `照合ID:${latest?.details?.checksumPrefix || "-"}`,
      `件数: 募集${dataCounts.recruitments} / フリートーク${dataCounts.threads} / DM${dataCounts.messages} / 通報${dataCounts.reports} / 問合せ${dataCounts.inquiries}`,
      "",
      ...nextActions.map(action => `- ${action}`)
    ].join("\n")
  };
}

function shareTarget(db, type, id) {
  if (type === "recruitments") return db.recruitments.find(item => item.id === id);
  if (type === "threads") return db.threads.find(item => item.id === id);
  return null;
}

function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function homeHtml(html) {
  const homeUrl = absoluteUrl("/");
  const imageUrl = absoluteUrl("/og-image.svg");
  return String(html)
    .replace('<link rel="canonical" href="/">', `<link rel="canonical" href="${escapeHtml(homeUrl)}">`)
    .replace('<meta property="og:image" content="/og-image.svg">', `<meta property="og:image" content="${escapeHtml(imageUrl)}">`)
    .replace('"url": "/"', `"url": "${homeUrl}"`);
}

function shareHtml(item, type) {
  const isThread = type === "threads";
  const label = isThread ? "フリートーク" : "募集";
  const title = `${item.title || label} | Red Thread`;
  const description = truncate(item.body || item.title || "Red Thread", 150);
  const canonical = absoluteUrl(`/share/${type}/${encodeURIComponent(item.id)}`);
  const appUrl = absoluteUrl(`/#${type}:${encodeURIComponent(item.id)}`);
  const imageUrl = absoluteUrl("/og-image.svg");
  const badge = isThread ? item.category : item.game;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: item.title || label,
    articleBody: stripTags(item.body || ""),
    datePublished: new Date(item.createdAt || Date.now()).toISOString(),
    url: canonical,
    image: imageUrl,
    inLanguage: "ja",
    author: {
      "@type": "Person",
      name: item.author || "Anonymous"
    },
    publisher: {
      "@type": "Organization",
      name: "Red Thread"
    },
    about: badge || label
  };
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Red Thread">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta http-equiv="refresh" content="1; url=${escapeHtml(appUrl)}">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${jsonLdScript(structuredData)}</script>
</head>
<body>
  <main class="share-page">
    <article class="card shared-focus">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(label)}</span>
            ${badge ? `<span class="badge light">${escapeHtml(badge)}</span>` : ""}
            <span>${escapeHtml(item.author || "Anonymous")}</span>
          </div>
          <h1>${escapeHtml(item.title || label)}</h1>
        </div>
      </div>
      <div class="message">${escapeHtml(item.body || "")}</div>
      <div class="actions">
        <a class="btn dark" href="${escapeHtml(appUrl)}">Red Threadで開く</a>
      </div>
    </article>
  </main>
</body>
</html>`;
}

async function serveSharePage(req, res, type, id) {
  const db = await readDb();
  const item = shareTarget(db, type, decodeURIComponent(id));
  if (!item) {
    sendText(res, 404, "Shared post not found.");
    return;
  }
  recordResponse(200, res.locals || {});
  res.writeHead(200, securityHeaders("text/html; charset=utf-8", {
    "cache-control": "public, max-age=60",
    ...requestHeaders(res)
  }));
  res.end(shareHtml(item, type));
}

function addAuditLog(db, req, action, details = {}) {
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  db.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorAccountId: accountId(req),
    actorName: authorName(req),
    action,
    details,
    createdAt: Date.now()
  });
  db.auditLogs = db.auditLogs.slice(0, retentionPolicy.auditLogs);
}

function addModerationEvent(db, req, action, details = {}) {
  db.moderationEvents = Array.isArray(db.moderationEvents) ? db.moderationEvents : [];
  db.moderationEvents.unshift({
    id: crypto.randomUUID(),
    accountId: accountId(req),
    displayName: authorName(req),
    action,
    details,
    createdAt: Date.now()
  });
  db.moderationEvents = db.moderationEvents.slice(0, retentionPolicy.moderationEvents);
}

function archiveDeletedItem(db, req, kind, payload) {
  db.deletedItems = Array.isArray(db.deletedItems) ? db.deletedItems : [];
  db.deletedItems.unshift({
    id: crypto.randomUUID(),
    kind,
    payload,
    deletedByAccountId: accountId(req),
    deletedByName: authorName(req),
    deletedAt: Date.now(),
    restoredAt: null
  });
  db.deletedItems = db.deletedItems.slice(0, retentionPolicy.deletedItems);
}

function duplicateRecruitment(db, item, ownerAccountId) {
  const fingerprint = textFingerprint(item.title, item.game, item.body);
  const threshold = Date.now() - duplicateWindowMs;
  return db.recruitments.some(existing =>
    existing.ownerAccountId === ownerAccountId
    && existing.createdAt >= threshold
    && textFingerprint(existing.title, existing.game, existing.body) === fingerprint
  );
}

function duplicateThread(db, item, ownerAccountId) {
  const fingerprint = textFingerprint(item.title, item.category, item.body);
  const threshold = Date.now() - duplicateWindowMs;
  return db.threads.some(existing =>
    existing.ownerAccountId === ownerAccountId
    && existing.createdAt >= threshold
    && textFingerprint(existing.title, existing.category, existing.body) === fingerprint
  );
}

function officialBotDrafts(db) {
  const recruitmentDrafts = [
    {
      id: "recruit-shadowverse-beginner",
      botId: "coach",
      type: "recruitments",
      launchTag: "公開初日",
      title: "Shadowverse/Worlds Beyond 初心者・復帰勢で対戦したい",
      game: "Shadowverse/Worlds Beyond",
      platform: "モバイル",
      voice: "なし",
      rank: "初心者",
      style: "初心者",
      capacity: 2,
      body: "公式の募集例です。\n初心者・復帰勢同士で、デッキを試しながら軽く対戦したい人向け。\n実際に募集するときは、この文章をまねして短く書けば大丈夫です。"
    },
    {
      id: "recruit-monster-hunter-casual",
      botId: "scout",
      type: "recruitments",
      launchTag: "まったり",
      title: "Monster Hunter まったり素材集め",
      game: "Monster Hunter",
      platform: "クロスプレイ",
      voice: "どちらでも",
      rank: "ランク不問",
      style: "まったり",
      capacity: 4,
      body: "公式の募集例です。\n素材集めやクエスト消化を、急がずまったり遊びたい人向け。\n失敗しても気にしない雰囲気の募集に使えます。"
    },
    {
      id: "recruit-valorant-casual",
      botId: "scout",
      type: "recruitments",
      launchTag: "初心者歓迎",
      title: "VALORANT 初心者歓迎でアンレート",
      game: "VALORANT",
      platform: "PC",
      voice: "どちらでも",
      rank: "ランク不問",
      style: "エンジョイ",
      capacity: 5,
      body: "公式の募集例です。\nアンレートや練習を、雰囲気よく遊びたい人向け。\nランクや強さより、落ち着いて遊べることを重視した募集です。"
    },
    {
      id: "recruit-apex-short-no-vc",
      botId: "scout",
      type: "recruitments",
      launchTag: "短時間",
      title: "Apex 30分だけカジュアル",
      game: "Apex",
      platform: "クロスプレイ",
      voice: "なし",
      rank: "ランク不問",
      style: "まったり",
      capacity: 3,
      body: "公式の募集例です。\n少しだけ遊びたいときの募集例です。VCなし、短時間、途中抜けOKのように書くと参加しやすくなります。"
    },
    {
      id: "recruit-street-fighter-beginner-lounge",
      botId: "coach",
      type: "recruitments",
      launchTag: "練習相手",
      title: "STREET FIGHTER 6 初心者同士で対戦練習",
      game: "STREET FIGHTER 6",
      platform: "クロスプレイ",
      voice: "どちらでも",
      rank: "初心者",
      style: "初心者",
      capacity: 2,
      body: "公式の募集例です。\nコンボ練習や対戦慣れをしたい人向けです。勝ち負けより、試したいことを書いておくと声をかけやすくなります。"
    }
  ];
  const threadDrafts = [
    {
      id: "thread-first-game-friends",
      botId: "lobby",
      type: "threads",
      launchTag: "公開初日",
      title: "最初に募集してみたいゲーム",
      category: "雑談",
      body: "公式の話題出しです。\nこのサイトで最初に募集してみたいゲームがあれば、気軽に書いてください。"
    },
    {
      id: "thread-watch-party",
      botId: "lobby",
      type: "threads",
      launchTag: "大会観戦",
      title: "大会や配信を見ながら話す場所",
      category: "大会観戦",
      body: "公式の話題出しです。\n大会、配信、イベントの感想などをゆるく書ける場所です。"
    },
    {
      id: "thread-beginner-help",
      botId: "coach",
      type: "threads",
      launchTag: "攻略相談",
      title: "初心者が聞きやすい攻略相談",
      category: "攻略相談",
      body: "公式の話題出しです。\n立ち回り、キャラ、デッキ、装備など、ちょっと聞きたいことを置いていけます。"
    },
    {
      id: "thread-tonight-game-checkin",
      botId: "lobby",
      type: "threads",
      launchTag: "今夜遊ぶ",
      title: "今夜遊ぶゲームを書くだけの場所",
      category: "雑談",
      body: "公式の話題出しです。\n今夜遊ぶ予定のゲーム名だけでも大丈夫です。人数が集まりそうなら、そのまま募集に移れます。"
    },
    {
      id: "thread-launch-feedback",
      botId: "lobby",
      type: "threads",
      launchTag: "公開初日",
      title: "使ってみた感想・直してほしいところ",
      category: "雑談",
      body: "公式の話題出しです。\n見づらいところ、迷ったところ、欲しい機能があれば短く書いてください。公開後の改善に使います。"
    }
  ];
  return [...recruitmentDrafts, ...threadDrafts].map(draft => ({
    ...draft,
    bot: publicOfficialBot(botForDraft(draft)),
    alreadyPublished: botDraftAlreadyPublished(db, draft)
  }));
}

function botForDraft(draft = {}) {
  return officialBots.find(bot => bot.id === draft.botId) || officialBot;
}

function publicOfficialBot(bot = officialBot) {
  return {
    id: bot.id,
    author: bot.author,
    accountId: bot.accountId,
    role: bot.role
  };
}

function officialBotAuthorsForDraft(draft) {
  return new Set([botForDraft(draft).author, legacyOfficialBotAuthor]);
}

function botDraftAlreadyPublished(db, draft) {
  const authors = officialBotAuthorsForDraft(draft);
  if (draft.type === "recruitments") {
    const fingerprint = textFingerprint(draft.title, draft.game, draft.body);
    return (db.recruitments || []).some(item =>
      authors.has(item.author)
      && textFingerprint(item.title, item.game, item.body) === fingerprint
    );
  }
  const fingerprint = textFingerprint(draft.title, draft.category, draft.body);
  return (db.threads || []).some(item =>
    authors.has(item.author)
    && textFingerprint(item.title, item.category, item.body) === fingerprint
  );
}

function officialBotItemFromDraft(draft, createdAt = Date.now()) {
  const bot = botForDraft(draft);
  if (draft.type === "recruitments") {
    return {
      id: crypto.randomUUID(),
      title: cleanText(draft.title, 90),
      author: bot.author,
      authorProfile: bot.profile,
      game: cleanText(draft.game, 60),
      ownerAccountId: bot.accountId,
      platform: cleanText(draft.platform, 30),
      voice: cleanText(draft.voice, 20),
      rank: cleanText(draft.rank, 40) || "ランク不問",
      time: "",
      style: normalizePlayStyle(cleanText(draft.style, 40)),
      capacity: Math.max(1, Math.min(99, Number(draft.capacity || 4))),
      body: cleanText(draft.body, 1000),
      status: "open",
      createdAt,
      likes: [],
      participants: [],
      replies: []
    };
  }
  return {
    id: crypto.randomUUID(),
    title: cleanText(draft.title, 90),
    category: normalizeTalkCategory(draft.category),
    ownerAccountId: bot.accountId,
    author: bot.author,
    body: cleanText(draft.body, 1000),
    createdAt,
    likes: [],
    replies: []
  };
}

function duplicateReply(item, body, ownerAccountId) {
  const fingerprint = textFingerprint(body);
  const threshold = Date.now() - duplicateWindowMs;
  return item.replies.some(existing =>
    existing.accountId === ownerAccountId
    && existing.createdAt >= threshold
    && textFingerprint(existing.body) === fingerprint
  );
}

function duplicateMessage(db, body, fromAccountId, toAccountId) {
  const fingerprint = textFingerprint(body);
  const threshold = Date.now() - duplicateWindowMs;
  return (db.messages || []).some(existing =>
    existing.status !== "hidden"
    && existing.fromAccountId === fromAccountId
    && existing.toAccountId === toAccountId
    && existing.createdAt >= threshold
    && textFingerprint(existing.body) === fingerprint
  );
}

function findCollection(db, type) {
  if (type === "recruitments") return db.recruitments;
  if (type === "threads") return db.threads;
  return null;
}

function accountId(req) {
  return cleanText(sessionAccount(req)?.id || req.headers["x-account-id"], 120) || "anonymous";
}

function authorName(req) {
  return cleanText(sessionAccount(req)?.name || req.headers["x-display-name"], 40) || "Anonymous";
}

function isAdmin(req) {
  const pinMatches = cleanText(req.headers["x-admin-pin"], 80) === adminPin;
  const id = accountId(req);
  return pinMatches || adminAccountIds.has(id);
}

function isModerator(req) {
  return moderatorAccountIds.has(accountId(req));
}

function isStaff(req) {
  return isAdmin(req) || isModerator(req);
}

function accountRole(req) {
  if (isAdmin(req)) return "admin";
  if (isModerator(req)) return "moderator";
  return "user";
}

function isBanned(db, req) {
  return Boolean(activeBan(db, req));
}

function activeBan(db, req) {
  const id = accountId(req);
  return (db.bannedAccounts || []).find(entry => {
    if (entry.accountId !== id) return false;
    return !entry.expiresAt || Number(entry.expiresAt) > Date.now();
  });
}

function adminOnly(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: "admin pin required" });
  return false;
}

function staffOnly(req, res) {
  if (isStaff(req)) return true;
  sendJson(res, 401, { error: "staff role required" });
  return false;
}

function rejectBanned(db, req, res) {
  const ban = activeBan(db, req);
  if (!ban) return false;
  sendJson(res, 403, {
    error: "this account is suspended",
    reason: ban?.reason || "moderation",
    expiresAt: ban?.expiresAt || null
  });
  return true;
}

function discordRedirectUri() {
  return `${publicBaseUrl.replace(/\/$/, "")}/auth/discord/callback`;
}

function ensureDiscordConfig(res) {
  if (!discordLoginEnabled) {
    sendText(res, 503, "Discord OAuth is disabled for this beta.");
    return false;
  }
  if (discordConfigState().ok) return true;
  sendText(res, 500, "Discord OAuth is not configured.");
  return false;
}

async function handleAuth(req, res, url) {
  if (req.method === "GET" && url.pathname === "/auth/discord/start") {
    if (!ensureDiscordConfig(res)) return;
    const state = crypto.randomBytes(24).toString("base64url");
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: discordRedirectUri(),
      response_type: "code",
      scope: "identify",
      state
    });
    redirect(res, `https://discord.com/oauth2/authorize?${params}`, {
      "set-cookie": `pf_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/discord/callback") {
    if (!ensureDiscordConfig(res)) return;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || parseCookies(req).pf_oauth_state !== state) {
      sendText(res, 400, "Invalid Discord login state.");
      return;
    }

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: discordRedirectUri()
      })
    });
    if (!tokenRes.ok) {
      sendText(res, 502, "Discord token exchange failed.");
      return;
    }
    const token = await tokenRes.json();
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { authorization: `${token.token_type} ${token.access_token}` }
    });
    if (!userRes.ok) {
      sendText(res, 502, "Discord profile fetch failed.");
      return;
    }
    const user = await userRes.json();
    const account = {
      id: `discord:${user.id}`,
      name: user.global_name || user.username || "DiscordUser",
      discord: user.username || user.id
    };
    redirect(res, "/", {
      "set-cookie": [
        sessionCookie(account),
        "pf_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
      ]
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    sendJsonWithHeaders(res, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
    return;
  }

  sendText(res, 404, "Not found");
}

function rateLimitRule(req, url) {
  if (req.method === "POST" && url.pathname === "/api/recruitments") return { windowMs: 10 * 60 * 1000, max: 6 };
  if (req.method === "POST" && url.pathname === "/api/threads") return { windowMs: 10 * 60 * 1000, max: 8 };
  if (req.method === "POST" && url.pathname === "/api/messages") return { windowMs: 10 * 60 * 1000, max: 20 };
  if (req.method === "POST" && /^\/api\/(recruitments|threads)\/[^/]+\/reply$/.test(url.pathname)) return { windowMs: 10 * 60 * 1000, max: 20 };
  if (req.method === "POST" && url.pathname === "/api/inquiries") return { windowMs: 10 * 60 * 1000, max: 5 };
  if (req.method === "POST" && url.pathname === "/api/reports") return { windowMs: 10 * 60 * 1000, max: 8 };
  return { windowMs: rateWindowMs, max: 60 };
}

function rateLimit(req, res, url) {
  if (req.method === "GET") return true;
  if (isAdmin(req)) return true;
  const now = Date.now();
  const ip = req.socket.remoteAddress || "unknown";
  const account = accountId(req);
  const key = `${ip}:${account}:${url.pathname}`;
  const rule = rateLimitRule(req, url);
  const bucket = rateBuckets.get(key) || { resetAt: now + rule.windowMs, count: 0 };
  if (bucket.resetAt <= now) {
    bucket.resetAt = now + rule.windowMs;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > rule.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    runtimeMetrics.rateLimitBlockedCount += 1;
    pushRecent(runtimeMetrics.recentRateLimits, {
      method: req.method,
      path: url.pathname,
      accountId: account || "",
      ipHash: shortFingerprint(ip),
      count: bucket.count,
      max: rule.max,
      retryAfterSeconds,
      at: now
    }, retentionPolicy.recentRateLimits);
    sendJsonWithHeaders(res, 429, {
      error: "too many requests",
      retryAfterSeconds
    }, {
      "retry-after": String(retryAfterSeconds),
      "x-ratelimit-limit": String(rule.max),
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.ceil(bucket.resetAt / 1000))
    });
    return false;
  }
  if (rateBuckets.size > 1000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

async function handleApi(req, res, url) {
  if (!verifyWriteOrigin(req, res)) return;
  if (!verifyBetaAccess(req, res, url)) return;
  if (!verifyBetaWritePause(req, res, url)) return;
  if (!rateLimit(req, res, url)) return;
  const db = await readDb();
  if (isUserContributionWrite(req, url) && rejectBanned(db, req, res)) return;

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, publicDb(db, accountId(req), isStaff(req)));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, healthSnapshot(db));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const account = sessionAccount(req);
    const ban = activeBan(db, req);
    sendJson(res, 200, {
      account: account ? {
        id: account.id,
        name: account.name,
        discord: account.discord || "",
        role: accountRole(req)
      } : null,
      role: accountRole(req),
      suspension: ban ? {
        active: true,
        reason: ban.reason || "moderation",
        expiresAt: ban.expiresAt || null
      } : { active: false },
      discordConfigured: discordLoginEnabled && discordConfigState().ok,
      betaAccessRequired: Boolean(betaAccessCode),
      betaAccessGranted: betaAccessGranted(req),
      betaWritePaused: writePaused,
      publicWritePaused
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me/data") {
    sendJson(res, 200, { data: userDataSummary(db, accountId(req)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me/export") {
    sendJson(res, 200, { data: userDataExport(db, accountId(req)) });
    return;
  }

  const adminAccountDataMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/data$/);
  if (req.method === "GET" && adminAccountDataMatch) {
    if (!adminOnly(req, res)) return;
    const targetAccountId = cleanText(decodeURIComponent(adminAccountDataMatch[1]), 120);
    if (!targetAccountId) {
      sendJson(res, 400, { error: "account id is required" });
      return;
    }
    sendJson(res, 200, { data: userDataSummary(db, targetAccountId) });
    return;
  }

  const adminAccountEraseMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/erase$/);
  if (req.method === "POST" && adminAccountEraseMatch) {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const targetAccountId = cleanText(decodeURIComponent(adminAccountEraseMatch[1]), 120);
    const confirmAccountId = cleanText(body.confirmAccountId, 120);
    if (!targetAccountId || confirmAccountId !== targetAccountId) {
      sendJson(res, 400, { error: "account id confirmation is required" });
      return;
    }
    const result = eraseAccountData(db, req, targetAccountId, body.reason);
    const inquiryId = cleanText(body.inquiryId, 120);
    if (inquiryId) {
      const inquiry = (db.inquiries || []).find(entry => entry.id === inquiryId);
      if (inquiry) {
        inquiry.status = "resolved";
        inquiry.resolvedAt = Date.now();
        inquiry.resolutionNote = cleanText(body.resolutionNote, 500) || `アカウントデータ処理済み: ${result.counts.recruitments}募集 / ${result.counts.threads}スレッド / ${result.counts.replies}返信 / ${result.counts.messages}DM`;
      }
    }
    await writeDb(db);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/reports") {
    if (!staffOnly(req, res)) return;
    sendJson(res, 200, { reports: enrichReports(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/inquiries") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { inquiries: enrichInquiries(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/announcements") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { announcements: (db.announcements || []).slice(0, retentionPolicy.adminListLimit) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/bot/drafts") {
    if (!adminOnly(req, res)) return;
    const drafts = officialBotDrafts(db);
    sendJson(res, 200, {
      drafts,
      readyCount: drafts.filter(draft => !draft.alreadyPublished).length,
      bot: { author: officialBot.author, accountId: officialBot.accountId },
      bots: officialBots.map(publicOfficialBot)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/bot/publish") {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const requestedIds = Array.isArray(body.draftIds) ? new Set(body.draftIds.map(value => cleanText(value, 120)).filter(Boolean)) : null;
    const drafts = officialBotDrafts(db).filter(draft => !draft.alreadyPublished && (!requestedIds || requestedIds.has(draft.id)));
    const published = [];
    const now = Date.now();
    for (const draft of drafts.slice(0, 12)) {
      if (botDraftAlreadyPublished(db, draft)) continue;
      const item = officialBotItemFromDraft(draft, now - published.length * 1000);
      const violation = draft.type === "recruitments"
        ? contentViolation(item.title, item.game, item.body)
        : contentViolation(item.title, item.body);
      if (violation) {
        addModerationEvent(db, req, "bot_content_blocked", { draftId: draft.id, type: draft.type, reason: violation });
        continue;
      }
      if (draft.type === "recruitments") db.recruitments.unshift(item);
      else db.threads.unshift(item);
      published.push({ id: item.id, draftId: draft.id, type: draft.type, title: item.title });
    }
    addAuditLog(db, req, "official_bot_publish", {
      requested: requestedIds ? requestedIds.size : "all",
      published: published.length,
      titles: published.map(item => item.title)
    });
    await writeDb(db);
    sendJson(res, 201, { ok: true, published, drafts: officialBotDrafts(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/stats") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { stats: adminStats(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/beta-report") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { report: betaDailyReport(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/beta-backlog") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { backlog: betaBacklog(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/beta-launch") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { launch: betaLaunchDecision(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/public-launch") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { launch: publicLaunchDecision(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/public-report") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { report: publicOperationsReport(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/public-release-checklist") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { checklist: publicReleaseChecklist(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/deployment-handoff") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { handoff: deploymentHandoff(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/operator-digest") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { digest: operatorDigest(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/incident-brief") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { brief: incidentBrief(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/system") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { system: systemReport(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/backup-status") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { backup: backupStatus(db) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/ad-slots") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { adSlots: (db.adSlots || []).map(slot => ({ ...slot, isPlaceholder: isPlaceholderAdSlot(slot) })) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/bans") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { bannedAccounts: db.bannedAccounts || [] });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/audit-logs") {
    if (!adminOnly(req, res)) return;
    sendJson(res, 200, { auditLogs: (db.auditLogs || []).slice(0, retentionPolicy.adminListLimit) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/moderation-events") {
    if (!staffOnly(req, res)) return;
    sendJson(res, 200, { moderationEvents: (db.moderationEvents || []).slice(0, retentionPolicy.adminListLimit) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/deleted-items") {
    if (!staffOnly(req, res)) return;
    sendJson(res, 200, { deletedItems: (db.deletedItems || []).slice(0, retentionPolicy.adminListLimit) });
    return;
  }

  const deletedRestoreMatch = url.pathname.match(/^\/api\/admin\/deleted-items\/([^/]+)\/restore$/);
  if (req.method === "POST" && deletedRestoreMatch) {
    if (!staffOnly(req, res)) return;
    const deletedItem = (db.deletedItems || []).find(entry => entry.id === deletedRestoreMatch[1]);
    if (!deletedItem) {
      sendJson(res, 404, { error: "deleted item not found" });
      return;
    }
    if (deletedItem.restoredAt) {
      sendJson(res, 400, { error: "deleted item is already restored" });
      return;
    }
    if (deletedItem.kind === "account_erasure") {
      sendJson(res, 400, { error: "account erasure records cannot be restored" });
      return;
    }
    if (deletedItem.kind === "reply") {
      const { parentType, parentId, reply } = deletedItem.payload || {};
      const parent = findCollection(db, parentType)?.find(entry => entry.id === parentId);
      if (!parent) {
        sendJson(res, 404, { error: "parent item not found" });
        return;
      }
      if (!parent.replies.some(entry => entry.id === reply.id)) parent.replies.push(reply);
    } else if (deletedItem.kind === "message") {
      const message = deletedItem.payload?.message;
      if (!message?.id) {
        sendJson(res, 400, { error: "deleted message payload is invalid" });
        return;
      }
      db.messages = Array.isArray(db.messages) ? db.messages : [];
      const existing = db.messages.find(entry => entry.id === message.id);
      if (existing) {
        existing.status = "visible";
      } else {
        db.messages.push({ ...message, status: "visible" });
      }
    } else {
      const collection = findCollection(db, deletedItem.kind);
      const item = deletedItem.payload?.item;
      if (!collection || !item) {
        sendJson(res, 400, { error: "deleted item payload is invalid" });
        return;
      }
      if (!collection.some(entry => entry.id === item.id)) collection.unshift(item);
    }
    deletedItem.restoredAt = Date.now();
    addAuditLog(db, req, "restore_deleted_item", {
      deletedItemId: deletedItem.id,
      kind: deletedItem.kind
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true, deletedItem });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/export") {
    if (!adminOnly(req, res)) return;
    const backup = backupPayload(db);
    addAuditLog(db, req, "export_backup", {
      format: backup.format,
      checksumPrefix: backup.checksum.replace(/^sha256:/, "").slice(0, 12),
      itemCount: [
        ...(db.recruitments || []),
        ...(db.threads || []),
        ...(db.messages || []),
        ...(db.reports || []),
        ...(db.inquiries || [])
      ].length
    });
    await writeDb(db);
    sendJson(res, 200, backup);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/bans") {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const durationDays = Math.max(0, Math.min(365, Number(body.durationDays || 0)));
    const requestedExpiresAt = Number(body.expiresAt || 0);
    const bannedAccount = {
      accountId: cleanText(body.accountId, 120),
      displayName: cleanText(body.displayName, 40) || "Unknown",
      reason: cleanText(body.reason, 300) || "moderation",
      note: cleanText(body.note, 500),
      expiresAt: Number.isFinite(requestedExpiresAt) && requestedExpiresAt > 0 ? requestedExpiresAt : durationDays ? Date.now() + durationDays * 24 * 60 * 60 * 1000 : null,
      createdAt: Date.now()
    };
    if (!bannedAccount.accountId) {
      sendJson(res, 400, { error: "accountId is required" });
      return;
    }
    db.bannedAccounts = (db.bannedAccounts || []).filter(entry => entry.accountId !== bannedAccount.accountId);
    db.bannedAccounts.unshift(bannedAccount);
    addAuditLog(db, req, "ban_account", {
      accountId: bannedAccount.accountId,
      displayName: bannedAccount.displayName,
      reason: bannedAccount.reason,
      note: bannedAccount.note,
      expiresAt: bannedAccount.expiresAt
    });
    await writeDb(db);
    sendJson(res, 201, { bannedAccount });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/announcements") {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const announcement = {
      id: crypto.randomUUID(),
      title: cleanText(body.title, 80),
      body: cleanText(body.body, 500),
      tone: ["info", "warning", "maintenance"].includes(body.tone) ? body.tone : "info",
      isActive: body.isActive !== false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (!announcement.title || !announcement.body) {
      sendJson(res, 400, { error: "title and body are required" });
      return;
    }
    db.announcements = Array.isArray(db.announcements) ? db.announcements : [];
    db.announcements.unshift(announcement);
    addAuditLog(db, req, "create_announcement", {
      announcementId: announcement.id,
      title: announcement.title,
      isActive: announcement.isActive
    });
    await writeDb(db);
    sendJson(res, 201, { announcement });
    return;
  }

  const banMatch = url.pathname.match(/^\/api\/admin\/bans\/(.+)$/);
  if (req.method === "DELETE" && banMatch) {
    if (!adminOnly(req, res)) return;
    const target = decodeURIComponent(banMatch[1]);
    db.bannedAccounts = (db.bannedAccounts || []).filter(entry => entry.accountId !== target);
    addAuditLog(db, req, "unban_account", { accountId: target });
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const adSlotMatch = url.pathname.match(/^\/api\/admin\/ad-slots\/([^/]+)$/);
  if (req.method === "PATCH" && adSlotMatch) {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const slot = (db.adSlots || []).find(entry => entry.slotKey === adSlotMatch[1]);
    if (!slot) {
      sendJson(res, 404, { error: "ad slot not found" });
      return;
    }
    if (typeof body.label === "string") slot.label = cleanText(body.label, 80);
    if (typeof body.targetUrl === "string") slot.targetUrl = sanitizeAdTargetUrl(body.targetUrl);
    if (typeof body.html === "string") slot.html = sanitizeAdHtml(cleanText(body.html, 2000));
    if (typeof body.isActive === "boolean") slot.isActive = body.isActive;
    slot.updatedAt = Date.now();
    addAuditLog(db, req, "update_ad_slot", {
      slotKey: slot.slotKey,
      label: slot.label,
      isActive: slot.isActive
    });
    await writeDb(db);
    sendJson(res, 200, { adSlot: slot });
    return;
  }

  const announcementMatch = url.pathname.match(/^\/api\/admin\/announcements\/([^/]+)$/);
  if (req.method === "PATCH" && announcementMatch) {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const announcement = (db.announcements || []).find(entry => entry.id === announcementMatch[1]);
    if (!announcement) {
      sendJson(res, 404, { error: "announcement not found" });
      return;
    }
    if (typeof body.title === "string") announcement.title = cleanText(body.title, 80);
    if (typeof body.body === "string") announcement.body = cleanText(body.body, 500);
    if (typeof body.tone === "string" && ["info", "warning", "maintenance"].includes(body.tone)) announcement.tone = body.tone;
    if (typeof body.isActive === "boolean") announcement.isActive = body.isActive;
    announcement.updatedAt = Date.now();
    addAuditLog(db, req, "update_announcement", {
      announcementId: announcement.id,
      title: announcement.title,
      isActive: announcement.isActive
    });
    await writeDb(db);
    sendJson(res, 200, { announcement });
    return;
  }

  if (req.method === "DELETE" && announcementMatch) {
    if (!adminOnly(req, res)) return;
    const index = (db.announcements || []).findIndex(entry => entry.id === announcementMatch[1]);
    if (index < 0) {
      sendJson(res, 404, { error: "announcement not found" });
      return;
    }
    const [announcement] = db.announcements.splice(index, 1);
    addAuditLog(db, req, "delete_announcement", {
      announcementId: announcement.id,
      title: announcement.title
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reports") {
    if (rejectBanned(db, req, res)) return;
    const body = await readBody(req);
    const type = cleanText(body.type, 40);
    const itemId = cleanText(body.itemId, 120);
    const reason = cleanText(body.reason, 300) || "理由未記入";
    if (type === "messages") {
      const message = (db.messages || []).find(entry => entry.id === itemId);
      const reporterId = accountId(req);
      if (!message || (!isStaff(req) && message.fromAccountId !== reporterId && message.toAccountId !== reporterId)) {
        sendJson(res, 404, { error: "reported message not found" });
        return;
      }
      if (!isStaff(req) && message.fromAccountId === reporterId) {
        sendJson(res, 400, { error: "cannot report your own message" });
        return;
      }
      db.reports = db.reports || [];
      db.reports.unshift({
        id: crypto.randomUUID(),
        type: "messages",
        itemId,
        title: `${message.recruitmentTitle || "DM"} / Message`,
        conversationId: message.conversationId || "",
        recruitmentId: message.recruitmentId || "",
        messagePreview: cleanText(message.body, 120),
        reason,
        reporterAccountId: reporterId,
        reporterName: authorName(req),
        reportedAccountId: message.fromAccountId || "",
        reportedName: message.fromName || "",
        status: "open",
        createdAt: Date.now()
      });
      await writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }
    if (type === "replies") {
      const parentType = cleanText(body.parentType, 40);
      const parentId = cleanText(body.parentId, 120);
      const replyId = cleanText(body.replyId || itemId, 120);
      const parent = findCollection(db, parentType)?.find(entry => entry.id === parentId);
      const reply = parent?.replies.find(entry => entry.id === replyId);
      if (!parent || !reply) {
        sendJson(res, 404, { error: "reported reply not found" });
        return;
      }
      db.reports = db.reports || [];
      db.reports.unshift({
        id: crypto.randomUUID(),
        type: "replies",
        itemId: replyId,
        parentType,
        parentId,
        replyId,
        title: `${parent.title} / Reply`,
        reason,
        reporterAccountId: accountId(req),
        reporterName: authorName(req),
        reportedAccountId: reply.accountId || "",
        reportedName: reply.author || "",
        status: "open",
        createdAt: Date.now()
      });
      await writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }
    const collection = findCollection(db, type);
    const item = collection && collection.find(entry => entry.id === itemId);
    if (!item) {
      sendJson(res, 404, { error: "reported item not found" });
      return;
    }
    db.reports = db.reports || [];
    db.reports.unshift({
      id: crypto.randomUUID(),
      type,
      itemId,
      title: item.title,
      reason,
      reporterAccountId: accountId(req),
      reporterName: authorName(req),
      reportedAccountId: item.ownerAccountId || "",
      reportedName: item.author || "",
      status: "open",
      createdAt: Date.now()
    });
    await writeDb(db);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/inquiries") {
    if (rejectBanned(db, req, res)) return;
    const body = await readBody(req);
    const inquiry = {
      id: crypto.randomUUID(),
      name: cleanText(body.name, 40) || authorName(req),
      contact: cleanText(body.contact, 120),
      category: inquiryCategories.includes(body.category) ? body.category : "その他",
      requestId: cleanText(body.requestId, 80),
      message: cleanText(body.message, 1200),
      accountId: accountId(req),
      status: "open",
      createdAt: Date.now()
    };
    if (!inquiry.message) {
      sendJson(res, 400, { error: "message is required" });
      return;
    }
    const violation = contentViolation(inquiry.name, inquiry.contact, inquiry.message);
    if (violation) {
      addModerationEvent(db, req, "content_blocked", { type: "inquiries", reason: violation });
      await writeDb(db);
      sendJson(res, 400, { error: "inquiry content was blocked", reason: violation });
      return;
    }
    db.inquiries = Array.isArray(db.inquiries) ? db.inquiries : [];
    const receiptRequestId = inquiry.requestId || res.locals?.requestId || inquiry.id;
    inquiry.requestId = receiptRequestId;
    db.inquiries.unshift(inquiry);
    await writeDb(db);
    sendJson(res, 201, {
      ok: true,
      inquiryId: inquiry.id,
      requestId: receiptRequestId,
      receivedAt: inquiry.createdAt
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/recruitments") {
    if (rejectBanned(db, req, res)) return;
    const body = await readBody(req);
    const game = cleanText(body.game, 60);
    const rank = cleanText(body.rank, 40) || "ランク不問";
    const style = normalizePlayStyle(cleanText(body.style, 40));
    const author = cleanText(body.author, 40) || authorName(req);
    const title = cleanText(body.title, 90) || [game, rank !== "ランク不問" ? rank : "", `${style}募集`].filter(Boolean).join(" ");
    const item = {
      id: crypto.randomUUID(),
      title,
      author,
      authorProfile: sanitizeAuthorProfile(body.authorProfile, author),
      game,
      ownerAccountId: accountId(req),
      platform: cleanText(body.platform, 30),
      voice: cleanText(body.voice, 20),
      rank,
      time: cleanText(body.time, 50),
      style,
      capacity: Math.max(1, Math.min(99, Number(body.capacity || 4))),
      body: cleanText(body.body, 1000),
      status: "open",
      createdAt: Date.now(),
      likes: [],
      participants: [],
      replies: []
    };
    if (!item.game || !item.body) {
      sendJson(res, 400, { error: "game and body are required" });
      return;
    }
    const violation = contentViolation(item.title, item.game, item.body);
    if (violation) {
      addModerationEvent(db, req, "content_blocked", { type: "recruitments", reason: violation, title: item.title });
      await writeDb(db);
      sendJson(res, 400, { error: "post content was blocked", reason: violation });
      return;
    }
    if (duplicateRecruitment(db, item, item.ownerAccountId)) {
      addModerationEvent(db, req, "duplicate_blocked", { type: "recruitments", title: item.title });
      await writeDb(db);
      sendJson(res, 409, { error: "duplicate post blocked" });
      return;
    }
    db.recruitments.unshift(item);
    await writeDb(db);
    sendJson(res, 201, publicItem(item, accountId(req)));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    if (rejectBanned(db, req, res)) return;
    const body = await readBody(req);
    const senderId = accountId(req);
    const senderName = authorName(req);
    const text = cleanText(body.body, 1000);
    if (!text) {
      sendJson(res, 400, { error: "message body is required" });
      return;
    }
    const violation = contentViolation(text);
    if (violation) {
      addModerationEvent(db, req, "content_blocked", { type: "messages", reason: violation });
      await writeDb(db);
      sendJson(res, 400, { error: "message content was blocked", reason: violation });
      return;
    }
    const requestedConversationId = cleanText(body.conversationId, 80);
    const requestedRecruitmentId = cleanText(body.recruitmentId, 120);
    let recruitment = null;
    let recipientId = "";
    let recipientName = "";
    let conversationId = requestedConversationId;
    if (requestedConversationId) {
      const existing = (db.messages || []).find(item => item.conversationId === requestedConversationId && (item.fromAccountId === senderId || item.toAccountId === senderId));
      if (!existing) {
        sendJson(res, 404, { error: "conversation not found" });
        return;
      }
      recruitment = db.recruitments.find(item => item.id === existing.recruitmentId) || null;
      recipientId = existing.fromAccountId === senderId ? existing.toAccountId : existing.fromAccountId;
      recipientName = existing.fromAccountId === senderId ? existing.toName : existing.fromName;
    } else {
      recruitment = db.recruitments.find(item => item.id === requestedRecruitmentId) || null;
      if (!recruitment) {
        sendJson(res, 404, { error: "recruitment not found" });
        return;
      }
      recipientId = recruitment.ownerAccountId || "";
      recipientName = recruitment.author || "Player";
      conversationId = messageConversationId(recruitment.id, senderId, recipientId);
    }
    if (!recipientId) {
      sendJson(res, 400, { error: "recipient is unavailable" });
      return;
    }
    if (recipientId === senderId) {
      sendJson(res, 400, { error: "cannot message yourself" });
      return;
    }
    if (duplicateMessage(db, text, senderId, recipientId)) {
      addModerationEvent(db, req, "duplicate_blocked", { type: "messages", toAccountId: recipientId });
      await writeDb(db);
      sendJson(res, 409, { error: "duplicate message blocked" });
      return;
    }
    const message = {
      id: crypto.randomUUID(),
      conversationId,
      recruitmentId: recruitment?.id || "",
      recruitmentTitle: recruitment?.title || "募集",
      fromAccountId: senderId,
      fromName: senderName,
      toAccountId: recipientId,
      toName: recipientName || "Player",
      body: text,
      status: "visible",
      createdAt: Date.now()
    };
    db.messages = Array.isArray(db.messages) ? db.messages : [];
    db.messages.push(message);
    await writeDb(db);
    sendJson(res, 201, { ok: true, messages: publicMessages(db, senderId) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/threads") {
    if (rejectBanned(db, req, res)) return;
    const body = await readBody(req);
    const category = normalizeTalkCategory(body.category);
    const item = {
      id: crypto.randomUUID(),
      title: cleanText(body.title, 90),
      category,
      ownerAccountId: accountId(req),
      author: cleanText(body.author, 40) || authorName(req),
      body: cleanText(body.body, 1000),
      createdAt: Date.now(),
      likes: [],
      replies: []
    };
    if (!item.title || !item.body) {
      sendJson(res, 400, { error: "title and body are required" });
      return;
    }
    const violation = contentViolation(item.title, item.body);
    if (violation) {
      addModerationEvent(db, req, "content_blocked", { type: "threads", reason: violation, title: item.title });
      await writeDb(db);
      sendJson(res, 400, { error: "post content was blocked", reason: violation });
      return;
    }
    if (duplicateThread(db, item, item.ownerAccountId)) {
      addModerationEvent(db, req, "duplicate_blocked", { type: "threads", title: item.title });
      await writeDb(db);
      sendJson(res, 409, { error: "duplicate post blocked" });
      return;
    }
    db.threads.unshift(item);
    await writeDb(db);
    sendJson(res, 201, publicItem(item, accountId(req)));
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/(recruitments|threads)\/([^/]+)\/(like|reply)$/);
  if (req.method === "POST" && actionMatch) {
    if (rejectBanned(db, req, res)) return;
    const [, type, id, action] = actionMatch;
    const collection = findCollection(db, type);
    const item = collection && collection.find(entry => entry.id === id);
    if (!item) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    if (action === "like") {
      const idForAccount = accountId(req);
      const index = item.likes.indexOf(idForAccount);
      if (index >= 0) item.likes.splice(index, 1);
      else item.likes.push(idForAccount);
    }
    if (action === "reply") {
      const body = await readBody(req);
      const reply = cleanText(body.body, 300);
      if (!reply) {
        sendJson(res, 400, { error: "reply body is required" });
        return;
      }
      const violation = contentViolation(reply);
      if (violation) {
        addModerationEvent(db, req, "content_blocked", { type, itemId: id, reason: violation });
        await writeDb(db);
        sendJson(res, 400, { error: "reply content was blocked", reason: violation });
        return;
      }
      if (duplicateReply(item, reply, accountId(req))) {
        addModerationEvent(db, req, "duplicate_blocked", { type, itemId: id });
        await writeDb(db);
        sendJson(res, 409, { error: "duplicate reply blocked" });
        return;
      }
      item.replies.push({
        id: crypto.randomUUID(),
        author: authorName(req),
        accountId: accountId(req),
        body: reply,
        createdAt: Date.now()
      });
    }
    await writeDb(db);
    sendJson(res, 200, publicItem(item, accountId(req)));
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/recruitments\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const item = db.recruitments.find(entry => entry.id === statusMatch[1]);
    if (!item) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    if (!isAdmin(req) && item.ownerAccountId !== accountId(req)) {
      sendJson(res, 403, { error: "only owner or admin can update this item" });
      return;
    }
    const body = await readBody(req);
    const nextStatus = cleanText(body.status, 20);
    if (!["open", "closed"].includes(nextStatus)) {
      sendJson(res, 400, { error: "invalid status" });
      return;
    }
    item.status = nextStatus;
    if (isAdmin(req)) {
      addAuditLog(db, req, "update_recruitment_status", {
        itemId: item.id,
        title: item.title,
        status: item.status
      });
    }
    await writeDb(db);
    sendJson(res, 200, publicItem(item, accountId(req), isAdmin(req)));
    return;
  }

  const joinMatch = url.pathname.match(/^\/api\/recruitments\/([^/]+)\/join$/);
  if (req.method === "POST" && joinMatch) {
    if (rejectBanned(db, req, res)) return;
    const item = db.recruitments.find(entry => entry.id === joinMatch[1]);
    if (!item) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    if (item.status === "closed") {
      sendJson(res, 400, { error: "recruitment is closed" });
      return;
    }
    item.participants = Array.isArray(item.participants) ? item.participants : [];
    const idForAccount = accountId(req);
    const index = item.participants.findIndex(participant => participant.accountId === idForAccount);
    if (index >= 0) {
      item.participants.splice(index, 1);
    } else {
      if (item.participants.length >= item.capacity) {
        sendJson(res, 400, { error: "recruitment is full" });
        return;
      }
      item.participants.push({
        accountId: idForAccount,
        name: authorName(req),
        joinedAt: Date.now()
      });
    }
    await writeDb(db);
    sendJson(res, 200, publicItem(item, accountId(req), isAdmin(req)));
    return;
  }

  const messageHideMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (req.method === "DELETE" && messageHideMatch) {
    if (!staffOnly(req, res)) return;
    const body = await readBody(req);
    const messageId = messageHideMatch[1];
    const message = (db.messages || []).find(entry => entry.id === messageId);
    if (!message) {
      sendJson(res, 404, { error: "message not found" });
      return;
    }
    if (message.status === "hidden") {
      sendJson(res, 200, { ok: true });
      return;
    }
    const moderationReason = cleanText(body.reason, 300) || "moderation_hide";
    message.status = "hidden";
    archiveDeletedItem(db, req, "message", {
      reason: moderationReason,
      message
    });
    db.reports = (db.reports || []).map(report => report.type === "messages" && report.itemId === messageId
      ? { ...report, status: "resolved", resolvedAt: Date.now(), resolution: "message_hidden" }
      : report);
    addAuditLog(db, req, "hide_message", {
      messageId,
      conversationId: message.conversationId || "",
      recruitmentId: message.recruitmentId || "",
      reason: moderationReason
    });
    addModerationEvent(db, req, "manual_hide", {
      type: "message",
      messageId,
      conversationId: message.conversationId || "",
      reason: moderationReason
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const replyDeleteMatch = url.pathname.match(/^\/api\/(recruitments|threads)\/([^/]+)\/replies\/([^/]+)$/);
  if (req.method === "DELETE" && replyDeleteMatch) {
    const [, type, itemId, replyId] = replyDeleteMatch;
    const body = await readBody(req);
    const moderationReason = cleanText(body.reason, 300) || (isStaff(req) ? "moderation_delete" : "owner_delete");
    const collection = findCollection(db, type);
    const item = collection && collection.find(entry => entry.id === itemId);
    if (!item) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    const replyIndex = item.replies.findIndex(reply => reply.id === replyId);
    if (replyIndex < 0) {
      sendJson(res, 404, { error: "reply not found" });
      return;
    }
    const reply = item.replies[replyIndex];
    const canDeleteReply = isStaff(req) || reply.accountId === accountId(req) || item.ownerAccountId === accountId(req);
    if (!canDeleteReply) {
      sendJson(res, 403, { error: "only owner or admin can delete this reply" });
      return;
    }
    archiveDeletedItem(db, req, "reply", {
      parentType: type,
      parentId: itemId,
      parentTitle: item.title,
      reason: moderationReason,
      reply
    });
    item.replies.splice(replyIndex, 1);
    db.reports = (db.reports || []).map(report => report.type === "replies" && (report.replyId === replyId || report.itemId === replyId)
      ? { ...report, status: "resolved", resolvedAt: Date.now(), resolution: "reply_deleted" }
      : report);
    if (isStaff(req)) {
      addAuditLog(db, req, "delete_reply", {
        type,
        itemId,
        replyId,
        title: item.title,
        reason: moderationReason
      });
      addModerationEvent(db, req, "manual_delete", {
        type: "reply",
        itemId,
        replyId,
        title: item.title,
        reason: moderationReason
      });
    }
    await writeDb(db);
    sendJson(res, 200, publicItem(item, accountId(req), isStaff(req)));
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/(recruitments|threads)\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const [, type, id] = deleteMatch;
    const body = await readBody(req);
    const moderationReason = cleanText(body.reason, 300) || (isStaff(req) ? "moderation_delete" : "owner_delete");
    const collection = findCollection(db, type);
    const index = collection ? collection.findIndex(entry => entry.id === id) : -1;
    if (index < 0) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    const item = collection[index];
    if (!isStaff(req) && item.ownerAccountId !== accountId(req)) {
      sendJson(res, 403, { error: "only owner or admin can delete this item" });
      return;
    }
    archiveDeletedItem(db, req, type, { item, reason: moderationReason });
    collection.splice(index, 1);
    db.reports = (db.reports || []).map(report => report.type === type && report.itemId === id || report.type === "replies" && report.parentType === type && report.parentId === id
      ? { ...report, status: "resolved", resolvedAt: Date.now(), resolution: "item_deleted" }
      : report);
    if (isStaff(req)) {
      addAuditLog(db, req, "delete_post", {
        type,
        itemId: id,
        title: item.title,
        reason: moderationReason
      });
      addModerationEvent(db, req, "manual_delete", {
        type,
        itemId: id,
        title: item.title,
        reason: moderationReason
      });
    }
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const reportResolveMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)\/resolve$/);
  if (req.method === "POST" && reportResolveMatch) {
    if (!staffOnly(req, res)) return;
    const report = (db.reports || []).find(entry => entry.id === reportResolveMatch[1]);
    if (!report) {
      sendJson(res, 404, { error: "report not found" });
      return;
    }
    report.status = "resolved";
    report.resolvedAt = Date.now();
    report.resolution = "action_taken";
    addAuditLog(db, req, "resolve_report", {
      reportId: report.id,
      itemId: report.itemId,
      type: report.type
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const reportRejectMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)\/reject$/);
  if (req.method === "POST" && reportRejectMatch) {
    if (!staffOnly(req, res)) return;
    const report = (db.reports || []).find(entry => entry.id === reportRejectMatch[1]);
    if (!report) {
      sendJson(res, 404, { error: "report not found" });
      return;
    }
    const body = await readBody(req);
    report.status = "rejected";
    report.resolvedAt = Date.now();
    report.resolution = cleanText(body.resolution, 300) || "no_action_needed";
    addAuditLog(db, req, "reject_report", {
      reportId: report.id,
      itemId: report.itemId,
      type: report.type,
      resolution: report.resolution
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const inquiryTriageMatch = url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/triage$/);
  if (req.method === "POST" && inquiryTriageMatch) {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const inquiry = (db.inquiries || []).find(entry => entry.id === inquiryTriageMatch[1]);
    if (!inquiry) {
      sendJson(res, 404, { error: "inquiry not found" });
      return;
    }
    applyBetaFeedbackTriage(inquiry, body);
    addAuditLog(db, req, "triage_inquiry", {
      inquiryId: inquiry.id,
      category: inquiry.category,
      betaFeedbackType: inquiry.betaFeedbackType || "",
      betaFeedbackPriority: inquiry.betaFeedbackPriority || ""
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const inquiryResolveMatch = url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/resolve$/);
  if (req.method === "POST" && inquiryResolveMatch) {
    if (!adminOnly(req, res)) return;
    const body = await readBody(req);
    const inquiry = (db.inquiries || []).find(entry => entry.id === inquiryResolveMatch[1]);
    if (!inquiry) {
      sendJson(res, 404, { error: "inquiry not found" });
      return;
    }
    applyBetaFeedbackTriage(inquiry, body);
    inquiry.resolutionNote = cleanText(body.resolutionNote, 500) || inquiry.resolutionNote || "";
    inquiry.status = "resolved";
    inquiry.resolvedAt = Date.now();
    addAuditLog(db, req, "resolve_inquiry", {
      inquiryId: inquiry.id,
      category: inquiry.category,
      betaFeedbackType: inquiry.betaFeedbackType || "",
      betaFeedbackPriority: inquiry.betaFeedbackPriority || "",
      resolutionNote: inquiry.resolutionNote || ""
    });
    await writeDb(db);
    sendJson(res, 200, { ok: true, inquiry });
    return;
  }

  sendJson(res, 404, { error: "unknown api route" });
}

async function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) {
    sendText(res, 405, "Method not allowed");
    return;
  }
  if (["GET", "HEAD"].includes(req.method) && url.pathname === "/.well-known/security.txt") {
    recordResponse(200, res.locals || {});
    res.writeHead(200, securityHeaders("text/plain; charset=utf-8", {
      "cache-control": "no-cache",
      ...requestHeaders(res)
    }));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(securityTxt());
    return;
  }
  if (["GET", "HEAD"].includes(req.method) && url.pathname === "/robots.txt") {
    recordResponse(200, res.locals || {});
    res.writeHead(200, securityHeaders("text/plain; charset=utf-8", {
      "cache-control": "no-cache",
      ...requestHeaders(res)
    }));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(robotsText());
    return;
  }
  if (["GET", "HEAD"].includes(req.method) && url.pathname === "/sitemap.xml") {
    const db = await readDb();
    recordResponse(200, res.locals || {});
    res.writeHead(200, securityHeaders("application/xml; charset=utf-8", {
      "cache-control": "no-cache",
      ...requestHeaders(res)
    }));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(sitemapXml(db));
    return;
  }
  if (["GET", "HEAD"].includes(req.method) && url.pathname === "/feed.xml") {
    const db = await readDb();
    recordResponse(200, res.locals || {});
    res.writeHead(200, securityHeaders("application/rss+xml; charset=utf-8", {
      "cache-control": "no-cache",
      ...requestHeaders(res)
    }));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(feedXml(db));
    return;
  }
  let safePath;
  try {
    safePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  } catch (error) {
    sendText(res, 400, "Bad request");
    return;
  }
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".xml": "application/xml; charset=utf-8",
      ".svg": "image/svg+xml; charset=utf-8"
    }[ext] || "application/octet-stream";
    const cacheControl = [".css", ".js", ".html"].includes(ext)
      ? "no-cache"
      : [".json", ".webmanifest", ".txt", ".xml", ".svg"].includes(ext)
        ? "public, max-age=300, must-revalidate"
        : "no-cache";
    recordResponse(200, res.locals || {});
    res.writeHead(200, securityHeaders(type, {
      "cache-control": cacheControl,
      ...requestHeaders(res)
    }));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const body = path.basename(filePath) === "index.html" ? homeHtml(data.toString("utf8")) : data;
    res.end(body);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.locals = { requestId: crypto.randomUUID(), method: req.method, pathname: url.pathname, startedAt: Date.now() };
  recordRequest(req, url);
  try {
    if (["GET", "HEAD"].includes(req.method) && url.pathname === "/healthz") {
      sendText(res, 200, "ok");
      return;
    }
    if (["GET", "HEAD"].includes(req.method) && url.pathname === "/readyz") {
      const db = await readDb();
      const health = healthSnapshot(db);
      sendJson(res, health.ready ? 200 : 503, {
        ok: health.ready,
        ready: health.ready,
        storage: health.storage,
        environment: health.environment,
        checks: health.checks.map(check => ({
          label: check.label,
          ok: check.ok,
          detail: check.detail
        })),
        generatedAt: health.generatedAt
      });
      return;
    }
    if (["GET", "HEAD"].includes(req.method) && url.pathname === "/status.json") {
      const db = await readDb();
      const health = healthSnapshot(db);
      sendJson(res, 200, {
        ok: true,
        ready: health.ready,
        deployment: deploymentInfo(),
        status: publicServiceStatus(),
        updatedAt: Date.now()
      });
      return;
    }
    if (["GET", "HEAD"].includes(req.method) && ["/status", "/status.html"].includes(url.pathname)) {
      const db = await readDb();
      sendHtml(res, 200, statusHtml(db));
      return;
    }
    const shareMatch = url.pathname.match(/^\/share\/(recruitments|threads)\/([^/]+)$/);
    if (req.method === "GET" && shareMatch) {
      await serveSharePage(req, res, shareMatch[1], shareMatch[2]);
      return;
    }
    if (url.pathname.startsWith("/auth/")) await handleAuth(req, res, url);
    else if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    runtimeMetrics.lastErrorAt = Date.now();
    runtimeMetrics.lastError = `${res.locals.requestId}: ${error.message}`;
    res.locals.error = error.message;
    const publicError = process.env.NODE_ENV === "production" ? "internal server error" : error.message;
    sendJson(res, 500, { error: publicError, requestId: res.locals.requestId });
  }
});

validateRuntimeConfig();

server.listen(port, async () => {
  await store.ensureDb();
  console.log(`Red Thread running at http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`Red Thread received ${signal}; shutting down`);
  const forceExit = setTimeout(() => {
    console.error("Red Thread shutdown timed out");
    process.exit(1);
  }, 8000);
  forceExit.unref();
  server.close(error => {
    if (error) {
      console.error(`Red Thread shutdown error: ${error.message}`);
      process.exit(1);
    }
    console.log("Red Thread shutdown complete");
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
