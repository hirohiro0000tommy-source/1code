const $ = selector => document.querySelector(selector);

const clientAccountKey = "partyfinder.client.account.v1";
const clientProfileKey = "partyfinder.client.profile.v1";
const betaAccessKey = "partyfinder.beta.access.v1";
const betaFeedbackSentKey = "partyfinder.beta.feedback.sent.v1";
const stateCacheKeyPrefix = "partyfinder.state.cache.v1";
const featuredGames = ["Shadowverse/Worlds Beyond", "Pokemon Champions", "Monster Hunter", "Apex", "VALORANT", "STREET FIGHTER 6", "Overwatch", "Splatoon", "その他"];
const styleOptions = ["初心者", "まったり", "エンジョイ", "ガチ"];
const recruitmentTemplates = {
  casual: {
    game: "その他",
    platform: "クロスプレイ",
    voice: "どちらでも",
    rank: "ランク不問",
    capacity: "4",
    style: "まったり",
    body: "軽めに遊べる人を募集しています。\n雰囲気重視で、初めての方も歓迎です。\n返信で参加希望を送ってください。"
  },
  ranked: {
    game: "VALORANT",
    platform: "PC",
    voice: "あり",
    rank: "ランク相談",
    capacity: "2",
    style: "ガチ",
    body: "ランク一緒に回せる方募集です。\n近いランク帯で、勝ちを目指しつつ落ち着いて遊べる方だと嬉しいです。\nランクだけ返信に書いてもらえれば大丈夫です。"
  },
  beginner: {
    game: "Monster Hunter",
    platform: "クロスプレイ",
    voice: "どちらでも",
    rank: "初心者",
    capacity: "4",
    style: "初心者",
    body: "初心者・復帰勢の方も歓迎です。\nミスっても気にしない感じで遊びたいです。\n気軽に返信どうぞ。"
  },
  noVoice: {
    game: "Splatoon",
    platform: "Switch",
    voice: "なし",
    rank: "ランク不問",
    capacity: "4",
    style: "エンジョイ",
    body: "VCなしで気軽に遊べる方を募集しています。\n短時間でも大丈夫です。\n返信で遊べる時間や希望ルールを書いてください。"
  },
  practice: {
    game: "STREET FIGHTER 6",
    platform: "クロスプレイ",
    voice: "どちらでも",
    rank: "ランク相談",
    capacity: "2",
    style: "ガチ",
    body: "対戦練習できる方を募集しています。\nキャラ対策や立ち回り確認をしながら遊びたいです。\n使用キャラとランクを書いてもらえると助かります。"
  }
};
const threadTemplates = {
  chat: {
    title: "最近遊んでいるゲームを話したい",
    category: "雑談",
    body: "最近遊んでいるゲームとか、気になっているタイトルの話がしたいです。\nおすすめがあればぜひ。"
  },
  event: {
    title: "大会観戦しながら話したい",
    category: "大会観戦",
    body: "大会や配信を見ながら話せる場所です。\n注目している試合や選手、見どころなど気軽にどうぞ。"
  },
  strategy: {
    title: "立ち回りや編成の相談",
    category: "攻略相談",
    body: "攻略や立ち回りについて相談したいです。\n使っているキャラやランク、困っている場面を書いてもらえると助かります。"
  },
  weekly: {
    title: "今週遊びたいゲーム",
    category: "雑談",
    body: "今週遊びたいゲームや、誰かと試したいモードを書いてみませんか。\n募集にするほど決まっていない話でも大丈夫です。"
  }
};
const recruitmentDraftKey = "partyfinder.draft.recruitment.v1";
const threadDraftKey = "partyfinder.draft.thread.v1";
const messageSeenKeyPrefix = "partyfinder.messages.seenAt.v1";
const recruitmentDraftFields = [
  "#gameInput",
  "#platformInput",
  "#voiceInput",
  "#rankInput",
  "#capacityInput",
  "#styleInput",
  "#messageInput"
];
const threadDraftFields = ["#chatTitleInput", "#chatCategoryInput", "#chatBodyInput"];
const rankOptionsByGame = {
  "Shadowverse/Worlds Beyond": ["Beginner", "Bronze", "Silver", "Gold", "Master", "Grand Master"],
  "Pokemon Champions": ["初心者", "ビギナー", "モンスターボール級", "スーパーボール級", "ハイパーボール級", "マスターボール級"],
  "Monster Hunter": ["初心者", "下位", "上位", "マスターランク", "HR上げ", "MR上げ"],
  Apex: ["ルーキー", "ブロンズ", "シルバー", "ゴールド", "プラチナ", "ダイヤ", "マスター", "プレデター"],
  VALORANT: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant"],
  "STREET FIGHTER 6": ["Rookie", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Legend"],
  Overwatch: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster", "Champion"],
  Splatoon: ["C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+", "S", "S+", "X"],
  その他: ["初心者", "中級者", "上級者", "ランク不問"]
};
let state = { recruitments: [], threads: [], messages: [], publicStatus: null };
let account = loadAccount();
let betaAccess = {
  required: false,
  granted: false,
  writePaused: false,
  code: localStorage.getItem(betaAccessKey) || ""
};
let toastTimer = null;
let adminInquiriesCache = [];
let adminBetaBacklogCache = null;
let myDataSummaryCache = null;
let lastXShareText = "";
const pendingActions = new Set();
const renderTimers = new Map();
let cacheSaveTimer = null;
let cacheSaveCancel = null;
const feedPageSize = 30;
const feedLimits = {
  recruitments: feedPageSize,
  threads: feedPageSize
};
const safeTagFilters = new Set();
const safeTagRules = [
  { label: "初心者歓迎", test: item => item.style === "初心者" || /初心者|初めて|復帰/u.test(`${item.body || ""} ${item.rank || ""}`) },
  { label: "VCなしOK", test: item => item.voice === "なし" || item.voice === "どちらでも" || /VCなし|聞き専|ボイチャなし/u.test(item.body || "") },
  { label: "短時間OK", test: item => /短時間|少しだけ|軽め|1戦|一戦/u.test(item.body || "") },
  { label: "まったり", test: item => item.style === "まったり" || /まったり|ゆるく|気軽/u.test(item.body || "") },
  { label: "ガチ", test: item => item.style === "ガチ" || /勝ち|練習|ランク|大会/u.test(item.body || "") }
];

function messageSeenKey() {
  return `${messageSeenKeyPrefix}.${account.id || "anonymous"}`;
}

function lastMessageSeenAt() {
  return Number(localStorage.getItem(messageSeenKey()) || 0);
}

function markMessagesSeen() {
  localStorage.setItem(messageSeenKey(), String(Date.now()));
  renderMessageNavBadge();
}

function stateCacheKey() {
  return `${stateCacheKeyPrefix}.${account.id || "anonymous"}`;
}

function loadCachedState(maxAgeMs = 5 * 60 * 1000) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(stateCacheKey()) || "null");
    if (!cached || Date.now() - Number(cached.savedAt || 0) > maxAgeMs) return false;
    state = cached.state || state;
    normalizeViewerFlags();
    renderAll();
    return true;
  } catch {
    sessionStorage.removeItem(stateCacheKey());
    return false;
  }
}

function writeCachedState() {
  try {
    sessionStorage.setItem(stateCacheKey(), JSON.stringify({ savedAt: Date.now(), state }));
  } catch {
    // Session storage can be unavailable or full; live data still works without it.
  }
}

function saveCachedState({ immediate = false } = {}) {
  if (cacheSaveTimer && cacheSaveCancel) {
    cacheSaveCancel(cacheSaveTimer);
    cacheSaveTimer = null;
    cacheSaveCancel = null;
  }
  if (immediate) {
    writeCachedState();
    return;
  }
  const hasIdleCallback = typeof window.requestIdleCallback === "function";
  const schedule = hasIdleCallback ? window.requestIdleCallback : callback => setTimeout(callback, 120);
  cacheSaveCancel = hasIdleCallback && typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback : clearTimeout;
  cacheSaveTimer = schedule(() => {
    cacheSaveTimer = null;
    cacheSaveCancel = null;
    writeCachedState();
  }, { timeout: 500 });
}

function beginPendingAction(key) {
  if (pendingActions.has(key)) return null;
  pendingActions.add(key);
  return () => pendingActions.delete(key);
}

function debounceRender(key, fn, delay = 90) {
  clearTimeout(renderTimers.get(key));
  renderTimers.set(key, setTimeout(() => {
    renderTimers.delete(key);
    fn();
  }, delay));
}

function resetFeedLimit(type) {
  feedLimits[type] = feedPageSize;
}

function loadAccount() {
  const saved = localStorage.getItem(clientAccountKey);
  if (saved) return { ...JSON.parse(saved), profile: loadProfile() };
  const next = { id: crypto.randomUUID(), name: "Anonymous", discord: "" };
  localStorage.setItem(clientAccountKey, JSON.stringify(next));
  return { ...next, profile: loadProfile() };
}

function saveAccount(next) {
  account = { ...next, profile: next.profile || account?.profile || loadProfile() };
  const { profile, ...storedAccount } = account;
  localStorage.setItem(clientAccountKey, JSON.stringify(storedAccount));
  saveProfile(profile);
}

function defaultProfile() {
  return {
    displayName: "",
    discordHandle: "",
    games: "",
    playTime: "",
    style: "未設定",
    bio: ""
  };
}

function loadProfile() {
  const saved = localStorage.getItem(clientProfileKey);
  if (!saved) return defaultProfile();
  try {
    return { ...defaultProfile(), ...JSON.parse(saved) };
  } catch {
    localStorage.removeItem(clientProfileKey);
    return defaultProfile();
  }
}

function saveProfile(profile) {
  localStorage.setItem(clientProfileKey, JSON.stringify({ ...defaultProfile(), ...(profile || {}) }));
}

function formDraft(fields) {
  return Object.fromEntries(fields.map(selector => [selector, $(selector)?.value || ""]));
}

function saveFormDraft(key, fields) {
  localStorage.setItem(key, JSON.stringify(formDraft(fields)));
}

function restoreFormDraft(key, fields) {
  const saved = localStorage.getItem(key);
  if (!saved) return;
  try {
    const values = JSON.parse(saved);
    fields.forEach(selector => {
      if ($(selector) && values[selector] !== undefined) $(selector).value = values[selector];
    });
  } catch {
    localStorage.removeItem(key);
  }
}

function bindFormDraft(key, fields) {
  restoreFormDraft(key, fields);
  fields.forEach(selector => {
    const field = $(selector);
    if (!field) return;
    field.addEventListener("input", () => saveFormDraft(key, fields));
    field.addEventListener("change", () => saveFormDraft(key, fields));
  });
}

function restoreRecruitmentDraft() {
  const saved = localStorage.getItem(recruitmentDraftKey);
  if (!saved) return;
  try {
    const values = JSON.parse(saved);
    if (values["#gameInput"] !== undefined) $("#gameInput").value = values["#gameInput"];
    renderRecruitmentFormOptions();
    recruitmentDraftFields.forEach(selector => {
      if ($(selector) && values[selector] !== undefined) $(selector).value = values[selector];
    });
    renderRecruitmentFormOptions();
  } catch {
    localStorage.removeItem(recruitmentDraftKey);
  }
}

function headers() {
  return {
    "content-type": "application/json",
    "x-account-id": account.id,
    "x-display-name": account.name,
    "x-admin-pin": $("#adminPinInput")?.value || "",
    "x-beta-code": betaAccess.code || ""
  };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });
  const requestId = res.headers.get("x-request-id") || "";
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const error = new Error(data.error || res.statusText || "request failed");
    error.status = res.status;
    error.requestId = data.requestId || requestId;
    error.reason = data.reason || "";
    error.expiresAt = data.expiresAt || null;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeAgo(time) {
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

function replyMatches(reply) {
  return reply.viewerOwned || reply.accountId === account.id;
}

function hasLiked(item) {
  return item.viewerLiked || false;
}

function normalizeViewerFlags() {
  state.recruitments.forEach(item => {
    item.viewerLiked = Array.isArray(item.likedBy) ? item.likedBy.includes(account.id) : !!item.viewerLiked;
  });
  state.threads.forEach(item => {
    item.viewerLiked = Array.isArray(item.likedBy) ? item.likedBy.includes(account.id) : !!item.viewerLiked;
  });
}

function adSlot(placement) {
  return (state.adSlots || []).find(slot => slot.placement === placement);
}

function isPlaceholderAdSlot(slot = {}) {
  const label = String(slot.label || "").trim();
  const targetUrl = String(slot.targetUrl || "").trim();
  const html = String(slot.html || "").replace(/<[^>]*>/g, " ").trim();
  return !targetUrl && !html || ["左広告", "右広告", "一覧内広告", "広告"].includes(label);
}

const adKindLabels = {
  affiliate: "アフィリエイト",
  sponsor: "スポンサー",
  community: "告知"
};

function adKindLabel(kind) {
  return adKindLabels[kind] || adKindLabels.affiliate;
}

function adMarkup(placement) {
  const slot = adSlot(placement);
  if (!slot || isPlaceholderAdSlot(slot)) return "";
  const label = slot?.label || "広告";
  const target = slot?.targetUrl || "#";
  if (slot?.html) return `<div class="ad-card">${slot.html}</div>`;
  return `
    <div class="ad-card">
      <span>広告 / ${escapeHtml(adKindLabel(slot.kind))}</span>
      <strong>${escapeHtml(label)}</strong>
      <span>Red Threadを応援するPR枠です。</span>
      ${target !== "#" ? `<a class="btn" href="${escapeHtml(target)}" rel="sponsored noopener noreferrer" target="_blank">詳しく見る</a>` : ""}
    </div>
  `;
}

function renderAds() {
  document.querySelectorAll("[data-ad-slot='left-rail']").forEach(slot => {
    const markup = adMarkup("left_rail");
    slot.innerHTML = markup;
    slot.hidden = !markup;
  });
  document.querySelectorAll("[data-ad-slot='right-rail']").forEach(slot => {
    const markup = adMarkup("right_rail");
    slot.innerHTML = markup;
    slot.hidden = !markup;
  });
}

function renderAnnouncements() {
  const announcements = state.announcements || [];
  if (!announcements.length) {
    $("#announcementList").innerHTML = "";
    return;
  }
  $("#announcementList").innerHTML = announcements.map(item => `
    <article class="announcement ${escapeHtml(item.tone || "info")}">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.body)}</p>
    </article>
  `).join("");
}

function renderServiceStatus() {
  const status = state.publicStatus;
  const container = $("#serviceStatus");
  if (!status || status.mode === "open") {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.className = `service-status ${escapeHtml(status.mode || "open")}`;
  container.innerHTML = `
    <strong>${escapeHtml(status.label || "運用状況")}</strong>
    <span>${escapeHtml(status.message || "")}</span>
  `;
}

async function loadState() {
  const data = await api("/api/state");
  state = data;
  normalizeViewerFlags();
  saveCachedState();
  renderAll();
}

function collectionForType(type) {
  return type === "threads" ? state.threads : state.recruitments;
}

function renderItemLists(type) {
  normalizeViewerFlags();
  renderActivitySummaries();
  renderQuickSections();
  renderWeeklySummary();
  const activeView = activeViewId();
  if (type === "threads") {
    if (activeView === "chatView") renderThreads();
  } else if (activeView === "recruitmentView") {
    renderRecruitments();
  }
  if (activeView === "reminderView") renderReminder();
  if (activeView === "myView") renderMyPage();
}

function upsertStateItem(type, item) {
  const collection = collectionForType(type);
  const index = collection.findIndex(entry => entry.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.unshift(item);
  saveCachedState();
  renderItemLists(type);
}

function removeStateItem(type, id) {
  const collection = collectionForType(type);
  const index = collection.findIndex(entry => entry.id === id);
  if (index >= 0) collection.splice(index, 1);
  saveCachedState();
  renderItemLists(type);
}

function cloneStateItem(item) {
  return item ? JSON.parse(JSON.stringify(item)) : null;
}

function stateItem(type, id) {
  return collectionForType(type).find(item => item.id === id) || null;
}

function updateStateItem(type, id, updater) {
  const item = stateItem(type, id);
  const previous = cloneStateItem(item);
  if (!item) return previous;
  updater(item);
  saveCachedState();
  renderItemLists(type);
  return previous;
}

function restoreStateItem(type, previous) {
  if (!previous) return;
  upsertStateItem(type, previous);
}

async function syncServerAccount() {
  const data = await api("/api/me");
  if (data.account) saveAccount({ ...account, ...data.account, profile: account.profile || loadProfile() });
  account.suspension = data.suspension || { active: false };
  betaAccess.required = !!data.betaAccessRequired;
  betaAccess.granted = !!data.betaAccessGranted;
  betaAccess.writePaused = !!data.betaWritePaused;
}

function renderAccount() {
  $("#accountName").textContent = account.name === "Anonymous" ? "表示名未設定" : `${account.name} で利用中`;
  const suspension = account.suspension || {};
  const expires = suspension.expiresAt ? ` / ${new Date(suspension.expiresAt).toLocaleDateString("ja-JP")}まで` : "";
  $("#accountStatus").textContent = suspension.active
    ? `利用制限中: ${suspension.reason || "moderation"}${expires}`
    : account.discord ? "Discordログイン済み" : "表示名だけでも使えます。Discordログインは任意です。";
  $("#accountPanel").classList.toggle("suspended", !!suspension.active);
  $("#loginToggleButton").style.display = account.name === "Anonymous" ? "inline-flex" : "none";
  $("#logoutButton").style.display = account.name === "Anonymous" ? "none" : "inline-flex";
}

function renderMessageNavBadge() {
  const badge = $("#navMessageBadge");
  const seenAt = lastMessageSeenAt();
  const count = (state.messages || []).filter(conversation => Number(conversation.lastMessageAt || 0) > seenAt).length;
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? "99+" : String(count);
}

function profileValues() {
  return { ...defaultProfile(), ...(account.profile || {}) };
}

function profileGames(profile) {
  return profile.games
    .split(/[,、]/)
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function publicProfile(profile = profileValues()) {
  const normalized = { ...defaultProfile(), ...(profile || {}) };
  return {
    displayName: normalized.displayName || (account.name === "Anonymous" ? "Anonymous" : account.name),
    discordHandle: normalized.discordHandle,
    games: normalized.games,
    playTime: "",
    style: normalized.style || "未設定",
    bio: normalized.bio
  };
}

function renderProfileGameOptions(selectedGames = []) {
  const container = $("#profileGamesInput");
  if (!container) return;
  const selected = new Set(selectedGames);
  container.innerHTML = gameOptions().map(game => `
    <label><input type="checkbox" value="${escapeHtml(game)}" ${selected.has(game) ? "checked" : ""}>${escapeHtml(game)}</label>
  `).join("");
  syncCheckListLabels(container);
}

function renderProfile() {
  const profile = profileValues();
  const displayName = profile.displayName || (account.name === "Anonymous" ? "Anonymous" : account.name);
  $("#profileDisplayName").textContent = displayName;
  $("#profileStyleBadge").textContent = profile.style || "未設定";
  $("#profileBio").textContent = profile.bio || "よく遊ぶゲームや雰囲気を少し書いておくと、声をかけやすくなります。";
  const discordHandle = (profile.discordHandle || "").trim();
  $("#profileDiscord").textContent = discordHandle ? `Discord: ${discordHandle}` : "Discord未設定";
  $("#profileDiscord").hidden = !discordHandle;
  const games = profileGames(profile);
  $("#profileGameTags").innerHTML = games.length
    ? games.map(game => `<span>${escapeHtml(game)}</span>`).join("")
    : `<span>ゲーム未設定</span>`;
  $("#profileNameInput").value = profile.displayName || (account.name === "Anonymous" ? "" : account.name);
  $("#profileDiscordInput").value = profile.discordHandle || "";
  renderProfileGameOptions(games);
  $("#profileStyleInput").value = profile.style || "未設定";
  $("#profileBioInput").value = profile.bio;
}

function renderBetaAccess() {
  const panel = $("#betaAccessPanel");
  const notice = $("#betaNotice");
  const checklist = $("#betaChecklist");
  const quickStart = $("#betaQuickStart");
  if (!betaAccess.required && !betaAccess.writePaused) {
    panel.hidden = true;
    notice.hidden = true;
    checklist.hidden = true;
    quickStart.hidden = true;
    return;
  }
  panel.hidden = false;
  notice.hidden = false;
  checklist.hidden = !betaAccess.granted || betaAccess.writePaused;
  quickStart.hidden = !betaAccess.granted || betaAccess.writePaused;
  $("#betaAccessInput").value = betaAccess.code;
  $("#betaAccessStatus").textContent = betaAccess.writePaused
    ? "いまは投稿を一時停止中です。閲覧、通報、お問い合わせは使えます。"
    : betaAccess.granted
      ? "参加コードOK。投稿できます。"
      : "投稿や返信には参加コードが必要です。";
  panel.classList.toggle("verified", betaAccess.granted && !betaAccess.writePaused);
  panel.classList.toggle("paused", betaAccess.writePaused);
}

function renderBetaChecklist() {
  const checklist = $("#betaChecklist");
  if (!betaAccess.required || !betaAccess.granted || betaAccess.writePaused) {
    checklist.hidden = true;
    return;
  }
  const tasks = [
    {
      id: "recruitment",
      label: "募集をひとつ書く",
      done: state.recruitments.some(item => item.viewerOwned),
      action: "募集を書く"
    },
    {
      id: "thread",
      label: "話題をひとつ書く",
      done: state.threads.some(item => item.viewerOwned),
      action: "話題を書く"
    },
    {
      id: "feedback",
      label: "感想を送る",
      done: localStorage.getItem(betaFeedbackSentKey) === "1",
      action: "送る"
    }
  ];
  const doneCount = tasks.filter(task => task.done).length;
  $("#betaChecklistStatus").textContent = `${doneCount}/${tasks.length} 済み`;
  $("#betaTaskList").innerHTML = tasks.map(task => `
    <div class="beta-task ${task.done ? "done" : ""}">
      <strong>${task.done ? "OK" : "まだ"}</strong>
      <span>${escapeHtml(task.label)}</span>
      <button type="button" data-beta-task="${escapeHtml(task.id)}">${escapeHtml(task.done ? "見る" : task.action)}</button>
    </div>
  `).join("");
}

function updateCreateButton(viewId = document.querySelector(".view.active")?.id || "recruitmentView") {
  const button = $("#openRecruitFormButton");
  if (viewId === "chatView") {
    button.textContent = $("#chatLayout").classList.contains("form-open") ? "入力欄を閉じる" : "スレッドを投稿";
    return;
  }
  button.textContent = $("#recruitmentLayout").classList.contains("form-open") ? "入力欄を閉じる" : "募集を投稿";
}

function focusCreateForm(viewId) {
  requestAnimationFrame(() => {
    const target = viewId === "chatView" ? $("#chatTitleInput") : $("#gameInput");
    target?.focus();
  });
}

function updateFormStatus() {
  const recruitmentStatus = $("#recruitmentFormStatus");
  const chatStatus = $("#chatFormStatus");
  const messageLength = $("#messageInput")?.value.trim().length || 0;
  const chatTitleLength = $("#chatTitleInput")?.value.trim().length || 0;
  const chatBodyLength = $("#chatBodyInput")?.value.trim().length || 0;
  if (recruitmentStatus) recruitmentStatus.textContent = `本文 ${messageLength}/500`;
  if (chatStatus) chatStatus.textContent = `タイトル ${chatTitleLength}/72 / 本文 ${chatBodyLength}/500`;
}

function switchView(viewId) {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === viewId));
  document.querySelectorAll(".view").forEach(view => {
    const active = view.id === viewId;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  $("#recruitmentLayout").classList.remove("form-open");
  $("#chatLayout").classList.remove("form-open");
  updateCreateButton(viewId);
  renderView(viewId);
  if (viewId === "myView") {
    markMessagesSeen();
    loadMyDataSummary().catch(showErrorToast);
  }
}

function checkedValues(selector) {
  return [...document.querySelectorAll(`${selector} input:checked`)].map(input => input.value);
}

function syncCheckedLabel(label) {
  if (!label) return;
  const input = label.querySelector("input[type='checkbox']");
  if (!input) return;
  label.classList.toggle("checked", input.checked);
}

function syncCheckListLabels(root = document) {
  root.querySelectorAll(".check-list label").forEach(syncCheckedLabel);
}

function renderCheckList(selector, values) {
  const container = $(selector);
  const current = checkedValues(selector);
  container.innerHTML = values.map(value => `
    <label><input type="checkbox" value="${escapeHtml(value)}" ${current.includes(value) ? "checked" : ""}>${escapeHtml(value)}</label>
  `).join("");
  syncCheckListLabels(container);
}

function rankOptionsForGame(game) {
  const values = ["ランク不問", "ランク相談", ...(rankOptionsByGame[game] || [])];
  for (const post of state.recruitments) {
    if (post.game === game && post.rank) values.push(post.rank);
  }
  return [...new Set(values)];
}

function gameOptions() {
  return [...new Set([...featuredGames, ...state.recruitments.map(post => post.game).filter(Boolean)])]
    .sort((a, b) => {
      if (a === "その他") return 1;
      if (b === "その他") return -1;
      const ai = featuredGames.indexOf(a);
      const bi = featuredGames.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b, "ja");
    });
}

function renderSelectOptions(select, values, currentValue = "") {
  const nextValue = currentValue && values.includes(currentValue) ? currentValue : values[0] || "";
  select.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = nextValue;
}

function renderRecruitmentFormOptions() {
  const gameSelect = $("#gameInput");
  const rankSelect = $("#rankInput");
  const currentGame = gameSelect.value;
  renderSelectOptions(gameSelect, gameOptions(), currentGame);
  renderSelectOptions(rankSelect, rankOptionsForGame(gameSelect.value), rankSelect.value);
}

function renderRankFilter() {
  const container = $("#rankFilter");
  const current = checkedValues("#rankFilter");
  const selectedGames = checkedValues("#gameFilter");
  if (!selectedGames.length) {
    container.innerHTML = `<div class="empty inline">ゲームカテゴリを選ぶと、そのゲームのランク帯が表示されます。</div>`;
    syncCheckListLabels(container);
    return;
  }
  container.innerHTML = selectedGames.map(game => {
    const ranks = rankOptionsForGame(game);
    const options = ranks.length
      ? ranks.map(rank => `<label><input type="checkbox" value="${escapeHtml(rank)}" ${current.includes(rank) ? "checked" : ""}>${escapeHtml(rank)}</label>`).join("")
      : `<span class="muted">ランク候補はまだありません。</span>`;
    return `
      <div class="rank-group">
        <strong>${escapeHtml(game)}</strong>
        <div class="check-list">${options}</div>
      </div>
    `;
  }).join("");
  syncCheckListLabels(container);
}

function refreshGameFilter() {
  renderCheckList("#gameFilter", gameOptions());
  renderRankFilter();
  renderCheckList("#styleFilter", styleOptions);
}

function visibleRecruitments() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const games = checkedValues("#gameFilter");
  const platforms = checkedValues("#platformFilter");
  const voices = checkedValues("#voiceFilter");
  const ranks = checkedValues("#rankFilter");
  const styles = checkedValues("#styleFilter");
  const tags = [...safeTagFilters];
  const sort = $("#sortInput").value;
  return [...state.recruitments].filter(post => {
    const text = `${post.title} ${post.game} ${post.platform} ${post.voice} ${post.rank} ${post.style} ${post.body}`.toLowerCase();
    return text.includes(query)
      && (!games.length || games.includes(post.game))
      && (!platforms.length || platforms.includes(post.platform))
      && (!voices.length || voices.includes(post.voice))
      && (!ranks.length || ranks.includes(post.rank))
      && (!styles.length || styles.includes(post.style))
      && (!tags.length || tags.every(tag => safeTags(post).includes(tag)));
  }).sort((a, b) => {
    if ((a.status === "closed") !== (b.status === "closed")) return a.status === "closed" ? 1 : -1;
    if (sort === "active") return (b.lastActivityAt || b.createdAt) - (a.lastActivityAt || a.createdAt);
    if (sort === "like") return b.likeCount - a.likeCount;
    if (sort === "reply") return b.replies.length - a.replies.length;
    return b.createdAt - a.createdAt;
  });
}

function visibleThreads() {
  const query = $("#chatSearchInput").value.trim().toLowerCase();
  const categories = checkedValues("#chatCategoryFilter");
  const sort = $("#chatSortInput").value;
  return [...state.threads].filter(post => {
    const text = `${post.title} ${post.category} ${post.author} ${post.body}`.toLowerCase();
    return text.includes(query) && (!categories.length || categories.includes(post.category));
  })
    .sort((a, b) => {
      if (sort === "active") return (b.lastActivityAt || b.createdAt) - (a.lastActivityAt || a.createdAt);
      if (sort === "like") return b.likeCount - a.likeCount;
      if (sort === "reply") return b.replies.length - a.replies.length;
      return b.createdAt - a.createdAt;
    });
}

function filterChip(item, scope) {
  return `
    <button class="filter-chip" type="button" data-filter-remove="${escapeHtml(scope)}:${escapeHtml(item.key)}:${escapeHtml(item.value)}" title="${escapeHtml(item.value)}を外す">
      <strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.value)}<span aria-hidden="true">x</span>
    </button>
  `;
}

function renderFilterSummary(selector, labels, clearAction) {
  const container = $(selector);
  if (!container) return;
  if (!labels.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = `
    <div class="filter-summary-list">${labels.map(item => filterChip(item, clearAction)).join("")}</div>
    <button class="link-action" type="button" data-filter-clear="${escapeHtml(clearAction)}">条件を解除</button>
  `;
}

function recruitmentFilterLabels() {
  const labels = [];
  const query = $("#searchInput").value.trim();
  if (query) labels.push({ key: "query", label: "キーワード", value: query });
  checkedValues("#gameFilter").forEach(value => labels.push({ key: "game", label: "ゲーム", value }));
  checkedValues("#platformFilter").forEach(value => labels.push({ key: "platform", label: "機種", value }));
  checkedValues("#voiceFilter").forEach(value => labels.push({ key: "voice", label: "VC", value }));
  checkedValues("#rankFilter").forEach(value => labels.push({ key: "rank", label: "ランク", value }));
  checkedValues("#styleFilter").forEach(value => labels.push({ key: "style", label: "スタイル", value }));
  [...safeTagFilters].forEach(value => labels.push({ key: "safe", label: "安心タグ", value }));
  return labels;
}

function chatFilterLabels() {
  const labels = [];
  const query = $("#chatSearchInput").value.trim();
  if (query) labels.push({ key: "query", label: "キーワード", value: query });
  checkedValues("#chatCategoryFilter").forEach(value => labels.push({ key: "category", label: "カテゴリ", value }));
  return labels;
}

function clearChecks(selector) {
  document.querySelectorAll(`${selector} input[type='checkbox']`).forEach(input => {
    input.checked = false;
    syncCheckedLabel(input.closest("label"));
  });
}

function uncheckValue(selector, value) {
  document.querySelectorAll(`${selector} input[type='checkbox']`).forEach(input => {
    if (input.value === value) {
      input.checked = false;
      syncCheckedLabel(input.closest("label"));
    }
  });
}

function removeRecruitmentFilter(key, value) {
  if (key === "query") $("#searchInput").value = "";
  if (key === "game") uncheckValue("#gameFilter", value);
  if (key === "platform") uncheckValue("#platformFilter", value);
  if (key === "voice") uncheckValue("#voiceFilter", value);
  if (key === "rank") uncheckValue("#rankFilter", value);
  if (key === "style") uncheckValue("#styleFilter", value);
  if (key === "safe") safeTagFilters.delete(value);
  renderRankFilter();
  resetFeedLimit("recruitments");
  renderRecruitments();
}

function removeChatFilter(key, value) {
  if (key === "query") $("#chatSearchInput").value = "";
  if (key === "category") uncheckValue("#chatCategoryFilter", value);
  resetFeedLimit("threads");
  renderThreads();
}

function clearRecruitmentFilters() {
  $("#searchInput").value = "";
  clearChecks("#gameFilter");
  clearChecks("#platformFilter");
  clearChecks("#voiceFilter");
  clearChecks("#rankFilter");
  clearChecks("#styleFilter");
  safeTagFilters.clear();
  feedLimits.recruitments = feedPageSize;
  renderRankFilter();
  renderRecruitments();
}

function clearChatFilters() {
  $("#chatSearchInput").value = "";
  clearChecks("#chatCategoryFilter");
  feedLimits.threads = feedPageSize;
  renderThreads();
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key] || "その他";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, 8);
}

function renderActivityStrip(selector, entries, type) {
  const container = $(selector);
  if (!entries.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <span class="activity-label">動きあり</span>
    ${entries.map(([label, count]) => `
      <button class="activity-chip" type="button" data-activity-type="${type}" data-value="${escapeHtml(label)}">
        <strong>${escapeHtml(label)}</strong><span>${count}件</span>
      </button>
    `).join("")}
  `;
}

function renderActivitySummaries() {
  renderActivityStrip("#gameActivity", countBy(state.recruitments.filter(item => item.status !== "closed"), "game"), "game");
  renderActivityStrip("#chatActivity", countBy(state.threads, "category"), "category");
}

function safeTags(item) {
  return safeTagRules
    .filter(rule => rule.test(item))
    .slice(0, 4)
    .map(rule => rule.label);
}

function safeTagMarkup(item) {
  const tags = safeTags(item);
  if (!tags.length) return "";
  return `<div class="safe-tags">${tags.map(tag => `<button type="button" class="${safeTagFilters.has(tag) ? "active" : ""}" data-safe-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join("")}</div>`;
}

function hotRecruitments() {
  return [...state.recruitments]
    .filter(item => item.status !== "closed")
    .sort((a, b) => {
      const scoreA = Number(a.likeCount || 0) * 2 + (a.replies?.length || 0) * 3 + Number(a.participantCount || 0) * 2 + Number(a.lastActivityAt || a.createdAt || 0) / 1000000000000;
      const scoreB = Number(b.likeCount || 0) * 2 + (b.replies?.length || 0) * 3 + Number(b.participantCount || 0) * 2 + Number(b.lastActivityAt || b.createdAt || 0) / 1000000000000;
      return scoreB - scoreA;
    })
    .slice(0, 3);
}

function todayRecruitments() {
  const dayMs = 24 * 60 * 60 * 1000;
  return [...state.recruitments]
    .filter(item => item.status !== "closed")
    .filter(item => Date.now() - Number(item.lastActivityAt || item.createdAt || 0) <= dayMs)
    .sort((a, b) => Number(b.lastActivityAt || b.createdAt || 0) - Number(a.lastActivityAt || a.createdAt || 0))
    .slice(0, 3);
}

function renderQuickSections() {
  const container = $("#recruitmentQuickSection");
  if (!container) return;
  const today = todayRecruitments();
  const hot = hotRecruitments();
  const games = countBy(state.recruitments.filter(item => item.status !== "closed"), "game").slice(0, 6);
  if (!today.length && !hot.length && !games.length) {
    container.innerHTML = `
      <div class="quick-card guide">
        <div><strong>募集の入口</strong><span>最初の投稿が増えると、ここに今日遊べる募集や人気ゲームが出ます。</span></div>
        <div class="quick-list">
          <button type="button" data-guide-jump="recruitment"><strong>募集を書く</strong><span>テンプレートから始められます</span></button>
          <button type="button" data-guide-jump="referral"><strong>紹介する</strong><span>XやDiscordに貼れるURL</span></button>
        </div>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <div class="quick-card">
      <div><strong>今日遊べる募集</strong><span>${today.length ? "直近で動きがある募集です。" : "動きが出たらここに表示されます。"}</span></div>
      <div class="quick-list">${today.map(item => quickPostButton(item, "recruitments")).join("") || `<span class="muted">まだありません</span>`}</div>
    </div>
    <div class="quick-card">
      <div><strong>人気・動きあり</strong><span>反応が集まりやすい投稿です。</span></div>
      <div class="quick-list">${hot.map(item => quickPostButton(item, "recruitments")).join("") || `<span class="muted">まだありません</span>`}</div>
    </div>
    <div class="quick-card">
      <div><strong>ゲーム別入口</strong><span>ゲームを選ぶと募集を絞り込めます。</span></div>
      <div class="quick-list">${games.map(([game, count]) => `<button type="button" data-game-entry="${escapeHtml(game)}">${escapeHtml(game)}<span>${escapeHtml(count)}件</span></button>`).join("")}</div>
    </div>
  `;
}

function quickPostButton(item, type) {
  const activity = item.lastReplyAt ? `返信 ${timeAgo(item.lastReplyAt)}` : `投稿 ${timeAgo(item.createdAt)}`;
  return `<button type="button" data-quick-post="${escapeHtml(type)}:${escapeHtml(item.id)}"><strong>${escapeHtml(item.game || item.category || "投稿")}</strong><span>${escapeHtml(item.title || item.body || "開く")}</span><em>${escapeHtml(activity)}</em></button>`;
}

function renderWeeklySummary() {
  const container = $("#weeklySummary");
  if (!container) return;
  const dayMs = 7 * 24 * 60 * 60 * 1000;
  const recentRecruitments = state.recruitments.filter(item => Date.now() - Number(item.createdAt || 0) <= dayMs);
  const recentThreads = state.threads.filter(item => Date.now() - Number(item.createdAt || 0) <= dayMs);
  const topGame = countBy(recentRecruitments, "game")[0];
  const topCategory = countBy(recentThreads, "category")[0];
  container.innerHTML = `
    <div><strong>週次まとめ</strong><span>直近7日</span></div>
    <div class="weekly-grid">
      <span>募集 ${escapeHtml(recentRecruitments.length)}件</span>
      <span>フリートーク ${escapeHtml(recentThreads.length)}件</span>
      <span>多いゲーム ${escapeHtml(topGame ? `${topGame[0]} ${topGame[1]}件` : "まだなし")}</span>
      <span>多い話題 ${escapeHtml(topCategory ? `${topCategory[0]} ${topCategory[1]}件` : "まだなし")}</span>
    </div>
  `;
}

function renderWeeklyTopic() {
  const container = $("#weeklyTopic");
  if (!container) return;
  const threadCount = state.threads.filter(item => item.category === "雑談").length;
  const eventCount = state.threads.filter(item => item.category === "大会観戦").length;
  const strategyCount = state.threads.filter(item => item.category === "攻略相談").length;
  container.innerHTML = `
    <div>
      <strong>今週のお題</strong>
      <span>今週遊びたいゲーム、気になっている大会、攻略で詰まっていることを書いてみませんか。</span>
      <div class="topic-counts"><span>雑談 ${escapeHtml(threadCount)}</span><span>大会観戦 ${escapeHtml(eventCount)}</span><span>攻略相談 ${escapeHtml(strategyCount)}</span></div>
    </div>
    <button class="btn ghost" type="button" data-template="thread:weekly">お題で書く</button>
  `;
}

function applyRecruitmentTemplate(key) {
  const template = recruitmentTemplates[key];
  if (!template) return;
  $("#gameInput").value = template.game;
  renderRecruitmentFormOptions();
  $("#platformInput").value = template.platform;
  $("#voiceInput").value = template.voice;
  $("#rankInput").value = template.rank;
  $("#capacityInput").value = template.capacity;
  $("#styleInput").value = template.style;
  $("#messageInput").value = template.body;
  saveFormDraft(recruitmentDraftKey, recruitmentDraftFields);
  updateFormStatus();
  $("#messageInput").focus();
}

function applyThreadTemplate(key) {
  const template = threadTemplates[key];
  if (!template) return;
  $("#chatTitleInput").value = template.title;
  $("#chatCategoryInput").value = template.category;
  $("#chatBodyInput").value = template.body;
  saveFormDraft(threadDraftKey, threadDraftFields);
  updateFormStatus();
  $("#chatBodyInput").focus();
}

function sampleBody(body = "") {
  return String(body)
    .replace(/^公式の(?:募集例|話題出し)です。\n?/, "")
    .trim();
}

function useSamplePost(type, id) {
  const item = stateItem(type, id);
  if (!item || !item.isOfficial) return;
  if (type === "threads") {
    switchView("chatView");
    $("#chatLayout").classList.add("form-open");
    updateCreateButton("chatView");
    $("#chatTitleInput").value = item.title || "";
    $("#chatCategoryInput").value = item.category || "雑談";
    $("#chatBodyInput").value = sampleBody(item.body);
    saveFormDraft(threadDraftKey, threadDraftFields);
    updateFormStatus();
    focusCreateForm("chatView");
    showToast("見本を入力しました", "内容を少し書き換えて投稿できます。");
    return;
  }
  switchView("recruitmentView");
  $("#recruitmentLayout").classList.add("form-open");
  updateCreateButton("recruitmentView");
  $("#gameInput").value = item.game || "その他";
  renderRecruitmentFormOptions();
  $("#platformInput").value = item.platform || "クロスプレイ";
  $("#voiceInput").value = item.voice || "どちらでも";
  $("#rankInput").value = item.rank || "ランク不問";
  $("#capacityInput").value = item.capacity || 4;
  $("#styleInput").value = item.style || "エンジョイ";
  $("#messageInput").value = sampleBody(item.body);
  saveFormDraft(recruitmentDraftKey, recruitmentDraftFields);
  updateFormStatus();
  focusCreateForm("recruitmentView");
  showToast("見本を入力しました", "雰囲気や条件を少し書き換えて投稿できます。");
}

function actionButtons(item) {
  const liked = hasLiked(item);
  const joinButton = item.capacity && !item.isOfficial
    ? `<button class="action primary" data-action="join">${item.viewerJoined ? "参加取消" : "参加希望"}</button>`
    : "";
  const messageButton = item.canMessage
    ? `<button class="action" data-action="message" title="募集者へメッセージ">メッセージ</button>`
    : "";
  const statusButton = item.status && item.canManage
    ? `<button class="action" data-action="status">${item.status === "closed" ? "再開" : "締切"}</button>`
    : "";
  return `
    <button class="action" data-action="like" title="${liked ? "いいね解除" : "いいね"}">${liked ? "♥" : "♡"} ${item.likeCount}</button>
    ${joinButton}
    ${messageButton}
    <button class="action" data-action="reply" title="返信">↩ ${item.replies.length}</button>
    <button class="action" data-action="share" title="共有">共有</button>
    <button class="action" data-action="copy-x" title="X告知文をコピー">X告知</button>
    <button class="action" data-action="report" title="通報">通報</button>
    ${statusButton}
    ${item.canDelete ? `<button class="action delete" data-action="delete" title="削除">削除</button>` : ""}
  `;
}

function replyMarkup(reply) {
  return `
    <div class="reply" data-reply-id="${escapeHtml(reply.id || "")}">
      <div><strong>${escapeHtml(reply.author)}</strong>: ${escapeHtml(reply.body)}</div>
      <div class="reply-actions">
        <button class="reply-action" type="button" data-action="report-reply">通報</button>
        ${reply.canDelete ? `<button class="reply-action delete" type="button" data-action="delete-reply">削除</button>` : ""}
      </div>
    </div>
  `;
}

function activityBadge(post) {
  if (!post.lastReplyAt) return "";
  return `<span class="badge light">返信 ${timeAgo(post.lastReplyAt)}</span>`;
}

function engagementSummary(post, type) {
  const latestAt = post.lastReplyAt || post.createdAt;
  const items = type === "recruitments"
    ? [
        post.isOfficial ? "公式例" : `参加 ${post.participantCount || 0}/${post.capacity || 4}`,
        `返信 ${post.replies?.length || 0}`,
        `いいね ${post.likeCount || 0}`,
        `更新 ${timeAgo(latestAt)}`
      ]
    : [
        `返信 ${post.replies?.length || 0}`,
        `いいね ${post.likeCount || 0}`,
        `更新 ${timeAgo(latestAt)}`
      ];
  return `<div class="card-summary">${items.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function shareUrl(type, id) {
  return `${window.location.origin}/share/${type}/${encodeURIComponent(id)}`;
}

function referralShareUrl(type, id, ref = "x") {
  return `${shareUrl(type, id)}?ref=${encodeURIComponent(ref)}`;
}

function xShareText(type, item) {
  const isThread = type === "threads";
  const title = item.title || (isThread ? "フリートーク" : "ゲーム仲間募集");
  const lines = isThread
    ? [
        "Red Threadで話題を出しました",
        `「${title}」`,
        item.category ? `カテゴリ: ${item.category}` : "",
        referralShareUrl(type, item.id, "x"),
        "#RedThread #ゲーム仲間募集"
      ]
    : [
        "Red Threadでゲーム仲間を募集しています",
        `ゲーム: ${item.game || "その他"}`,
        item.rank && item.rank !== "ランク不問" ? `ランク: ${item.rank}` : "",
        item.style ? `雰囲気: ${item.style}` : "",
        referralShareUrl(type, item.id, "x"),
        "#RedThread #ゲーム仲間募集"
      ];
  return lines.filter(Boolean).join("\n");
}

function appHash(type, id) {
  return `#${type}:${encodeURIComponent(id)}`;
}

function recruitmentProfileMarkup(post) {
  const profile = { ...defaultProfile(), ...(post.authorProfile || {}) };
  const displayName = profile.displayName || post.author || "Anonymous";
  const games = profileGames(profile);
  const style = profile.style || "未設定";
  const discordHandle = (profile.discordHandle || "").trim();
  const bio = profile.bio || "プロフィールはまだありません。";
  return `
    <details class="poster-profile">
      <summary>
        <span class="poster-profile-name">募集者: ${escapeHtml(displayName)}</span>
        <span class="poster-profile-cue">プロフィール</span>
      </summary>
      <div class="poster-profile-body">
        <strong>${escapeHtml(displayName)}</strong>
        <div class="poster-profile-meta">
          <span>${escapeHtml(style)}</span>
          ${discordHandle ? `<span>Discord登録あり</span>` : ""}
        </div>
        ${games.length ? `<div class="profile-tags">${games.map(game => `<span>${escapeHtml(game)}</span>`).join("")}</div>` : ""}
        <p>${escapeHtml(bio)}</p>
      </div>
    </details>
  `;
}

function messageMarkup(message) {
  const reportAction = message.viewerOwned ? "" : `
    <div class="reply-actions">
      <button class="reply-action" type="button" data-action="report-message" data-message-id="${escapeHtml(message.id)}">通報</button>
    </div>
  `;
  return `
    <div class="reply message-bubble ${message.viewerOwned ? "owned" : ""}">
      <div class="message-author">${escapeHtml(message.viewerOwned ? "あなた" : message.author)}</div>
      <div>${escapeHtml(message.body)}</div>
      <span class="muted">${timeAgo(message.createdAt)}</span>
      ${reportAction}
    </div>
  `;
}

function messageCard(conversation) {
  const messages = conversation.messages || [];
  const latest = messages[messages.length - 1] || null;
  const preview = latest ? `${latest.viewerOwned ? "あなた" : conversation.otherName || "Player"}: ${latest.body}` : "まだメッセージはありません。";
  return `
    <article class="card message-card" data-type="messages" data-conversation-id="${escapeHtml(conversation.conversationId)}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">DM</span>
            <span>相手: ${escapeHtml(conversation.otherName || "Player")}</span>
            <span>${timeAgo(conversation.lastMessageAt)}</span>
          </div>
          <h2>${escapeHtml(conversation.recruitmentTitle || "募集")}</h2>
          <p class="card-preview">${escapeHtml(preview)}</p>
        </div>
      </div>
      <div class="replies message-thread">${messages.map(messageMarkup).join("")}</div>
      <div class="actions">
        <button class="action" data-action="reply-message" type="button">返信</button>
      </div>
      <form class="message-form">
        <p class="message-safety">外部IDは必要なときだけで大丈夫です。気になる内容は通報できます。</p>
        <textarea maxlength="500" placeholder="メッセージを書く"></textarea>
        <button class="btn dark" type="submit">送信</button>
      </form>
    </article>
  `;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function copyShareLink(card, button) {
  const title = card.querySelector("h2")?.textContent?.trim() || "Red Thread";
  const url = shareUrl(card.dataset.type, card.dataset.id);
  await copyText(`${title}\n${url}`);
  const original = button.textContent;
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showToast(title, message, actions = "", tone = "info") {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.classList.toggle("error", tone === "error");
  toast.innerHTML = `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ""}
  `;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 7000);
}

function setSubmitState(form, busy, label = "送信中...") {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return () => {};
  return setButtonState(button, busy, label);
}

function setButtonState(button, busy, label = "処理中...") {
  if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
  button.disabled = busy;
  button.setAttribute("aria-busy", busy ? "true" : "false");
  button.textContent = busy ? label : button.dataset.idleText;
  return () => setButtonState(button, false);
}

function setStatusText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function showErrorToast(error) {
  const requestId = error?.requestId || "";
  const suspensionExpires = error?.expiresAt ? ` / ${new Date(error.expiresAt).toLocaleDateString("ja-JP")}まで` : "";
  const message = error?.message === "this account is suspended"
    ? `利用制限中のため操作できません。理由: ${error.reason || "moderation"}${suspensionExpires}`
    : error?.message || "通信に失敗しました。時間をおいて再度お試しください。";
  const shortId = requestId ? requestId.slice(0, 8) : "";
  const actions = requestId
    ? `<button class="action" type="button" data-toast-action="copy-error-id" data-request-id="${escapeHtml(requestId)}">IDをコピー</button><button class="action" type="button" data-toast-action="open-error-inquiry" data-request-id="${escapeHtml(requestId)}" data-error-message="${escapeHtml(message)}">問い合わせへ</button>`
    : "";
  showToast(
    "操作に失敗しました",
    shortId ? `${message} / ID: ${shortId}` : message,
    actions,
    "error"
  );
}

function openErrorInquiryDraft(context = {}) {
  switchView("contactView");
  $("#inquiryCategoryInput").value = "不具合";
  if (context.requestId) $("#inquiryRequestIdInput").value = context.requestId;
  const draft = [
    "エラーが表示されました。",
    "",
    `エラーID: ${context.requestId || "未取得"}`,
    `エラー内容: ${context.message || "不明"}`,
    `画面: ${location.hash || "トップ"}`,
    "",
    "直前にしていた操作:",
    "",
    "もう一度やっても同じか:",
    "",
    "補足:"
  ].join("\n");
  if (!$("#inquiryMessageInput").value.trim()) $("#inquiryMessageInput").value = draft;
  $("#inquiryMessageInput").focus();
}

function openBetaFeedbackDraft(context = {}) {
  switchView("contactView");
  $("#inquiryCategoryInput").value = "βフィードバック";
  if (context.requestId) $("#inquiryRequestIdInput").value = context.requestId;
  const label = context.type === "threads" ? "フリートーク" : context.type === "recruitments" ? "募集" : "βテスト";
  const title = context.title || "";
  const draft = title
    ? `${label}「${title}」を触ってみました。\n\n分かりやすかった点:\n\n迷ったところ:\n\n表示で気になったところ:`
    : "βテストを触ってみました。\n\n分かりやすかった点:\n\n迷ったところ:\n\n表示で気になったところ:";
  if (!$("#inquiryMessageInput").value.trim()) $("#inquiryMessageInput").value = draft;
  $("#inquiryMessageInput").focus();
}

function showPostCreatedToast(type, item) {
  const label = type === "threads" ? "スレッド" : "募集";
  const feedbackAction = betaAccess.required
    ? `<button class="action" type="button" data-toast-action="open-beta-feedback" data-type="${escapeHtml(type)}" data-title="${escapeHtml(item.title || label)}">感想を送る</button>`
    : "";
  showToast(
    `${label}を投稿しました`,
    "XやDiscordで募集を見せたいときに使えます。",
    `<button class="action" type="button" data-toast-action="copy-share" data-type="${escapeHtml(type)}" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title || label)}">共有リンクをコピー</button>${feedbackAction}`
  );
}

function officialSampleBadges(post, label) {
  if (!post.isOfficial) return "";
  return `<span class="badge sample">見本</span><span class="badge official">公式</span><span class="badge light">${escapeHtml(label)}</span>`;
}

function officialGuideMarkup(post, type) {
  if (!post.isOfficial) return "";
  const text = type === "threads"
    ? "話題名、カテゴリ、聞きたいことを短く置くと返信しやすくなります。"
    : "ゲーム、目的、雰囲気、連絡方法を短く入れると参加しやすくなります。";
  return `
    <div class="official-guide">
      <strong>見本ガイド</strong>
      <span>${escapeHtml(text)}</span>
      <button class="link-action" type="button" data-action="use-sample">この見本を使う</button>
    </div>
  `;
}

function recruitmentCard(post) {
  return `
    <article class="card ${post.status === "closed" ? "closed" : ""} ${post.isOfficial ? "official-card" : ""}" data-type="recruitments" data-id="${post.id}" data-status="${post.status || "open"}">
      <div class="card-head">
        <div>
          <div class="meta">
            ${officialSampleBadges(post, "募集見本")}
            <span class="badge">${escapeHtml(post.game)}</span>
            ${post.isOfficial ? "" : `<span class="badge ${post.status === "closed" ? "light" : ""}">${post.status === "closed" ? "締切" : "募集中"}</span>`}
            <span class="badge light">${escapeHtml(post.platform)}</span>
            ${activityBadge(post)}
            <span>${timeAgo(post.createdAt)}</span>
          </div>
          <h2>${escapeHtml(post.title)}</h2>
        </div>
        <div class="count">♡${post.likeCount}</div>
      </div>
      <div class="details">
        <div class="detail"><span>ランク帯</span><strong>${escapeHtml(post.rank || "ランク不問")}</strong></div>
        <div class="detail"><span>VC</span><strong>${escapeHtml(post.voice)}</strong></div>
        <div class="detail"><span>参加</span><strong>${post.participantCount || 0}/${escapeHtml(post.capacity || 4)}</strong></div>
        <div class="detail"><span>スタイル</span><strong>${escapeHtml(post.style)}</strong></div>
      </div>
      ${post.participants?.length ? `<div class="replies">${post.participants.map(participant => `<div class="reply">参加希望: ${escapeHtml(participant.name || "Player")}</div>`).join("")}</div>` : ""}
      <div class="message">${escapeHtml(post.body)}</div>
      ${safeTagMarkup(post)}
      ${officialGuideMarkup(post, "recruitments")}
      ${recruitmentProfileMarkup(post)}
      <form class="message-form">
        <p class="message-safety">外部IDは必要なときだけで大丈夫です。気になる内容は通報できます。</p>
        <textarea maxlength="500" placeholder="募集者にメッセージを書く"></textarea>
        <button class="btn dark" type="submit">送信</button>
      </form>
      <div class="replies">${post.replies.map(replyMarkup).join("")}</div>
      ${engagementSummary(post, "recruitments")}
      <div class="actions">${actionButtons(post)}</div>
      <form class="reply-form">
        <input maxlength="160" placeholder="返信を書く">
        <button class="btn dark" type="submit">送信</button>
      </form>
    </article>
  `;
}

function threadCard(post) {
  return `
    <article class="card ${post.isOfficial ? "official-card" : ""}" data-type="threads" data-id="${post.id}">
      <div class="card-head">
        <div>
          <div class="meta">
            ${officialSampleBadges(post, "話題見本")}
            <span class="badge">${escapeHtml(post.category)}</span>
            ${activityBadge(post)}
            <span>${escapeHtml(post.author)}</span>
            <span>${timeAgo(post.createdAt)}</span>
          </div>
          <h2>${escapeHtml(post.title)}</h2>
        </div>
        <div class="count">♡${post.likeCount}</div>
      </div>
      <div class="message">${escapeHtml(post.body)}</div>
      ${officialGuideMarkup(post, "threads")}
      <div class="replies">${post.replies.map(replyMarkup).join("")}</div>
      ${engagementSummary(post, "threads")}
      <div class="actions">${actionButtons(post)}</div>
      <form class="reply-form">
        <input maxlength="160" placeholder="返信を書く">
        <button class="btn dark" type="submit">送信</button>
      </form>
    </article>
  `;
}

function visibleFeedItems(type, items) {
  const limit = feedLimits[type] || feedPageSize;
  return items.slice(0, limit);
}

function loadMoreMarkup(type, total) {
  const limit = feedLimits[type] || feedPageSize;
  if (total <= limit) return "";
  const nextCount = Math.min(feedPageSize, total - limit);
  return `
    <div class="load-more">
      <button class="btn ghost" type="button" data-load-more="${escapeHtml(type)}">さらに表示</button>
      <span>${escapeHtml(limit)} / ${escapeHtml(total)}件表示中、次に${escapeHtml(nextCount)}件追加</span>
    </div>
  `;
}

function renderRecruitments() {
  refreshGameFilter();
  const allItems = visibleRecruitments();
  const items = visibleFeedItems("recruitments", allItems);
  const filtered = recruitmentFilterLabels();
  renderFilterSummary("#recruitmentFilterSummary", filtered, "recruitment");
  $("#recruitmentCount").textContent = filtered.length ? `${allItems.length}/${state.recruitments.length}件` : `${allItems.length}件`;
  if (!items.length) {
    $("#feed").innerHTML = `<div class="empty">${filtered.length ? "この条件の募集はまだありません。条件を少しゆるめると見つかるかも。" : "まだ募集はありません。最初の募集を書いてみませんか。"}<div class="empty-actions">${filtered.length ? `<button class="btn empty-action" type="button" data-filter-clear="recruitment">条件を解除</button>` : ""}<button class="btn dark empty-action" type="button" data-empty-action="open-recruitment">募集を投稿</button></div></div>`;
    return;
  }
  const cards = items.map(recruitmentCard);
  $("#feed").innerHTML = cards.join("") + loadMoreMarkup("recruitments", allItems.length);
}

function renderThreads() {
  const allItems = visibleThreads();
  const items = visibleFeedItems("threads", allItems);
  const filtered = chatFilterLabels();
  renderFilterSummary("#chatFilterSummary", filtered, "chat");
  $("#chatCount").textContent = filtered.length ? `${allItems.length}/${state.threads.length}件` : `${allItems.length}件`;
  if (!items.length) {
    $("#chatFeed").innerHTML = `<div class="empty">${filtered.length ? "この条件のフリートークはまだありません。カテゴリを変えると見つかるかも。" : "まだフリートークはありません。ちょっとした話題からどうぞ。"}<div class="empty-actions">${filtered.length ? `<button class="btn empty-action" type="button" data-filter-clear="chat">条件を解除</button>` : ""}<button class="btn dark empty-action" type="button" data-empty-action="open-thread">スレッドを投稿</button></div></div>`;
    return;
  }
  const cards = items.map(threadCard);
  $("#chatFeed").innerHTML = cards.join("") + loadMoreMarkup("threads", allItems.length);
}

function renderReminder() {
  const recruitmentItems = state.recruitments.filter(item => item.viewerLiked || item.replies.some(replyMatches));
  const threadItems = state.threads.filter(item => item.viewerLiked || item.replies.some(replyMatches));
  const total = recruitmentItems.length + threadItems.length;
  $("#reminderCount").textContent = `${total}件`;
  if (!total) {
    $("#reminderFeed").innerHTML = `<div class="empty">まだ、いいねや返信をした投稿はありません。</div>`;
    return;
  }
  $("#reminderFeed").innerHTML = `
    ${recruitmentItems.length ? `<div class="summary"><strong>募集</strong><span>${recruitmentItems.length}件</span></div>${recruitmentItems.map(recruitmentCard).join("")}` : ""}
    ${threadItems.length ? `<div class="summary"><strong>フリートーク</strong><span>${threadItems.length}件</span></div>${threadItems.map(threadCard).join("")}` : ""}
  `;
}

function renderMessages() {
  const conversations = state.messages || [];
  $("#messageCount").textContent = `${conversations.length}件`;
  renderMessageNavBadge();
  if (!conversations.length) {
    $("#messageFeed").innerHTML = `<div class="empty">まだメッセージはありません。気になる募集から声をかけられます。<button class="btn dark empty-action" type="button" data-empty-action="open-recruitment">募集を見る</button></div>`;
    return;
  }
  $("#messageFeed").innerHTML = conversations.map(messageCard).join("");
}

function renderMyDataSummary(summary = myDataSummaryCache) {
  const feed = $("#myDataFeed");
  const status = $("#myDataStatus");
  if (!feed || !status) return;
  if (!summary) {
    status.textContent = "未確認";
    feed.innerHTML = `<div class="empty">マイページを開くと、このブラウザのアカウントに紐づくデータ件数を確認できます。</div>`;
    return;
  }
  const counts = summary.counts || {};
  const handling = summary.dataHandling || {};
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  status.textContent = `${total}件`;
  feed.innerHTML = `
    <article class="card data-rights-card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">自分のデータ</span>
            <span>${new Date(summary.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>このアカウントに紐づくデータ</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>募集</span><strong>${escapeHtml(counts.recruitments || 0)}</strong></div>
        <div class="detail"><span>フリートーク</span><strong>${escapeHtml(counts.threads || 0)}</strong></div>
        <div class="detail"><span>返信</span><strong>${escapeHtml(counts.replies || 0)}</strong></div>
        <div class="detail"><span>いいね</span><strong>${escapeHtml((counts.likedRecruitments || 0) + (counts.likedThreads || 0))}</strong></div>
        <div class="detail"><span>参加希望</span><strong>${escapeHtml(counts.joinedRecruitments || 0)}</strong></div>
        <div class="detail"><span>表示中DM</span><strong>${escapeHtml(counts.visibleMessages || 0)}</strong></div>
        <div class="detail"><span>非表示DM</span><strong>${escapeHtml(counts.hiddenMessages || 0)}</strong></div>
        <div class="detail"><span>通報</span><strong>${escapeHtml(counts.reportsSubmitted || 0)}</strong></div>
        <div class="detail"><span>問い合わせ</span><strong>${escapeHtml(counts.inquiries || 0)}</strong></div>
      </div>
      ${(summary.recentOwnedItems || []).length ? `
        <div class="system-checks">
          <div class="system-heading">最近の自分の投稿</div>
          ${summary.recentOwnedItems.map(item => `
            <div class="system-check ok">
              <strong>${escapeHtml(item.type === "thread" ? "話題" : "募集")}</strong>
              <span>${escapeHtml(item.title || "Untitled")} / ${timeAgo(item.createdAt)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="system-checks">
        <div class="system-heading">データの扱い</div>
        <div class="system-check ok">
          <strong>保存</strong>
          <span>${escapeHtml(handling.exportIncludes || "自分の投稿、返信、DM、通報、お問い合わせを確認できます。")}</span>
        </div>
        <div class="system-check ok">
          <strong>削除依頼</strong>
          <span>${escapeHtml(handling.deletionRequestTargets || "自分の投稿やアカウント情報の削除を依頼できます。")}</span>
        </div>
        <div class="system-check ok">
          <strong>安全管理</strong>
          <span>${escapeHtml(handling.retainedForSafety || "安全対策と監査のため、処理概要やログが残る場合があります。")}</span>
        </div>
        <div class="system-check ${counts.hiddenMessages ? "warn" : "ok"}">
          <strong>非表示DM</strong>
          <span>${escapeHtml(handling.hiddenMessagesNote || "非表示済みDMはありません。")}</span>
        </div>
      </div>
      <div class="message">
        削除したい投稿やアカウント情報がある場合は、お問い合わせから依頼できます。本人確認のため、表示名や対象投稿が分かる情報を書いてください。
      </div>
      <div class="actions">
        <button class="action" type="button" data-action="download-my-data">データを保存</button>
        <button class="action" type="button" data-action="open-data-delete-request">削除依頼へ</button>
      </div>
    </article>
  `;
}

async function loadMyDataSummary() {
  const data = await api("/api/me/data");
  myDataSummaryCache = data.data;
  renderMyDataSummary(myDataSummaryCache);
}

function renderMyPage() {
  renderProfile();
  renderMyDataSummary();
  renderMessages();
  const ownedRecruitments = state.recruitments.filter(item => item.viewerOwned);
  const joinedRecruitments = state.recruitments.filter(item => item.viewerJoined && !item.viewerOwned);
  const ownedThreads = state.threads.filter(item => item.viewerOwned);
  const total = ownedRecruitments.length + joinedRecruitments.length + ownedThreads.length;
  $("#myCount").textContent = `${total}件`;
  if (!total) {
    $("#myFeed").innerHTML = `<div class="empty">自分の募集、参加希望、フリートークはまだありません。</div>`;
    return;
  }
  $("#myFeed").innerHTML = `
    ${ownedRecruitments.length ? `<div class="summary"><strong>自分の募集</strong><span>${ownedRecruitments.length}件</span></div>${ownedRecruitments.map(recruitmentCard).join("")}` : ""}
    ${joinedRecruitments.length ? `<div class="summary"><strong>参加希望中</strong><span>${joinedRecruitments.length}件</span></div>${joinedRecruitments.map(recruitmentCard).join("")}` : ""}
    ${ownedThreads.length ? `<div class="summary"><strong>自分のフリートーク</strong><span>${ownedThreads.length}件</span></div>${ownedThreads.map(threadCard).join("")}` : ""}
  `;
}

function renderReports(reports = []) {
  $("#reportCount").textContent = `${reports.length}件`;
  if (!reports.length) {
    $("#reportFeed").innerHTML = `<div class="empty">未対応の通報はありません。</div>`;
    return;
  }
  $("#reportFeed").innerHTML = reports.map(report => `
    <article class="card" data-report-id="${report.id}" data-type="${report.type}" data-item-id="${report.itemId}" data-parent-type="${escapeHtml(report.parentType || "")}" data-parent-id="${escapeHtml(report.parentId || "")}" data-reply-id="${escapeHtml(report.replyId || report.itemId || "")}" data-reported-account-id="${escapeHtml(report.reportedAccountId || "")}" data-reported-name="${escapeHtml(report.reportedName || "")}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(report.type === "replies" ? "返信" : report.type === "messages" ? "DM" : report.type === "threads" ? "フリートーク" : "募集")}</span>
            <span>${escapeHtml(report.reporterName)}</span>
            <span>${timeAgo(report.createdAt)}</span>
            <span>${escapeHtml(report.status)}</span>
          </div>
          <h2>${escapeHtml(report.title)}</h2>
        </div>
      </div>
      <div class="message">${escapeHtml(report.reason)}</div>
      ${report.type === "messages" ? `<div class="message">DM内容: ${escapeHtml(report.messagePreview || "確認できません")}</div>` : ""}
      ${report.type === "messages" ? `<div class="message">会話ID: ${escapeHtml(report.conversationId || "-")}${report.recruitmentId ? ` / 募集ID: ${escapeHtml(report.recruitmentId)}` : ""}</div>` : ""}
      ${report.reportedAccountId ? `<div class="message">対象: ${escapeHtml(report.reportedName || "Unknown")} / ${escapeHtml(report.reportedAccountId)}</div>` : ""}
      <div class="actions">
        <button class="action" data-action="resolve-report">対応済みにする</button>
        <button class="action" data-action="reject-report">問題なしで却下</button>
        ${report.reportedAccountId ? `<button class="action" data-action="ban-reported">投稿者を停止</button>` : ""}
        ${report.type === "messages" ? `<button class="action delete" data-action="hide-reported-message">DMを非表示</button>` : `<button class="action delete" data-action="delete-reported">${report.type === "replies" ? "返信を削除" : "投稿を削除"}</button>`}
      </div>
    </article>
  `).join("");
}

function inquiryCard(inquiry) {
  const isOpen = inquiry.status === "open";
  const trace = inquiry.requestTrace || null;
  const quickTriage = isOpen && inquiry.category === "βフィードバック"
    ? `
      <div class="quick-actions">
        <button class="action" data-action="quick-triage-inquiry" data-beta-feedback-type="不具合" data-beta-feedback-priority="高">不具合・高</button>
        <button class="action" data-action="quick-triage-inquiry" data-beta-feedback-type="UI改善" data-beta-feedback-priority="中">UI改善・中</button>
        <button class="action" data-action="quick-triage-inquiry" data-beta-feedback-type="要望" data-beta-feedback-priority="中">要望・中</button>
        <button class="action" data-action="quick-triage-inquiry" data-beta-feedback-type="対応不要" data-beta-feedback-priority="低">対応不要</button>
      </div>
    `
    : "";
  return `
    <article class="card" data-inquiry-id="${escapeHtml(inquiry.id)}" data-category="${escapeHtml(inquiry.category || "その他")}" data-account-id="${escapeHtml(inquiry.accountId || "")}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(inquiry.category || "その他")}</span>
            ${!isOpen ? `<span class="badge light">対応済み</span>` : ""}
            <span>${escapeHtml(inquiry.name || "Anonymous")}</span>
            <span>${timeAgo(inquiry.createdAt)}</span>
            ${inquiry.resolvedAt ? `<span>対応 ${timeAgo(inquiry.resolvedAt)}</span>` : ""}
          </div>
          <h2>${escapeHtml(inquiry.contact || "連絡先なし")}</h2>
        </div>
      </div>
      ${inquiry.requestId ? `<div class="message">エラーID: ${escapeHtml(inquiry.requestId)}</div>` : ""}
      ${trace ? `<div class="message">リクエスト照合: ${escapeHtml(trace.kind || "request")} / ${escapeHtml(trace.method || "-")} ${escapeHtml(trace.path || "-")} / ${escapeHtml(trace.status ?? "-")}${trace.durationMs !== null && trace.durationMs !== undefined ? ` / ${escapeHtml(trace.durationMs)}ms` : ""}${trace.at ? ` / ${timeAgo(trace.at)}` : ""}${trace.error ? ` / ${escapeHtml(trace.error)}` : ""}</div>` : inquiry.requestId ? `<div class="message muted">リクエスト照合: 直近履歴には見つかりません。システム履歴や外部ログも確認してください。</div>` : ""}
      ${inquiry.betaFeedbackType ? `<div class="message">β分類: ${escapeHtml(inquiry.betaFeedbackType)}${inquiry.betaFeedbackPriority ? ` / 優先度: ${escapeHtml(inquiry.betaFeedbackPriority)}` : ""}${inquiry.betaFeedbackNote ? ` / ${escapeHtml(inquiry.betaFeedbackNote)}` : ""}</div>` : ""}
      <div class="message">${escapeHtml(inquiry.message)}</div>
      ${inquiry.category === "削除依頼" && inquiry.accountId ? `<div class="message warning-text">データ処理は復元できません。先に対象データ確認とバックアップを行ってください。</div>` : ""}
      ${inquiry.resolutionNote ? `<div class="message">対応メモ: ${escapeHtml(inquiry.resolutionNote)}</div>` : ""}
      ${quickTriage}
      ${isOpen ? `
        <div class="actions">
          ${inquiry.category === "削除依頼" && inquiry.accountId ? `<button class="action" data-action="inspect-delete-data">対象データ確認</button>` : ""}
          ${inquiry.category === "削除依頼" && inquiry.accountId ? `<button class="action delete" data-action="erase-account-data">データ処理</button>` : ""}
          ${inquiry.category === "βフィードバック" ? `<button class="action" data-action="triage-inquiry">分類を保存</button>` : ""}
          <button class="action" data-action="copy-inquiry-reply">返信下書き</button>
          <button class="action" data-action="copy-inquiry-memo">内部メモ</button>
          <button class="action" data-action="resolve-inquiry">対応済みにする</button>
        </div>
      ` : ""}
    </article>
  `;
}

function inquirySearchText(inquiry) {
  return [
    inquiry.id,
    inquiry.requestId,
    inquiry.requestId ? inquiry.requestId.slice(0, 8) : "",
    inquiry.name,
    inquiry.contact,
    inquiry.category,
    inquiry.message,
    inquiry.betaFeedbackType,
    inquiry.betaFeedbackPriority,
    inquiry.betaFeedbackNote,
    inquiry.status
  ].filter(Boolean).join(" ").toLowerCase();
}

function inquiryTraceText(trace) {
  if (!trace) return "直近履歴なし";
  const bits = [
    trace.kind || "request",
    `${trace.method || "-"} ${trace.path || "-"}`,
    trace.status ? `status ${trace.status}` : "",
    trace.durationMs !== null && trace.durationMs !== undefined ? `${trace.durationMs}ms` : "",
    trace.error ? `error: ${trace.error}` : ""
  ].filter(Boolean);
  return bits.join(" / ");
}

function buildInquiryReplyDraft(inquiry) {
  const category = inquiry.category || "お問い合わせ";
  const requestIdLine = inquiry.requestId ? `\n受付ID: ${inquiry.requestId}` : "";
  if (category === "削除依頼") {
    return `${inquiry.name || "お問い合わせいただいた方"} 様

Red Thread運営です。削除依頼を受け付けました。${requestIdLine}

対象アカウントと対象データを確認し、必要なバックアップを取得したうえで対応します。
追加確認が必要な場合は、この連絡先へ返信します。

Red Thread運営`;
  }
  if (category === "βフィードバック") {
    return `${inquiry.name || "フィードバックいただいた方"} 様

Red Thread運営です。β版へのフィードバックありがとうございます。${requestIdLine}

内容を確認し、優先度を付けて改善候補に入れました。
反映した場合はサイト内のお知らせ、または更新内容で共有します。

Red Thread運営`;
  }
  if (category === "不具合") {
    return `${inquiry.name || "お問い合わせいただいた方"} 様

Red Thread運営です。不具合のご連絡ありがとうございます。${requestIdLine}

いただいた内容とエラーIDをもとに調査します。
再現手順や発生した画面が追加で分かる場合は、この連絡先へ追記してください。

Red Thread運営`;
  }
  return `${inquiry.name || "お問い合わせいただいた方"} 様

Red Thread運営です。お問い合わせを受け付けました。${requestIdLine}

内容を確認し、必要に応じて対応します。

Red Thread運営`;
}

function buildInquiryInternalMemo(inquiry) {
  const traceText = inquiryTraceText(inquiry.requestTrace);
  return [
    "[Red Thread inquiry memo]",
    `id: ${inquiry.id || "-"}`,
    `category: ${inquiry.category || "その他"}`,
    `status: ${inquiry.status || "-"}`,
    `contact: ${inquiry.contact || "連絡先なし"}`,
    `account: ${inquiry.accountId || "-"}`,
    `requestId: ${inquiry.requestId || "-"}`,
    `trace: ${traceText}`,
    inquiry.betaFeedbackType ? `betaType: ${inquiry.betaFeedbackType}` : "",
    inquiry.betaFeedbackPriority ? `betaPriority: ${inquiry.betaFeedbackPriority}` : "",
    "",
    "message:",
    inquiry.message || "",
    "",
    "next:",
    inquiry.category === "削除依頼"
      ? "対象データ確認、バックアップ、本人確認相当の照合、処理後に対応メモを残す。"
      : inquiry.category === "不具合"
        ? "requestId と trace を見て再現確認。必要なら利用者へ画面と操作手順を確認する。"
        : "内容を分類し、対応要否と優先度を決める。"
  ].filter(line => line !== "").join("\n");
}

function renderInquiries(inquiries = []) {
  adminInquiriesCache = inquiries;
  const query = ($("#adminInquirySearchInput")?.value || "").trim().toLowerCase();
  const includeResolved = !!$("#adminInquiryResolvedInput")?.checked;
  const base = includeResolved ? inquiries : inquiries.filter(inquiry => inquiry.status === "open");
  const visible = query ? base.filter(inquiry => inquirySearchText(inquiry).includes(query)) : base;
  const open = visible.filter(inquiry => inquiry.status === "open");
  const deletionRequests = open.filter(inquiry => inquiry.category === "削除依頼");
  const betaFeedback = open.filter(inquiry => inquiry.category === "βフィードバック");
  const other = open.filter(inquiry => !["βフィードバック", "削除依頼"].includes(inquiry.category));
  const resolvedDeletionRequests = includeResolved ? visible
    .filter(inquiry => inquiry.status !== "open" && inquiry.category === "削除依頼")
    .sort((a, b) => (b.resolvedAt || b.createdAt) - (a.resolvedAt || a.createdAt))
    .slice(0, 5) : [];
  const resolvedBetaFeedback = includeResolved ? visible
    .filter(inquiry => inquiry.status !== "open" && inquiry.category === "βフィードバック")
    .sort((a, b) => (b.resolvedAt || b.createdAt) - (a.resolvedAt || a.createdAt))
    .slice(0, 5) : [];
  const totalOpen = inquiries.filter(inquiry => inquiry.status === "open").length;
  $("#inquiryCount").textContent = query || includeResolved ? `${visible.length}/${inquiries.length}件` : `${open.length}件`;
  if (!open.length && !resolvedBetaFeedback.length && !resolvedDeletionRequests.length) {
    $("#inquiryFeed").innerHTML = `<div class="empty">${query ? "検索に一致するお問い合わせはありません。" : "未対応のお問い合わせはありません。"}</div>`;
    return;
  }
  $("#inquiryFeed").innerHTML = `
    ${deletionRequests.length ? `<div class="summary"><strong>未対応削除依頼</strong><span>${deletionRequests.length}件</span></div>${deletionRequests.map(inquiryCard).join("")}` : ""}
    ${betaFeedback.length ? `<div class="summary"><strong>未対応βフィードバック</strong><span>${betaFeedback.length}件</span></div>${betaFeedback.map(inquiryCard).join("")}` : ""}
    ${other.length ? `<div class="summary"><strong>その他のお問い合わせ</strong><span>${other.length}件</span></div>${other.map(inquiryCard).join("")}` : ""}
    ${resolvedDeletionRequests.length ? `<div class="summary"><strong>最近対応した削除依頼</strong><span>${resolvedDeletionRequests.length}件</span></div>${resolvedDeletionRequests.map(inquiryCard).join("")}` : ""}
    ${resolvedBetaFeedback.length ? `<div class="summary"><strong>最近対応したβフィードバック</strong><span>${resolvedBetaFeedback.length}件</span></div>${resolvedBetaFeedback.map(inquiryCard).join("")}` : ""}
  `;
}

function renderAnnouncementAdmin(announcements = []) {
  $("#announcementCount").textContent = `${announcements.length}件`;
  const form = `
    <article class="card">
      <form class="admin-form" data-action="create-announcement">
        <label>タイトル<input name="title" maxlength="80" placeholder="お知らせタイトル"></label>
        <label>種別
          <select name="tone">
            <option value="info">通常</option>
            <option value="warning">注意</option>
            <option value="maintenance">メンテナンス</option>
          </select>
        </label>
        <textarea name="body" maxlength="500" required placeholder="お知らせ本文"></textarea>
        <button class="btn dark" type="submit">追加</button>
      </form>
    </article>
  `;
  const list = announcements.map(item => `
    <article class="card" data-announcement-id="${escapeHtml(item.id)}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(item.tone || "info")}</span>
            <span>${item.isActive ? "表示中" : "非表示"}</span>
            <span>${timeAgo(item.createdAt)}</span>
          </div>
          <h2>${escapeHtml(item.title)}</h2>
        </div>
      </div>
      <div class="message">${escapeHtml(item.body)}</div>
      <div class="actions">
        <button class="action" data-action="toggle-announcement">${item.isActive ? "非表示にする" : "表示する"}</button>
        <button class="action delete" data-action="delete-announcement">削除</button>
      </div>
    </article>
  `).join("");
  $("#announcementFeed").innerHTML = form + (list || `<div class="empty">お知らせはまだありません。</div>`);
}

function renderOfficialBot(botData = {}) {
  const drafts = botData.drafts || [];
  const ready = drafts.filter(draft => !draft.alreadyPublished);
  const bots = botData.bots || [];
  const readyRecruitments = ready.filter(draft => draft.type === "recruitments").length;
  const readyThreads = ready.filter(draft => draft.type === "threads").length;
  const coveredGames = [...new Set(drafts.map(draft => draft.game).filter(Boolean))];
  const recommendedDrafts = [
    ...ready.filter(draft => draft.type === "recruitments").slice(0, 3),
    ...ready.filter(draft => draft.type === "threads").slice(0, 2)
  ].slice(0, 5);
  const recommendedDraftSet = new Set(recommendedDrafts.map(draft => draft.id));
  const recommendedDraftIds = [...recommendedDraftSet].join(",");
  $("#botDraftStatus").textContent = `${ready.length}/${drafts.length}件`;
  if (!drafts.length) {
    $("#botDraftFeed").innerHTML = `<div class="empty">ボット下書きはまだありません。</div>`;
    return;
  }
  const botNames = bots.length
    ? bots.map(bot => `${bot.author}${bot.role ? `（${bot.role}）` : ""}`).join(" / ")
    : botData.bot?.author || "Red Thread運営";
  const actions = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">公式</span>
            <span>${escapeHtml(`${bots.length || 1}人`)}</span>
          </div>
          <h2>公式ボット投稿</h2>
        </div>
      </div>
      <div class="message">公開初日に使い方が伝わる、公式の見本投稿です。まずは募集3件・話題2件のおすすめだけ公開し、足りない時だけ追加してください。一般ユーザーのふりはしません。\n${escapeHtml(botNames)}</div>
      <div class="bot-draft-summary">
        <span>未投稿の募集 ${readyRecruitments}件</span>
        <span>未投稿の話題 ${readyThreads}件</span>
        <span>公開済み ${drafts.length - ready.length}件</span>
        <span>対応ゲーム ${coveredGames.length}件</span>
      </div>
      <div class="actions">
        <button class="action primary" type="button" data-action="publish-bot-recommended" data-draft-ids="${escapeHtml(recommendedDraftIds)}" ${recommendedDraftIds ? "" : "disabled"}>おすすめだけ公開</button>
        <button class="action" type="button" data-action="publish-bot-drafts" ${ready.length ? "" : "disabled"}>未投稿分を公開</button>
      </div>
    </article>
  `;
  const sortedDrafts = [...drafts].sort((a, b) => {
    const publishState = Number(a.alreadyPublished) - Number(b.alreadyPublished);
    if (publishState) return publishState;
    return Number(recommendedDraftSet.has(b.id)) - Number(recommendedDraftSet.has(a.id));
  });
  const list = sortedDrafts.map(draft => `
    <article class="card ${draft.alreadyPublished ? "closed" : ""}" data-bot-draft-id="${escapeHtml(draft.id)}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge sample">見本</span>
            ${recommendedDraftSet.has(draft.id) ? `<span class="badge">おすすめ</span>` : ""}
            <span class="badge">${draft.type === "threads" ? "話題" : "募集"}</span>
            <span>${escapeHtml(draft.bot?.author || botData.bot?.author || "公式")}</span>
            <span class="${draft.alreadyPublished ? "" : "accent-text"}">${draft.alreadyPublished ? "公開済み" : "未投稿"}</span>
            <span>${escapeHtml(draft.game || draft.category || "")}</span>
            ${draft.launchTag ? `<span>${escapeHtml(draft.launchTag)}</span>` : ""}
          </div>
          <h2>${escapeHtml(draft.title)}</h2>
        </div>
      </div>
      <div class="message">${escapeHtml(draft.body)}</div>
      <div class="actions">
        <button class="action" type="button" data-action="publish-bot-draft" ${draft.alreadyPublished ? "disabled" : ""}>これだけ公開</button>
      </div>
    </article>
  `).join("");
  $("#botDraftFeed").innerHTML = actions + list;
}

function renderAdSlots(slots = []) {
  $("#adSlotCount").textContent = `${slots.length}件`;
  if (!slots.length) {
    $("#adSlotFeed").innerHTML = `<div class="empty">広告枠はまだありません。</div>`;
    return;
  }
  const invalidTargetCount = slots.filter(slot => {
    if (!slot.targetUrl) return false;
    try {
      const parsed = new URL(slot.targetUrl);
      return parsed.protocol !== "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
    } catch {
      return true;
    }
  }).length;
  const activeSlots = slots.filter(slot => slot.isActive);
  const kindCount = kind => activeSlots.filter(slot => (slot.kind || "affiliate") === kind).length;
  const summary = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">広告</span>
            <span>公開前確認</span>
          </div>
          <h2>広告枠サマリー</h2>
        </div>
      </div>
      <div class="bot-draft-summary">
        <span>表示中 ${activeSlots.length}件</span>
        <span>未差し替え ${slots.filter(slot => slot.isActive && slot.isPlaceholder).length}件</span>
        <span>URL確認 ${invalidTargetCount}件</span>
        <span>広告タグ ${slots.filter(slot => slot.html).length}件</span>
        <span>スポンサー ${kindCount("sponsor")}件</span>
        <span>アフィリエイト ${kindCount("affiliate")}件</span>
        <span>告知 ${kindCount("community")}件</span>
      </div>
    </article>
  `;
  $("#adSlotFeed").innerHTML = summary + slots.map(slot => `
    <article class="card" data-slot-key="${escapeHtml(slot.slotKey)}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(slot.placement)}</span>
            <span>${escapeHtml(adKindLabel(slot.kind))}</span>
            <span>${slot.isActive ? "表示中" : "非表示"}</span>
            ${slot.isPlaceholder ? `<span>未差し替え</span>` : ""}
          </div>
          <h2>${escapeHtml(slot.label)}</h2>
        </div>
      </div>
      ${slot.isPlaceholder ? `<div class="message">公開前に広告名、リンク、紹介文を実際の広告内容へ差し替えてください。</div>` : ""}
      <div class="message">${escapeHtml(slot.targetUrl || "リンク未設定")}</div>
      <form class="admin-form" data-action="save-ad">
        <label>表示名<input name="label" maxlength="80" value="${escapeHtml(slot.label)}"></label>
        <label>種類
          <select name="kind">
            <option value="affiliate" ${(slot.kind || "affiliate") === "affiliate" ? "selected" : ""}>アフィリエイト</option>
            <option value="sponsor" ${slot.kind === "sponsor" ? "selected" : ""}>スポンサー</option>
            <option value="community" ${slot.kind === "community" ? "selected" : ""}>告知</option>
          </select>
        </label>
        <label>リンク<input name="targetUrl" maxlength="400" value="${escapeHtml(slot.targetUrl || "")}" placeholder="https://example.com"></label>
        <textarea name="html" maxlength="2000" placeholder="広告タグや紹介文">${escapeHtml(slot.html || "")}</textarea>
        <button class="btn dark" type="submit">保存</button>
      </form>
      <div class="actions">
        <button class="action" data-action="toggle-ad">${slot.isActive ? "非表示にする" : "表示する"}</button>
      </div>
    </article>
  `).join("");
}

function renderBans(bans = []) {
  const active = bans.filter(ban => !ban.expiresAt || ban.expiresAt > Date.now());
  $("#banCount").textContent = `${active.length}件`;
  if (!active.length) {
    $("#banFeed").innerHTML = `<div class="empty">停止中のユーザーはありません。</div>`;
    return;
  }
  $("#banFeed").innerHTML = active.map(ban => `
    <article class="card" data-account-id="${escapeHtml(ban.accountId)}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">停止中</span>
            <span>${timeAgo(ban.createdAt)}</span>
            ${ban.expiresAt ? `<span>期限 ${new Date(ban.expiresAt).toLocaleDateString("ja-JP")}</span>` : `<span>無期限</span>`}
          </div>
          <h2>${escapeHtml(ban.displayName || "Unknown")}</h2>
        </div>
      </div>
      <div class="message">${escapeHtml(ban.reason || "moderation")}</div>
      ${ban.note ? `<div class="message">内部メモ: ${escapeHtml(ban.note)}</div>` : ""}
      <div class="actions">
        <button class="action" data-action="unban-account">停止を解除</button>
      </div>
    </article>
  `).join("");
}

function moderationLabel(action) {
  return {
    content_blocked: "内容ブロック",
    duplicate_blocked: "重複ブロック",
    manual_delete: "手動削除"
  }[action] || action;
}

function renderModerationEvents(events = []) {
  $("#moderationCount").textContent = `${events.length}件`;
  if (!events.length) {
    $("#moderationFeed").innerHTML = `<div class="empty">自動ブロック履歴はまだありません。</div>`;
    return;
  }
  $("#moderationFeed").innerHTML = events.map(event => `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(moderationLabel(event.action))}</span>
            <span>${escapeHtml(event.displayName || "Anonymous")}</span>
            <span>${timeAgo(event.createdAt)}</span>
          </div>
          <h2>${escapeHtml(event.details?.title || event.details?.type || event.action)}</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>対象</span><strong>${escapeHtml(event.details?.type || "-")}</strong></div>
        <div class="detail"><span>理由</span><strong>${escapeHtml(event.details?.reason || event.action)}</strong></div>
        <div class="detail"><span>アカウント</span><strong>${escapeHtml(event.accountId || "-")}</strong></div>
      </div>
    </article>
  `).join("");
}

function deletedTitle(item) {
  if (item.kind === "account_erasure") return item.payload?.accountId || "アカウントデータ処理";
  if (item.kind === "reply") return item.payload?.parentTitle || "返信";
  if (item.kind === "message") return item.payload?.message?.recruitmentTitle || "DM";
  return item.payload?.item?.title || item.kind;
}

function deletedBody(item) {
  if (item.kind === "account_erasure") {
    const counts = item.payload?.counts || {};
    return `募集:${counts.recruitments || 0} / スレッド:${counts.threads || 0} / 返信:${counts.replies || 0} / DM:${counts.messages || 0}`;
  }
  if (item.kind === "reply") return item.payload?.reply?.body || "";
  if (item.kind === "message") return item.payload?.message?.body || "";
  return item.payload?.item?.body || "";
}

function deletedKindLabel(kind) {
  return {
    reply: "返信",
    message: "DM",
    account_erasure: "アカウント",
    threads: "フリートーク",
    recruitments: "募集"
  }[kind] || kind;
}

function deletedReason(item) {
  return item.payload?.reason || "";
}

function renderDeletedItems(items = []) {
  $("#deletedCount").textContent = `${items.length}件`;
  if (!items.length) {
    $("#deletedFeed").innerHTML = `<div class="empty">削除履歴はまだありません。</div>`;
    return;
  }
  $("#deletedFeed").innerHTML = items.map(item => `
    <article class="card" data-deleted-id="${escapeHtml(item.id)}">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(deletedKindLabel(item.kind))}</span>
            <span>${escapeHtml(item.deletedByName || "Admin")}</span>
            <span>${timeAgo(item.deletedAt)}</span>
            ${item.restoredAt ? `<span>復元済み</span>` : ""}
          </div>
          <h2>${escapeHtml(deletedTitle(item))}</h2>
        </div>
      </div>
      <div class="message">${escapeHtml(deletedBody(item))}</div>
      ${deletedReason(item) ? `<div class="message">削除理由: ${escapeHtml(deletedReason(item))}</div>` : ""}
      <div class="actions">
        ${item.restoredAt || item.kind === "account_erasure" ? "" : `<button class="action" data-action="restore-deleted">復元</button>`}
      </div>
    </article>
  `).join("");
}

function renderAdminStats(stats) {
  if (!stats) {
    $("#adminStats").innerHTML = "";
    return;
  }
  const items = [
    ["募集", stats.recruitments],
    ["フリートーク", stats.threads],
    ["未対応通報", stats.openReports],
    ["未対応問い合わせ", stats.openInquiries],
    ["削除依頼", stats.openDeletionRequests || 0],
    ["未対応βFB", stats.openBetaFeedback],
    ["高優先未対応", stats.highPriorityOpenBetaFeedback],
    ["高優先βFB", stats.highPriorityBetaFeedback],
    ["DM会話", stats.messageConversations || 0],
    ["DM件数", stats.directMessages || 0],
    ["未対応DM通報", stats.openMessageReports || 0],
    ["非表示DM", stats.hiddenMessages || 0],
    ["表示中お知らせ", stats.activeAnnouncements],
    ["停止ユーザー", stats.suspendedUsers],
    ["いいね", stats.totalLikes],
    ["返信", stats.totalReplies],
    ["広告", `${stats.activeAds}/${stats.totalAds}`],
    ["広告未差替", stats.placeholderAds || 0],
    ["24h投稿", stats.posts24h],
    ["24h返信", stats.replies24h],
    ["24hβFB", stats.betaFeedback24h],
    ["24h自動ブロック", stats.moderationEvents24h],
    ["削除履歴", stats.deletedItems],
    ["保存", stats.storage]
  ];
  $("#adminStats").innerHTML = items.map(([label, value]) => `
    <div class="stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderBackupStatus(backup) {
  if (!backup) {
    $("#backupStatus").textContent = "未確認";
    $("#backupStatusFeed").innerHTML = "";
    return;
  }
  const latest = backup.latest || {};
  const counts = backup.dataCounts || {};
  $("#backupStatus").textContent = backup.label || "未確認";
  $("#backupStatusFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(backup.status || "unknown")}</span>
            <span>${new Date(backup.generatedAt).toLocaleString("ja-JP")}</span>
            ${latest.checksumPrefix ? `<span>照合ID ${escapeHtml(latest.checksumPrefix)}</span>` : ""}
          </div>
          <h2>${escapeHtml(backup.label || "バックアップ状況")}</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>最新取得</span><strong>${latest.exportedAt ? timeAgo(latest.exportedAt) : "未取得"}</strong></div>
        <div class="detail"><span>取得者</span><strong>${escapeHtml(latest.actorName || "-")}</strong></div>
        <div class="detail"><span>照合ID</span><strong>${escapeHtml(latest.checksumPrefix || "-")}</strong></div>
        <div class="detail"><span>対象件数</span><strong>${escapeHtml(latest.itemCount ?? "-")}</strong></div>
        <div class="detail"><span>募集</span><strong>${escapeHtml(counts.recruitments || 0)}</strong></div>
        <div class="detail"><span>フリートーク</span><strong>${escapeHtml(counts.threads || 0)}</strong></div>
        <div class="detail"><span>DM</span><strong>${escapeHtml(counts.messages || 0)}</strong></div>
        <div class="detail"><span>通報</span><strong>${escapeHtml(counts.reports || 0)}</strong></div>
        <div class="detail"><span>問合せ</span><strong>${escapeHtml(counts.inquiries || 0)}</strong></div>
      </div>
      ${(backup.nextActions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">次の確認</div>
          ${backup.nextActions.map(action => `
            <div class="system-check ${backup.status === "fresh" ? "ok" : "warn"}">
              <strong>${backup.status === "fresh" ? "OK" : "確認"}</strong>
              <span>${escapeHtml(action)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${backup.summaryText ? `
        <div class="message">
          <strong>バックアップメモ</strong>
          <textarea class="readonly-textarea" data-backup-status="summary" readonly>${escapeHtml(backup.summaryText)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-backup-status">バックアップメモをコピー</button>
        </div>
      ` : ""}
    </article>
  `;
}

function deletionRequestSummaryBlock(items = []) {
  if (!items.length) return "";
  return `
    <div class="system-checks">
      <div class="system-heading">未対応削除依頼</div>
      ${items.map(item => {
        const counts = item.counts || {};
        const accountLabel = item.accountId || item.name || "Unknown";
        return `
          <div class="system-check warn">
            <strong>${escapeHtml(accountLabel)}</strong>
            <span>募集:${escapeHtml(counts.recruitments || 0)} / スレッド:${escapeHtml(counts.threads || 0)} / 返信:${escapeHtml(counts.replies || 0)} / DM:${escapeHtml(counts.visibleMessages || 0)}${item.requestId ? ` / #${escapeHtml(item.requestId.slice(0, 8))}` : ""}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPublicReport(report) {
  if (!report) {
    $("#publicReportStatus").textContent = "未確認";
    $("#publicReportFeed").innerHTML = "";
    return;
  }
  const summary = report.summary || {};
  $("#publicReportStatus").textContent = `${summary.posts || 0}投稿 / 未対応${(summary.openReports || 0) + (summary.openInquiries || 0)}件 / 削除${summary.openDeletionRequests || 0}`;
  $("#publicReportFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">24h</span>
            <span>${new Date(report.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>公開運用サマリー</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>投稿</span><strong>${escapeHtml(summary.posts || 0)}</strong></div>
        <div class="detail"><span>活動投稿</span><strong>${escapeHtml(summary.activePosts || 0)}</strong></div>
        <div class="detail"><span>返信</span><strong>${escapeHtml(summary.replies || 0)}</strong></div>
        <div class="detail"><span>参加希望</span><strong>${escapeHtml(summary.participants || 0)}</strong></div>
        <div class="detail"><span>反応率</span><strong>${escapeHtml(summary.responseRate || 0)}%</strong></div>
        <div class="detail"><span>反応なし</span><strong>${escapeHtml(summary.silentPosts || 0)}</strong></div>
        <div class="detail"><span>未対応通報</span><strong>${escapeHtml(summary.openReports || 0)}</strong></div>
        <div class="detail"><span>未対応DM通報</span><strong>${escapeHtml(summary.openMessageReports || 0)}</strong></div>
        <div class="detail"><span>未対応問合せ</span><strong>${escapeHtml(summary.openInquiries || 0)}</strong></div>
        <div class="detail"><span>削除依頼</span><strong>${escapeHtml(summary.openDeletionRequests || 0)}</strong></div>
        <div class="detail"><span>対応待ち24h+</span><strong>${escapeHtml(summary.staleQueue || 0)}</strong></div>
        <div class="detail"><span>5xx</span><strong>${escapeHtml((report.recentErrors || []).length)}</strong></div>
        <div class="detail"><span>429</span><strong>${escapeHtml((report.recentRateLimits || []).length)}</strong></div>
        <div class="detail"><span>バックアップ</span><strong>${summary.backupAgeHours === null || summary.backupAgeHours === undefined ? "未取得" : `${escapeHtml(summary.backupAgeHours)}h前`}</strong></div>
        <div class="detail"><span>広告</span><strong>${escapeHtml(summary.activeAds || 0)}/${escapeHtml(summary.totalAds || 0)}</strong></div>
        <div class="detail"><span>広告未差替</span><strong>${escapeHtml(summary.placeholderAds || 0)}</strong></div>
        <div class="detail"><span>広告URL確認</span><strong>${escapeHtml(summary.invalidAdTargets || 0)}</strong></div>
      </div>
      ${(report.operatorQueue || []).length ? `
        <div class="system-checks">
          <div class="system-heading">優先対応</div>
          ${report.operatorQueue.map(item => `
            <div class="system-check ${item.priority === "高" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.priority || "-")}</strong>
              <span>${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${deletionRequestSummaryBlock(report.openDeletionRequests || [])}
      ${(report.launchManualChecks || []).length ? `
        <div class="system-checks">
          <div class="system-heading">公開後手動確認</div>
          ${report.launchManualChecks.map(item => `
            <div class="system-check ok">
              <strong>${escapeHtml(item.label || "確認")}</strong>
              <span>${escapeHtml(item.detail || "")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.launchWatchPlan || []).length ? `
        <div class="system-checks">
          <div class="system-heading">公開直後の監視</div>
          ${report.launchWatchPlan.map(item => `
            <div class="system-check ${item.window === "異常時" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.window || "確認")}</strong>
              <span>${escapeHtml(item.label || "")}: ${escapeHtml(item.detail || "")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.referrers || []).length ? `
        <div class="system-checks">
          <div class="system-heading">参照元</div>
          ${report.referrers.map(item => `
            <div class="system-check ok">
              <strong>${escapeHtml(item.count || 0)}</strong>
              <span>${escapeHtml(item.ref || "-")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.trendingPosts || []).length ? `
        <div class="system-checks">
          <div class="system-heading">伸びている投稿</div>
          ${report.trendingPosts.map(item => `
            <div class="system-check ok">
              <strong>${escapeHtml(item.score || 0)}</strong>
              <span>${escapeHtml(item.title || "Untitled")} / ♡${escapeHtml(item.likes || 0)} ↩${escapeHtml(item.replies || 0)} 参加${escapeHtml(item.participants || 0)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.silentPosts || []).length ? `
        <div class="system-checks">
          <div class="system-heading">反応なし投稿</div>
          ${report.silentPosts.map(item => `
            <div class="system-check warn">
              <strong>${escapeHtml(item.type === "threads" ? "話題" : "募集")}</strong>
              <span>${escapeHtml(item.title || "Untitled")} / ${escapeHtml(item.author || "Anonymous")} / ${timeAgo(item.createdAt)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.recentErrors || []).length ? `
        <div class="system-checks">
          <div class="system-heading">直近エラー</div>
          ${report.recentErrors.map(item => `
            <div class="system-check warn">
              <strong>${escapeHtml(item.status || 0)}</strong>
              <span>${escapeHtml(item.method || "")} ${escapeHtml(item.path || "")}${item.requestId ? ` / #${escapeHtml(item.requestId.slice(0, 8))}` : ""}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${report.summaryText ? `
        <div class="message">
          <strong>公開運用メモ</strong>
          <textarea class="readonly-textarea" data-public-report="summary" readonly>${escapeHtml(report.summaryText)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-public-report">運用メモをコピー</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderOperatorDigest(digest) {
  if (!digest) {
    $("#operatorDigestStatus").textContent = "未確認";
    $("#operatorDigestFeed").innerHTML = "";
    return;
  }
  const summary = digest.summary || {};
  const launch = digest.launch || {};
  const health = digest.health || {};
  const risk = launch.topRisk;
  $("#operatorDigestStatus").textContent = `${summary.openReports || 0}通報 / ${summary.openInquiries || 0}問合せ / 削除${summary.openDeletionRequests || 0}`;
  $("#operatorDigestFeed").innerHTML = `
    <article class="card operator-digest">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${digest.mode === "closed_beta" ? "β" : "公開"}</span>
            <span>${new Date(digest.generatedAt).toLocaleString("ja-JP")}</span>
            <span>${health.ready ? "ready" : "not ready"}</span>
          </div>
          <h2>今日まず見ること</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>公開判定</span><strong>${escapeHtml(launch.publicLabel || launch.publicStatus || "-")}</strong></div>
        <div class="detail"><span>β判定</span><strong>${escapeHtml(launch.betaLabel || launch.betaStatus || "-")}</strong></div>
        <div class="detail"><span>未対応通報</span><strong>${escapeHtml(summary.openReports || 0)}</strong></div>
        <div class="detail"><span>未対応DM通報</span><strong>${escapeHtml(summary.openMessageReports || 0)}</strong></div>
        <div class="detail"><span>未対応問合せ</span><strong>${escapeHtml(summary.openInquiries || 0)}</strong></div>
        <div class="detail"><span>削除依頼</span><strong>${escapeHtml(summary.openDeletionRequests || 0)}</strong></div>
        <div class="detail"><span>対応待ち24h+</span><strong>${escapeHtml(summary.staleQueue || 0)}</strong></div>
        <div class="detail"><span>24h投稿</span><strong>${escapeHtml(summary.posts || 0)}</strong></div>
        <div class="detail"><span>反応率</span><strong>${escapeHtml(summary.responseRate || 0)}%</strong></div>
        <div class="detail"><span>投稿停止</span><strong>${summary.writePaused ? "ON" : "OFF"}</strong></div>
        <div class="detail"><span>バックアップ</span><strong>${summary.backupAgeHours === null || summary.backupAgeHours === undefined ? "未取得" : `${escapeHtml(summary.backupAgeHours)}h前`}</strong></div>
        <div class="detail"><span>広告</span><strong>${escapeHtml(summary.activeAds || 0)}/${escapeHtml(summary.totalAds || 0)}</strong></div>
        <div class="detail"><span>広告未差替</span><strong>${escapeHtml(summary.placeholderAds || 0)}</strong></div>
        <div class="detail"><span>広告URL確認</span><strong>${escapeHtml(summary.invalidAdTargets || 0)}</strong></div>
        <div class="detail"><span>5xx</span><strong>${escapeHtml(health.recentErrors || 0)}</strong></div>
        <div class="detail"><span>429</span><strong>${escapeHtml(health.recentRateLimits || 0)}</strong></div>
      </div>
      ${risk ? `
        <div class="system-checks">
          <div class="system-heading">最初に見る停止項目</div>
          <div class="system-check warn">
            <strong>${escapeHtml(risk.label || "確認")}</strong>
            <span>${escapeHtml(risk.detail || "")}</span>
          </div>
        </div>
      ` : ""}
      ${(digest.priorityQueue || []).length ? `
        <div class="system-checks">
          <div class="system-heading">優先対応</div>
          ${digest.priorityQueue.map(item => `
            <div class="system-check ${item.priority === "高" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.priority || "-")}</strong>
              <span>${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(digest.openInquirySummaries || []).length ? `
        <div class="system-checks">
          <div class="system-heading">未対応問い合わせ</div>
          ${digest.openInquirySummaries.map(item => `
            <div class="system-check ${item.category === "削除依頼" || item.category === "不具合" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.category || "その他")}${item.requestId ? ` #${escapeHtml(item.requestId.slice(0, 8))}` : ""}</strong>
              <span>${escapeHtml(item.ageHours || 0)}h / ${escapeHtml(item.preview || "")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${digest.summaryText ? `
        <div class="message">
          <strong>運用メモ</strong>
          <textarea class="readonly-textarea" data-operator-digest="summary" readonly>${escapeHtml(digest.summaryText)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-operator-digest">運用メモをコピー</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderIncidentBrief(brief) {
  if (!brief) {
    $("#incidentBriefStatus").textContent = "未確認";
    $("#incidentBriefFeed").innerHTML = "";
    return;
  }
  const summary = brief.summary || {};
  const health = brief.health || {};
  $("#incidentBriefStatus").textContent = `${brief.severity || "-"} / ${brief.health?.ready ? "ready" : "確認"}`;
  $("#incidentBriefFeed").innerHTML = `
    <article class="card operator-digest">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(brief.status || "normal")}</span>
            <span>${new Date(brief.generatedAt).toLocaleString("ja-JP")}</span>
            <span>${escapeHtml(brief.publicStatus?.label || "-")}</span>
          </div>
          <h2>${escapeHtml(brief.label || "インシデント共有")}</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>重要度</span><strong>${escapeHtml(brief.severity || "-")}</strong></div>
        <div class="detail"><span>Ready</span><strong>${health.ready ? "OK" : "注意"}</strong></div>
        <div class="detail"><span>投稿停止</span><strong>${brief.publicStatus?.mode === "paused" ? "ON" : "OFF"}</strong></div>
        <div class="detail"><span>未対応通報</span><strong>${escapeHtml(summary.openReports || 0)}</strong></div>
        <div class="detail"><span>DM通報</span><strong>${escapeHtml(summary.openMessageReports || 0)}</strong></div>
        <div class="detail"><span>問合せ</span><strong>${escapeHtml(summary.openInquiries || 0)}</strong></div>
        <div class="detail"><span>5xx</span><strong>${escapeHtml(health.recentErrors || 0)}</strong></div>
        <div class="detail"><span>429</span><strong>${escapeHtml(health.recentRateLimits || 0)}</strong></div>
      </div>
      ${(brief.immediateActions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">直近対応</div>
          ${brief.immediateActions.map(item => `
            <div class="system-check ${brief.severity === "高" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label || "確認")}</strong>
              <span>${escapeHtml(item.detail || "")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${brief.summaryText ? `
        <div class="message">
          <strong>共有用メモ</strong>
          <textarea class="readonly-textarea" data-incident-brief="summary" readonly>${escapeHtml(brief.summaryText)}</textarea>
        </div>
        ${brief.publicNoticeText ? `
          <div class="message">
            <strong>利用者向けお知らせ</strong>
            <textarea class="readonly-textarea" data-incident-brief="public-notice" readonly>${escapeHtml(brief.publicNoticeText)}</textarea>
          </div>
        ` : ""}
        ${brief.internalHandoffText ? `
          <div class="message">
            <strong>内部引き継ぎ</strong>
            <textarea class="readonly-textarea" data-incident-brief="internal-handoff" readonly>${escapeHtml(brief.internalHandoffText)}</textarea>
          </div>
        ` : ""}
        <div class="actions">
          <button class="action" type="button" data-action="copy-incident-brief">共有メモをコピー</button>
          <button class="action" type="button" data-action="copy-incident-public-notice">お知らせをコピー</button>
          <button class="action" type="button" data-action="copy-incident-handoff">引き継ぎをコピー</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderSystem(system) {
  if (!system) {
    $("#systemStatus").textContent = "未確認";
    $("#systemFeed").innerHTML = "";
    return;
  }
  const warnings = system.checks.filter(check => !check.ok);
  $("#systemStatus").textContent = warnings.length ? `注意 ${warnings.length}件` : "正常";
  const uptimeHours = Math.floor(system.uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((system.uptimeSeconds % 3600) / 60);
  const health = system.health || {};
  const deployment = system.deployment || health.deployment || {};
  const releaseLabel = deployment.release || system.version || "-";
  const commitLabel = deployment.commit || "-";
  const memoryMb = health.memory?.heapUsed ? Math.round(health.memory.heapUsed / 1024 / 1024) : 0;
  const lastRead = health.runtime?.lastReadAt ? timeAgo(health.runtime.lastReadAt) : "未記録";
  const lastWrite = health.runtime?.lastWriteAt ? timeAgo(health.runtime.lastWriteAt) : "未記録";
  const statusCounts = Object.entries(health.runtime?.statusCounts || {}).map(([status, count]) => `${status}:${count}`).join(" / ") || "-";
  const refCounts = Object.entries(health.runtime?.refCounts || {}).map(([ref, count]) => `${ref}:${count}`).join(" / ") || "-";
  const recentRequests = (health.runtime?.recentRequests || []).slice(0, 6);
  const recentErrors = (health.runtime?.recentErrors || []).slice(0, 5);
  const recentRateLimits = (health.runtime?.recentRateLimits || []).slice(0, 5);
  const betaReadiness = system.betaReadiness || [];
  const retention = system.retention || {};
  const retentionSummary = [
    `監査${retention.auditLogs || "-"}`,
    `削除${retention.deletedItems || "-"}`,
    `自動${retention.moderationEvents || "-"}`,
    `表示${retention.adminListLimit || "-"}`
  ].join(" / ");
  $("#systemFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(system.environment)}</span>
            <span>${escapeHtml(system.storage)}</span>
            <span>release ${escapeHtml(releaseLabel)}</span>
            ${commitLabel !== "-" ? `<span>commit ${escapeHtml(commitLabel)}</span>` : ""}
          </div>
          <h2>運用チェック</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>稼働時間</span><strong>${uptimeHours}時間${uptimeMinutes}分</strong></div>
        <div class="detail"><span>Ready</span><strong>${health.ready ? "OK" : "注意"}</strong></div>
        <div class="detail"><span>メモリ</span><strong>${memoryMb}MB</strong></div>
        <div class="detail"><span>リリース</span><strong>${escapeHtml(releaseLabel)}</strong></div>
        <div class="detail"><span>コミット</span><strong>${escapeHtml(commitLabel)}</strong></div>
        <div class="detail"><span>公開URL</span><strong>${escapeHtml(system.publicBaseUrl)}</strong></div>
        <div class="detail"><span>最終読込</span><strong>${escapeHtml(lastRead)}</strong></div>
        <div class="detail"><span>最終保存</span><strong>${escapeHtml(lastWrite)}</strong></div>
        <div class="detail"><span>制限バケット</span><strong>${escapeHtml(system.rateLimitBuckets)}</strong></div>
        <div class="detail"><span>429制限</span><strong>${escapeHtml(health.runtime?.rateLimitBlockedCount || 0)}</strong></div>
        <div class="detail"><span>リクエスト</span><strong>${escapeHtml(health.runtime?.requestCount || 0)}</strong></div>
        <div class="detail"><span>5xxエラー</span><strong>${escapeHtml(health.runtime?.errorCount || 0)}</strong></div>
        <div class="detail"><span>ステータス</span><strong>${escapeHtml(statusCounts)}</strong></div>
        <div class="detail"><span>参照元</span><strong>${escapeHtml(refCounts)}</strong></div>
        <div class="detail"><span>ログ保持</span><strong>${escapeHtml(retentionSummary)}</strong></div>
      </div>
      ${health.runtime?.lastError ? `<div class="message">最終エラー: ${escapeHtml(health.runtime.lastError)}</div>` : ""}
      ${betaReadiness.length ? `
        <div class="system-checks">
          <div class="system-heading">β公開準備</div>
          ${betaReadiness.map(check => `
            <div class="system-check ${check.ok ? "ok" : "warn"}">
              <strong>${check.ok ? "OK" : "注意"}</strong>
              <span>${escapeHtml(check.label)}: ${escapeHtml(check.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${recentErrors.length ? `
        <div class="system-checks error-list">
          <div class="system-heading">直近エラー</div>
          ${recentErrors.map(entry => `
            <div class="system-check warn">
              <strong>${escapeHtml(entry.status)}</strong>
              <span>${escapeHtml(entry.method)} ${escapeHtml(entry.path)} / ${timeAgo(entry.at)}${entry.requestId ? ` / #${escapeHtml(entry.requestId.slice(0, 8))}` : ""} / ${escapeHtml(entry.error || "unknown error")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${recentRateLimits.length ? `
        <div class="system-checks">
          <div class="system-heading">直近429制限</div>
          ${recentRateLimits.map(entry => `
            <div class="system-check warn">
              <strong>${escapeHtml(entry.count || 0)}/${escapeHtml(entry.max || 0)}</strong>
              <span>${escapeHtml(entry.method)} ${escapeHtml(entry.path)} / acct:${escapeHtml(entry.accountId || "-")} / src:${escapeHtml(entry.ipHash || "-")} / ${timeAgo(entry.at)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${recentRequests.length ? `
        <div class="system-checks">
          <div class="system-heading">直近リクエスト</div>
          ${recentRequests.map(entry => `
            <div class="system-check ${entry.status >= 500 ? "warn" : "ok"}">
              <strong>${escapeHtml(entry.status)}</strong>
              <span>${escapeHtml(entry.method)} ${escapeHtml(entry.path)} / ${escapeHtml(entry.durationMs ?? "-")}ms / ${timeAgo(entry.at)}${entry.requestId ? ` / #${escapeHtml(entry.requestId.slice(0, 8))}` : ""}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="system-checks">
        ${system.checks.map(check => `
          <div class="system-check ${check.ok ? "ok" : "warn"}">
            <strong>${check.ok ? "OK" : "注意"}</strong>
            <span>${escapeHtml(check.label)}: ${escapeHtml(check.detail)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderPublicLaunch(launch) {
  if (!launch) {
    $("#publicLaunchStatus").textContent = "未確認";
    $("#publicLaunchFeed").innerHTML = "";
    return;
  }
  const statusTone = launch.status === "ready" ? "ok" : "warn";
  $("#publicLaunchStatus").textContent = launch.label || "未確認";
  $("#publicLaunchFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(launch.status || "unknown")}</span>
            <span>${new Date(launch.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>${escapeHtml(launch.label || "一般公開判定")}</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>未対応通報</span><strong>${escapeHtml(launch.counts?.openReports || 0)}</strong></div>
        <div class="detail"><span>未対応問い合わせ</span><strong>${escapeHtml(launch.counts?.openInquiries || 0)}</strong></div>
        <div class="detail"><span>シード投稿</span><strong>${escapeHtml(launch.counts?.seedPosts || 0)}</strong></div>
        <div class="detail"><span>公式見本</span><strong>${escapeHtml(launch.counts?.officialBotPublished || 0)}/${escapeHtml(launch.counts?.officialBotDrafts || 0)}</strong></div>
        <div class="detail"><span>広告未差替</span><strong>${escapeHtml(launch.counts?.placeholderAds || 0)}</strong></div>
        <div class="detail"><span>お知らせ</span><strong>${escapeHtml(launch.counts?.activeAnnouncements || 0)}</strong></div>
        <div class="detail"><span>バックアップ</span><strong>${launch.counts?.backupAgeHours === null || launch.counts?.backupAgeHours === undefined ? "未取得" : `${escapeHtml(launch.counts.backupAgeHours)}h前`}</strong></div>
      </div>
      ${(launch.nextActions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">次にやること</div>
          ${launch.nextActions.map(item => `
            <div class="system-check ${item.tone === "warn" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(launch.publicTemplates || []).length ? `
        <div class="system-checks">
          <div class="system-heading">公開告知テンプレート</div>
          ${launch.publicTemplates.map((template, index) => `
            <div class="message">
              <strong>${escapeHtml(template.label || `テンプレート${index + 1}`)}</strong>
              <textarea class="readonly-textarea" data-public-template="${escapeHtml(index)}" readonly>${escapeHtml(template.text || "")}</textarea>
              <div class="actions">
                <button class="action" type="button" data-action="copy-public-template" data-template-index="${escapeHtml(index)}">コピー</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="system-checks">
        <div class="system-heading">一般公開チェック</div>
        ${(launch.checks || []).map(check => `
          <div class="system-check ${check.ok ? "ok" : check.level === "blocker" ? "warn" : statusTone}">
            <strong>${check.ok ? "OK" : check.level === "blocker" ? "停止" : "注意"}</strong>
            <span>${escapeHtml(check.label)}: ${escapeHtml(check.detail)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderPublicReleaseChecklist(checklist) {
  if (!checklist) {
    $("#publicReleaseChecklistStatus").textContent = "未確認";
    $("#publicReleaseChecklistFeed").innerHTML = "";
    return;
  }
  const openCount = (checklist.checks || []).reduce((sum, group) => sum + (group.items || []).filter(item => !item.ok).length, 0);
  const gate = checklist.gateSummary || {};
  $("#publicReleaseChecklistStatus").textContent = checklist.label || (openCount ? `要確認 ${openCount}件` : "OK");
  $("#publicReleaseChecklistFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(checklist.status || "unknown")}</span>
            <span>${new Date(checklist.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>${escapeHtml(checklist.label || "公開直前チェック")}</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>停止</span><strong>${escapeHtml(gate.stop || 0)}</strong></div>
        <div class="detail"><span>注意</span><strong>${escapeHtml(gate.caution || 0)}</strong></div>
        <div class="detail"><span>手動確認</span><strong>${escapeHtml(gate.manual || 0)}</strong></div>
      </div>
      ${(gate.firstActions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">最初に見る項目</div>
          ${gate.firstActions.map(item => `
            <div class="system-check ${gate.stop ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label || "確認")}</strong>
              <span>${escapeHtml(item.detail || "")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(checklist.checks || []).map(group => `
        <div class="system-checks">
          <div class="system-heading">${escapeHtml(group.phase || "チェック")}</div>
          ${(group.items || []).map(item => `
            <div class="system-check ${item.ok ? "ok" : "warn"}">
              <strong>${item.ok ? "OK" : "確認"}</strong>
              <span>${escapeHtml(item.label)}: ${escapeHtml(item.detail)}${item.command ? ` / ${escapeHtml(item.command)}` : ""}</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
      ${checklist.summaryText ? `
        <div class="message">
          <strong>公開直前メモ</strong>
          <textarea class="readonly-textarea" data-public-release-checklist="summary" readonly>${escapeHtml(checklist.summaryText)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-public-release-checklist">公開直前メモをコピー</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderDeploymentHandoff(handoff) {
  if (!handoff) {
    $("#deploymentHandoffStatus").textContent = "未確認";
    $("#deploymentHandoffFeed").innerHTML = "";
    return;
  }
  $("#deploymentHandoffStatus").textContent = handoff.label || "未確認";
  $("#deploymentHandoffFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(handoff.status || "unknown")}</span>
            <span>${new Date(handoff.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>${escapeHtml(handoff.label || "公開設定ハンドオフ")}</h2>
        </div>
      </div>
      ${(handoff.services || []).map(service => `
        <div class="system-checks">
          <div class="system-heading">${escapeHtml(service.name || "外部サービス")}</div>
          ${(service.items || []).map(item => `
            <div class="system-check ${item.ok ? "ok" : "warn"}">
              <strong>${item.ok ? "OK" : "未完了"}</strong>
              <span>${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
      ${(handoff.nextActions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">次に確認すること</div>
          ${handoff.nextActions.map(item => `
            <div class="system-check warn">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(handoff.handoffSteps || []).length ? `
        <div class="system-checks">
          <div class="system-heading">実行順</div>
          ${handoff.handoffSteps.map((step, index) => `
            <div class="system-check ${step.ok ? "ok" : "warn"}">
              <strong>${index + 1}. ${step.ok ? "OK" : "未完了"}</strong>
              <span>${escapeHtml(step.label)}: ${escapeHtml(step.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(handoff.envChecklist || []).length ? `
        <div class="system-checks">
          <div class="system-heading">安全な環境変数チェック</div>
          ${handoff.envChecklist.map(item => `
            <div class="system-check ${item.status === "ok" || item.status === "set" || item.status === "pending" ? "ok" : "warn"}">
              <strong>${escapeHtml(item.key || "-")}</strong>
              <span>${escapeHtml(item.status || "-")} / ${escapeHtml(item.expected || "")}${item.secret ? " / 値は画面やチャットへ貼らない" : ""}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${handoff.safeEnv ? `
        <div class="message">
          <strong>安全な環境変数サマリー</strong>
          <textarea class="readonly-textarea" readonly>${escapeHtml(Object.entries(handoff.safeEnv).map(([key, value]) => `${key}=${value}`).join("\n"))}</textarea>
        </div>
      ` : ""}
      ${handoff.summaryText ? `
        <div class="message">
          <strong>外部設定メモ</strong>
          <textarea class="readonly-textarea" data-deployment-handoff="summary" readonly>${escapeHtml(handoff.summaryText)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-deployment-handoff">外部設定メモをコピー</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderBetaLaunch(launch) {
  if (!launch) {
    $("#betaLaunchStatus").textContent = "未確認";
    $("#betaLaunchFeed").innerHTML = "";
    return;
  }
  const statusTone = launch.status === "ready" ? "ok" : launch.status === "caution" ? "warn" : "warn";
  $("#betaLaunchStatus").textContent = launch.label || "未確認";
  $("#betaLaunchFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(launch.status || "unknown")}</span>
            <span>${new Date(launch.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>${escapeHtml(launch.label || "β公開判定")}</h2>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail"><span>未対応通報</span><strong>${escapeHtml(launch.counts?.openReports || 0)}</strong></div>
        <div class="detail"><span>未対応DM通報</span><strong>${escapeHtml(launch.counts?.openMessageReports || 0)}</strong></div>
        <div class="detail"><span>DM会話</span><strong>${escapeHtml(launch.counts?.messageConversations || 0)}</strong></div>
        <div class="detail"><span>非表示DM</span><strong>${escapeHtml(launch.counts?.hiddenMessages || 0)}</strong></div>
        <div class="detail"><span>未対応βFB</span><strong>${escapeHtml(launch.counts?.openBetaFeedback || 0)}</strong></div>
        <div class="detail"><span>高優先未対応</span><strong>${escapeHtml(launch.counts?.highPriorityOpenBetaFeedback || 0)}</strong></div>
        <div class="detail"><span>24h安全イベント</span><strong>${escapeHtml(launch.counts?.recentModerationEvents || 0)}</strong></div>
        <div class="detail"><span>お知らせ</span><strong>${escapeHtml(launch.counts?.activeAnnouncements || 0)}</strong></div>
        <div class="detail"><span>広告未差替</span><strong>${escapeHtml(launch.counts?.placeholderAds || 0)}</strong></div>
        <div class="detail"><span>最終バックアップ</span><strong>${launch.counts?.lastBackupAt ? timeAgo(launch.counts.lastBackupAt) : "未取得"}</strong></div>
        <div class="detail"><span>バックアップ経過</span><strong>${launch.counts?.backupAgeHours === null || launch.counts?.backupAgeHours === undefined ? "未取得" : `${escapeHtml(launch.counts.backupAgeHours)}h`}</strong></div>
        <div class="detail"><span>βテスター</span><strong>${escapeHtml(launch.testerProgress?.testers || 0)}</strong></div>
        <div class="detail"><span>β完了率</span><strong>${escapeHtml(launch.testerProgress?.completionRate || 0)}%</strong></div>
        <div class="detail"><span>招待URL訪問</span><strong>${escapeHtml(launch.testerProgress?.inviteVisits || 0)}</strong></div>
        <div class="detail"><span>訪問→行動</span><strong>${escapeHtml(launch.testerProgress?.inviteToTesterRate || 0)}%</strong></div>
        <div class="detail"><span>招待後未行動</span><strong>${escapeHtml(launch.testerProgress?.inviteDropoff || 0)}</strong></div>
      </div>
      ${launch.successMetrics ? `
        <div class="system-checks">
          <div class="system-heading">β成功指標 ${escapeHtml(launch.successMetrics.score || 0)}% / ${escapeHtml(launch.successMetrics.label || "")}</div>
          ${(launch.successMetrics.goals || []).map(goal => `
            <div class="system-check ${goal.ok ? "ok" : "warn"}">
              <strong>${goal.ok ? "OK" : "未達"} ${escapeHtml(goal.value)}${escapeHtml(goal.unit || "")}/${escapeHtml(goal.target)}${escapeHtml(goal.unit || "")}</strong>
              <span>${escapeHtml(goal.label)}: ${escapeHtml(goal.detail || "")}</span>
            </div>
          `).join("")}
          ${launch.successMetrics.nextGoal ? `
            <div class="message">次の目標: ${escapeHtml(launch.successMetrics.nextGoal.label)}を ${escapeHtml(launch.successMetrics.nextGoal.target)}${escapeHtml(launch.successMetrics.nextGoal.unit || "")} まで伸ばしてください。</div>
          ` : `<div class="message">主要なβ成功指標は達成済みです。次は招待人数を少し増やして確認できます。</div>`}
        </div>
      ` : ""}
      <div class="system-checks">
        <div class="system-heading">βテスター進捗</div>
        <div class="system-check ok">
          <strong>招待</strong>
          <span>${escapeHtml(launch.testerProgress?.inviteVisits || 0)}訪問 / ${escapeHtml(launch.testerProgress?.inviteToTesterRate || 0)}%が行動</span>
        </div>
        <div class="system-check ok">
          <strong>完了</strong>
          <span>${escapeHtml(launch.testerProgress?.completed || 0)} / ${escapeHtml(launch.testerProgress?.testers || 0)}人</span>
        </div>
        <div class="system-check ok">
          <strong>募集</strong>
          <span>${escapeHtml(launch.testerProgress?.recruitmentPosters || 0)}人が投稿</span>
        </div>
        <div class="system-check ok">
          <strong>会話</strong>
          <span>${escapeHtml(launch.testerProgress?.threadPosters || 0)}人がフリートーク投稿</span>
        </div>
        <div class="system-check ok">
          <strong>感想</strong>
          <span>${escapeHtml(launch.testerProgress?.feedbackSenders || 0)}人がβフィードバック送信</span>
        </div>
      </div>
      ${(launch.testerProgress?.bottlenecks || []).length ? `
        <div class="system-checks">
          <div class="system-heading">進捗の詰まり</div>
          ${launch.testerProgress.bottlenecks.map(item => `
            <div class="system-check ${item.tone === "warn" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label)} ${escapeHtml(item.count || 0)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(launch.nextActions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">次にやること</div>
          ${launch.nextActions.map(item => `
            <div class="system-check ${item.tone === "warn" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${launch.inviteTemplate ? `
        <div class="message">
          <strong>招待文テンプレート</strong>
          <textarea class="readonly-textarea" data-beta-template="invite" readonly>${escapeHtml(launch.inviteTemplate)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-beta-invite">招待文をコピー</button>
        </div>
      ` : ""}
      ${(launch.followupTemplates || []).length ? `
        <div class="system-checks">
          <div class="system-heading">テスターへの追いメッセージ</div>
          ${launch.followupTemplates.map((template, index) => `
            <div class="message">
              <strong>${escapeHtml(template.label || "メッセージ")}</strong>
              <textarea class="readonly-textarea" data-beta-template="${escapeHtml(index)}" readonly>${escapeHtml(template.text || "")}</textarea>
              <div class="actions">
                <button class="action" type="button" data-action="copy-beta-followup" data-template-index="${escapeHtml(index)}">コピー</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div class="system-checks">
        <div class="system-heading">公開前チェック</div>
        ${(launch.checks || []).map(check => `
          <div class="system-check ${check.ok ? "ok" : check.level === "blocker" ? "warn" : statusTone}">
            <strong>${check.ok ? "OK" : check.level === "blocker" ? "停止" : "注意"}</strong>
            <span>${escapeHtml(check.label)}: ${escapeHtml(check.detail)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderBetaReport(report) {
  if (!report) {
    $("#betaReportStatus").textContent = "未確認";
    $("#betaReportFeed").innerHTML = "";
    return;
  }
  const summary = report.summary || {};
  $("#betaReportStatus").textContent = `${summary.posts || 0}投稿 / ${summary.betaFeedback || 0}βFB / 削除${summary.openDeletionRequests || 0}`;
  $("#betaReportFeed").innerHTML = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">24h</span>
            <span>${new Date(report.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>β日次サマリー</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>投稿</span><strong>${escapeHtml(summary.posts || 0)}</strong></div>
        <div class="detail"><span>活動投稿</span><strong>${escapeHtml(summary.activePosts || 0)}</strong></div>
        <div class="detail"><span>返信</span><strong>${escapeHtml(summary.replies || 0)}</strong></div>
        <div class="detail"><span>参加希望</span><strong>${escapeHtml(summary.participants || 0)}</strong></div>
        <div class="detail"><span>反応率</span><strong>${escapeHtml(summary.responseRate || 0)}%</strong></div>
        <div class="detail"><span>反応なし</span><strong>${escapeHtml(summary.silentPosts || 0)}</strong></div>
        <div class="detail"><span>通報</span><strong>${escapeHtml(summary.reports || 0)}</strong></div>
        <div class="detail"><span>未対応通報</span><strong>${escapeHtml(summary.openReports || 0)}</strong></div>
        <div class="detail"><span>未対応DM通報</span><strong>${escapeHtml(summary.openMessageReports || 0)}</strong></div>
        <div class="detail"><span>24h DM</span><strong>${escapeHtml(summary.directMessages || 0)}</strong></div>
        <div class="detail"><span>24h DM会話</span><strong>${escapeHtml(summary.messageConversations || 0)}</strong></div>
        <div class="detail"><span>非表示DM</span><strong>${escapeHtml(summary.hiddenMessages || 0)}</strong></div>
        <div class="detail"><span>未対応問合せ</span><strong>${escapeHtml(summary.openInquiries || 0)}</strong></div>
        <div class="detail"><span>削除依頼</span><strong>${escapeHtml(summary.openDeletionRequests || 0)}</strong></div>
        <div class="detail"><span>対応待ち24h+</span><strong>${escapeHtml(summary.staleQueue || 0)}</strong></div>
        <div class="detail"><span>バックアップ</span><strong>${summary.backupAgeHours === null || summary.backupAgeHours === undefined ? "未取得" : `${escapeHtml(summary.backupAgeHours)}h前`}</strong></div>
        <div class="detail"><span>βFB</span><strong>${escapeHtml(summary.betaFeedback || 0)}</strong></div>
        <div class="detail"><span>高優先βFB</span><strong>${escapeHtml(summary.highPriorityBetaFeedback || 0)}</strong></div>
        <div class="detail"><span>自動ブロック</span><strong>${escapeHtml(summary.moderationEvents || 0)}</strong></div>
        <div class="detail"><span>管理操作</span><strong>${escapeHtml(summary.adminActions || 0)}</strong></div>
      </div>
      ${(report.operatorQueue || []).length ? `
        <div class="system-checks">
          <div class="system-heading">優先対応キュー</div>
          ${report.operatorQueue.map(item => `
            <div class="system-check ${item.priority === "高" ? "warn" : item.priority === "中" ? "ok" : "ok"}">
              <strong>${escapeHtml(item.priority || "-")}</strong>
              <span>${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
          <div class="message">
            <strong>優先対応メモ</strong>
            <textarea class="readonly-textarea" data-beta-report="queue" readonly>${escapeHtml(report.operatorQueue.map(item => `[${item.priority || "-"}] ${item.label}: ${item.detail}`).join("\n"))}</textarea>
          </div>
          <div class="actions">
            <button class="action" type="button" data-action="copy-beta-queue">優先対応をコピー</button>
          </div>
        </div>
      ` : ""}
      ${(report.actions || []).length ? `
        <div class="system-checks">
          <div class="system-heading">今日の確認</div>
          ${report.actions.map(item => `
            <div class="system-check ${item.tone === "warn" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${deletionRequestSummaryBlock(report.openDeletionRequests || [])}
      ${(report.testerCallouts || []).length ? `
        <div class="system-checks">
          <div class="system-heading">テスターへの声かけ</div>
          ${report.testerCallouts.map(item => `
            <div class="system-check ${item.tone === "warn" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.trendingPosts || []).length ? `
        <div class="system-checks">
          <div class="system-heading">伸びている投稿</div>
          ${report.trendingPosts.map(item => `
            <div class="system-check ok">
              <strong>${escapeHtml(item.score || 0)}</strong>
              <span>${escapeHtml(item.title || "Untitled")} / ${escapeHtml(item.game || item.category || (item.type === "threads" ? "フリートーク" : "募集"))} / ♡${escapeHtml(item.likes || 0)} ↩${escapeHtml(item.replies || 0)} 参加${escapeHtml(item.participants || 0)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${report.summaryText ? `
        <div class="message">
          <strong>日次メモ</strong>
          <textarea class="readonly-textarea" data-beta-report="summary" readonly>${escapeHtml(report.summaryText)}</textarea>
        </div>
        <div class="actions">
          <button class="action" type="button" data-action="copy-beta-report">日次メモをコピー</button>
        </div>
      ` : ""}
      ${(report.recentBetaFeedback || []).length ? `
        <div class="system-checks">
          <div class="system-heading">最近のβフィードバック</div>
          ${report.recentBetaFeedback.map(item => `
            <div class="system-check ${item.status === "open" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.status)}</strong>
              <span>${escapeHtml(item.name || "Anonymous")}: ${escapeHtml(item.message || "")}${item.betaFeedbackType ? ` / ${escapeHtml(item.betaFeedbackType)}` : ""}${item.betaFeedbackPriority ? ` / 優先度:${escapeHtml(item.betaFeedbackPriority)}` : ""}${item.requestId ? ` / #${escapeHtml(item.requestId.slice(0, 8))}` : ""}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.silentPosts || []).length ? `
        <div class="system-checks">
          <div class="system-heading">反応なし投稿</div>
          ${report.silentPosts.map(item => `
            <div class="system-check warn">
              <strong>${escapeHtml(item.type === "threads" ? "話題" : "募集")}</strong>
              <span>${escapeHtml(item.title || "Untitled")} / ${escapeHtml(item.author || "Anonymous")} / ${timeAgo(item.createdAt)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.openReports || []).length ? `
        <div class="system-checks">
          <div class="system-heading">未対応通報</div>
          ${report.openReports.map(item => `
            <div class="system-check warn">
              <strong>${escapeHtml(item.type)}</strong>
              <span>${escapeHtml(item.reason || "reason missing")} / ${timeAgo(item.createdAt)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.staleQueue || []).length ? `
        <div class="system-checks">
          <div class="system-heading">対応待ち24h+</div>
          ${report.staleQueue.map(item => `
            <div class="system-check warn">
              <strong>${escapeHtml(item.kind || "対応")}</strong>
              <span>${escapeHtml(item.label || "-")} / ${escapeHtml(item.detail || "")} / ${timeAgo(item.createdAt)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${(report.safetyWatch || []).length ? `
        <div class="system-checks">
          <div class="system-heading">注意アカウント</div>
          ${report.safetyWatch.map(item => `
            <div class="system-check ${item.score >= 3 ? "warn" : "ok"}">
              <strong>${escapeHtml(item.score)}</strong>
              <span>${escapeHtml(item.displayName || item.accountId || "Unknown")} / 通報:${escapeHtml(item.reports || 0)} 自動:${escapeHtml(item.moderationEvents || 0)} 削除:${escapeHtml(item.manualDeletes || 0)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function renderBetaBacklog(backlog) {
  adminBetaBacklogCache = backlog;
  if (!backlog) {
    $("#betaBacklogStatus").textContent = "未確認";
    $("#betaBacklogFeed").innerHTML = "";
    return;
  }
  $("#betaBacklogStatus").textContent = `${backlog.total || 0}件 / 未対応${backlog.open || 0}件`;
  if (!backlog.total) {
    $("#betaBacklogFeed").innerHTML = `<div class="empty">βフィードバックはまだありません。</div>`;
    return;
  }
  const summaryCard = `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">集計</span>
            <span>${new Date(backlog.generatedAt).toLocaleString("ja-JP")}</span>
          </div>
          <h2>対応状況</h2>
        </div>
      </div>
      <div class="details">
        <div class="detail"><span>総数</span><strong>${escapeHtml(backlog.total || 0)}</strong></div>
        <div class="detail"><span>未対応</span><strong>${escapeHtml(backlog.open || 0)}</strong></div>
        <div class="detail"><span>対応済み</span><strong>${escapeHtml(backlog.resolved || 0)}</strong></div>
        <div class="detail"><span>高優先未対応</span><strong>${escapeHtml(backlog.highOpen || 0)}</strong></div>
      </div>
      ${(backlog.prioritySummary || []).length ? `
        <div class="system-checks">
          <div class="system-heading">優先度別</div>
          ${backlog.prioritySummary.map(item => `
            <div class="system-check ${item.priority === "高" && item.open ? "warn" : "ok"}">
              <strong>${escapeHtml(item.priority)}</strong>
              <span>未対応 ${escapeHtml(item.open || 0)} / 合計 ${escapeHtml(item.total || 0)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `;
  const candidateCard = (backlog.fixCandidates || []).length ? `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">優先順</span>
            <span>${escapeHtml(backlog.fixCandidates.length)}件</span>
          </div>
          <h2>次の修正候補</h2>
        </div>
      </div>
      <div class="system-checks">
        ${backlog.fixCandidates.map(item => `
          <div class="system-check ${item.priority === "高" ? "warn" : "ok"}">
            <strong>${escapeHtml(item.priority || "-")}</strong>
            <span>${escapeHtml(item.message || "")}${item.type ? ` / ${escapeHtml(item.type)}` : ""}${item.note ? ` / ${escapeHtml(item.note)}` : ""}${item.requestId ? ` / #${escapeHtml(item.requestId.slice(0, 8))}` : ""}</span>
          </div>
        `).join("")}
      </div>
      <div class="actions">
        <button class="action" type="button" data-action="copy-beta-backlog">修正候補をコピー</button>
      </div>
    </article>
  ` : "";
  $("#betaBacklogFeed").innerHTML = summaryCard + candidateCard + (backlog.groups || []).map(group => `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(group.type)}</span>
            <span>未対応 ${escapeHtml(group.open || 0)}件</span>
          </div>
          <h2>${escapeHtml(group.count)}件</h2>
        </div>
      </div>
      ${(group.latest || []).length ? `
        <div class="system-checks">
          ${group.latest.map(item => `
            <div class="system-check ${item.status === "open" ? "warn" : "ok"}">
              <strong>${escapeHtml(item.status)}</strong>
              <span>${escapeHtml(item.message || "")}${item.priority ? ` / 優先度:${escapeHtml(item.priority)}` : ""}${item.note ? ` / ${escapeHtml(item.note)}` : ""}${item.requestId ? ` / #${escapeHtml(item.requestId.slice(0, 8))}` : ""}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `).join("");
}

function betaBacklogClipboardText(backlog) {
  const candidates = backlog?.fixCandidates || [];
  if (!candidates.length) return "Red Thread β改善バックログ\n次の修正候補はありません。";
  return [
    "Red Thread β改善バックログ",
    `生成: ${new Date(backlog.generatedAt || Date.now()).toLocaleString("ja-JP")}`,
    `未対応: ${backlog.open || 0}件 / 高優先: ${backlog.highOpen || 0}件`,
    "",
    "次の修正候補",
    ...candidates.map((item, index) => [
      `${index + 1}. [${item.priority || "-"}] ${item.message || "内容未記入"}`,
      item.type ? `分類: ${item.type}` : "",
      item.note ? `メモ: ${item.note}` : "",
      item.requestId ? `受付ID: ${item.requestId}` : ""
    ].filter(Boolean).join("\n   "))
  ].join("\n");
}

function actionLabel(action) {
  return {
    ban_account: "ユーザー停止",
    unban_account: "停止解除",
    update_ad_slot: "広告更新",
    delete_post: "投稿削除",
    delete_reply: "返信削除",
    resolve_report: "通報対応",
    reject_report: "通報却下",
    resolve_inquiry: "問い合わせ対応",
    create_announcement: "お知らせ作成",
    update_announcement: "お知らせ更新",
    delete_announcement: "お知らせ削除"
  }[action] || action;
}

function renderAuditLogs(logs = []) {
  $("#auditCount").textContent = `${logs.length}件`;
  if (!logs.length) {
    $("#auditFeed").innerHTML = `<div class="empty">監査ログはまだありません。</div>`;
    return;
  }
  $("#auditFeed").innerHTML = logs.map(log => `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="meta">
            <span class="badge">${escapeHtml(actionLabel(log.action))}</span>
            <span>${escapeHtml(log.actorName || "Admin")}</span>
            <span>${timeAgo(log.createdAt)}</span>
          </div>
          <h2>${escapeHtml(log.details?.title || log.details?.displayName || log.details?.slotKey || log.details?.accountId || log.action)}</h2>
        </div>
      </div>
      <div class="message">${escapeHtml(JSON.stringify(log.details || {}))}</div>
    </article>
  `).join("");
}

async function loadAdminData() {
  if (account.role === "moderator" && !$("#adminPinInput").value.trim()) {
    const [reports, moderationEvents, deletedItems] = await Promise.all([
      api("/api/admin/reports"),
      api("/api/admin/moderation-events"),
      api("/api/admin/deleted-items")
    ]);
    $("#systemStatus").textContent = "管理者のみ";
    $("#systemFeed").innerHTML = `<div class="empty">システム設定は管理者のみ確認できます。</div>`;
    $("#backupStatus").textContent = "管理者のみ";
    $("#backupStatusFeed").innerHTML = `<div class="empty">バックアップ状況は管理者のみ確認できます。</div>`;
    $("#publicReportStatus").textContent = "管理者のみ";
    $("#publicReportFeed").innerHTML = `<div class="empty">公開運用レポートは管理者のみ確認できます。</div>`;
    $("#operatorDigestStatus").textContent = "管理者のみ";
    $("#operatorDigestFeed").innerHTML = `<div class="empty">運用ダイジェストは管理者のみ確認できます。</div>`;
    $("#incidentBriefStatus").textContent = "管理者のみ";
    $("#incidentBriefFeed").innerHTML = `<div class="empty">インシデント共有は管理者のみ確認できます。</div>`;
    $("#publicLaunchStatus").textContent = "管理者のみ";
    $("#publicLaunchFeed").innerHTML = `<div class="empty">一般公開判定は管理者のみ確認できます。</div>`;
    $("#publicReleaseChecklistStatus").textContent = "管理者のみ";
    $("#publicReleaseChecklistFeed").innerHTML = `<div class="empty">公開直前チェックは管理者のみ確認できます。</div>`;
    $("#deploymentHandoffStatus").textContent = "管理者のみ";
    $("#deploymentHandoffFeed").innerHTML = `<div class="empty">公開設定ハンドオフは管理者のみ確認できます。</div>`;
    $("#betaLaunchStatus").textContent = "管理者のみ";
    $("#betaLaunchFeed").innerHTML = `<div class="empty">β公開判定は管理者のみ確認できます。</div>`;
    $("#betaReportStatus").textContent = "管理者のみ";
    $("#betaReportFeed").innerHTML = `<div class="empty">β日次レポートは管理者のみ確認できます。</div>`;
    $("#betaBacklogStatus").textContent = "管理者のみ";
    $("#betaBacklogFeed").innerHTML = `<div class="empty">β改善バックログは管理者のみ確認できます。</div>`;
    $("#inquiryCount").textContent = "管理者のみ";
    adminInquiriesCache = [];
    $("#inquiryFeed").innerHTML = `<div class="empty">お問い合わせ管理は管理者のみ確認できます。</div>`;
    $("#botDraftStatus").textContent = "管理者のみ";
    $("#botDraftFeed").innerHTML = `<div class="empty">公式ボットは管理者のみ使えます。</div>`;
    $("#announcementCount").textContent = "管理者のみ";
    $("#announcementFeed").innerHTML = `<div class="empty">お知らせ管理は管理者のみ確認できます。</div>`;
    $("#banCount").textContent = "管理者のみ";
    $("#banFeed").innerHTML = `<div class="empty">停止ユーザー管理は管理者のみ確認できます。</div>`;
    $("#adSlotCount").textContent = "管理者のみ";
    $("#adSlotFeed").innerHTML = `<div class="empty">広告枠管理は管理者のみ確認できます。</div>`;
    $("#auditCount").textContent = "管理者のみ";
    $("#auditFeed").innerHTML = `<div class="empty">監査ログは管理者のみ確認できます。</div>`;
    $("#adminStats").innerHTML = `
      <div class="stat-card"><span>権限</span><strong>Moderator</strong></div>
      <div class="stat-card"><span>未対応通報</span><strong>${reports.reports.filter(report => report.status === "open").length}</strong></div>
      <div class="stat-card"><span>削除履歴</span><strong>${deletedItems.deletedItems.length}</strong></div>
      <div class="stat-card"><span>自動ブロック</span><strong>${moderationEvents.moderationEvents.length}</strong></div>
    `;
    renderReports(reports.reports.filter(report => report.status === "open"));
    renderModerationEvents(moderationEvents.moderationEvents);
    renderDeletedItems(deletedItems.deletedItems);
    return;
  }
  const [stats, system, backupStatus, operatorDigest, incidentBrief, publicReport, publicLaunch, publicReleaseChecklist, deploymentHandoff, betaLaunch, betaReport, betaBacklog, reports, inquiries, botDrafts, announcements, adSlots, bans, moderationEvents, deletedItems, auditLogs] = await Promise.all([
    api("/api/admin/stats"),
    api("/api/admin/system"),
    api("/api/admin/backup-status"),
    api("/api/admin/operator-digest"),
    api("/api/admin/incident-brief"),
    api("/api/admin/public-report"),
    api("/api/admin/public-launch"),
    api("/api/admin/public-release-checklist"),
    api("/api/admin/deployment-handoff"),
    api("/api/admin/beta-launch"),
    api("/api/admin/beta-report"),
    api("/api/admin/beta-backlog"),
    api("/api/admin/reports"),
    api("/api/admin/inquiries"),
    api("/api/admin/bot/drafts"),
    api("/api/admin/announcements"),
    api("/api/admin/ad-slots"),
    api("/api/admin/bans"),
    api("/api/admin/moderation-events"),
    api("/api/admin/deleted-items"),
    api("/api/admin/audit-logs")
  ]);
  renderAdminStats(stats.stats);
  renderSystem(system.system);
  renderBackupStatus(backupStatus.backup);
  renderOperatorDigest(operatorDigest.digest);
  renderIncidentBrief(incidentBrief.brief);
  renderPublicReport(publicReport.report);
  renderPublicLaunch(publicLaunch.launch);
  renderPublicReleaseChecklist(publicReleaseChecklist.checklist);
  renderDeploymentHandoff(deploymentHandoff.handoff);
  renderBetaLaunch(betaLaunch.launch);
  renderBetaReport(betaReport.report);
  renderBetaBacklog(betaBacklog.backlog);
  renderReports(reports.reports.filter(report => report.status === "open"));
  renderInquiries(inquiries.inquiries);
  renderOfficialBot(botDrafts);
  renderAnnouncementAdmin(announcements.announcements);
  renderAdSlots(adSlots.adSlots);
  renderBans(bans.bannedAccounts);
  renderModerationEvents(moderationEvents.moderationEvents);
  renderDeletedItems(deletedItems.deletedItems);
  renderAuditLogs(auditLogs.auditLogs);
}

function activeViewId() {
  return document.querySelector(".view.active")?.id || "recruitmentView";
}

function renderView(viewId = activeViewId()) {
  if (viewId === "recruitmentView") renderRecruitments();
  if (viewId === "chatView") renderThreads();
  if (viewId === "reminderView") renderReminder();
  if (viewId === "myView") renderMyPage();
}

function renderAll() {
  renderAccount();
  renderMessageNavBadge();
  renderBetaAccess();
  renderBetaChecklist();
  renderAnnouncements();
  renderServiceStatus();
  renderAds();
  renderActivitySummaries();
  renderQuickSections();
  renderWeeklySummary();
  renderWeeklyTopic();
  renderRecruitmentFormOptions();
  renderView();
}

function focusSharedCard() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (!hash || !hash.includes(":")) return;
  const [type, id] = hash.split(":");
  if (!["recruitments", "threads"].includes(type) || !id) return;
  switchView(type === "threads" ? "chatView" : "recruitmentView");
  requestAnimationFrame(() => {
    const escapedId = window.CSS?.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    const card = document.querySelector(`[data-type="${type}"][data-id="${escapedId}"]`);
    if (!card) return;
    card.classList.add("shared-focus");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => card.classList.remove("shared-focus"), 2400);
  });
}

function toggleCardForm(card, formSelector, focusSelector) {
  const form = card.querySelector(formSelector);
  if (!form) return;
  form.classList.toggle("open");
  if (form.classList.contains("open")) {
    requestAnimationFrame(() => form.querySelector(focusSelector)?.focus());
  }
}

async function handleCardClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const card = event.target.closest("[data-id], [data-conversation-id]");
  if (!card) return;
  const { type, id } = card.dataset;
  const reply = event.target.closest("[data-reply-id]");
  if (button.dataset.action === "use-sample") {
    useSamplePost(type, id);
    return;
  }
  if (button.dataset.action === "report-reply" && reply) {
    const reason = prompt("返信の通報理由を入力してください", "不適切な返信");
    if (!reason) return;
    const restore = setButtonState(button, true, "送信中...");
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({ type: "replies", parentType: type, parentId: id, itemId: reply.dataset.replyId, replyId: reply.dataset.replyId, reason })
      });
      showToast("通報しました", "確認後、必要に応じて対応します。");
    } catch (error) {
      showErrorToast(error);
    } finally {
      restore();
    }
    return;
  }
  if (button.dataset.action === "delete-reply" && reply) {
    if (!confirm("この返信を削除しますか？")) return;
    const endPending = beginPendingAction(`${type}:${id}:delete-reply:${reply.dataset.replyId}`);
    if (!endPending) return;
    const previous = updateStateItem(type, id, item => {
      item.replies = (item.replies || []).filter(entry => entry.id !== reply.dataset.replyId);
    });
    try {
      const updated = await api(`/api/${type}/${id}/replies/${reply.dataset.replyId}`, { method: "DELETE" });
      upsertStateItem(type, updated);
    } catch (error) {
      restoreStateItem(type, previous);
      showErrorToast(error);
    } finally {
      endPending();
    }
    return;
  }
  if (button.dataset.action === "like") {
    const endPending = beginPendingAction(`${type}:${id}:like`);
    if (!endPending) return;
    const previous = updateStateItem(type, id, item => {
      const liked = !!item.viewerLiked;
      item.viewerLiked = !liked;
      item.likeCount = Math.max(0, Number(item.likeCount || 0) + (liked ? -1 : 1));
    });
    try {
      const updated = await api(`/api/${type}/${id}/like`, { method: "POST" });
      upsertStateItem(type, updated);
    } catch (error) {
      restoreStateItem(type, previous);
      showErrorToast(error);
    } finally {
      endPending();
    }
  }
  if (button.dataset.action === "join") {
    const endPending = beginPendingAction(`${type}:${id}:join`);
    if (!endPending) return;
    const previous = updateStateItem(type, id, item => {
      const joined = !!item.viewerJoined;
      item.viewerJoined = !joined;
      item.participants = Array.isArray(item.participants) ? item.participants : [];
      if (joined) {
        item.participants = item.participants.filter(participant => participant.name !== account.name);
        item.participantCount = Math.max(0, Number(item.participantCount || 0) - 1);
      } else {
        item.participants.push({ name: account.name === "Anonymous" ? "Player" : account.name, joinedAt: Date.now() });
        item.participantCount = Number(item.participantCount || 0) + 1;
      }
    });
    try {
      const updated = await api(`/api/${type}/${id}/join`, { method: "POST" });
      upsertStateItem(type, updated);
    } catch (error) {
      restoreStateItem(type, previous);
      showErrorToast(error);
    } finally {
      endPending();
    }
  }
  if (button.dataset.action === "reply") {
    toggleCardForm(card, ".reply-form", "input");
  }
  if (button.dataset.action === "message") {
    toggleCardForm(card, ".message-form", "textarea");
  }
  if (button.dataset.action === "reply-message") {
    toggleCardForm(card, ".message-form", "textarea");
  }
  if (button.dataset.action === "report-message") {
    const reason = prompt("メッセージの通報理由を入力してください", "不適切なメッセージ");
    if (!reason) return;
    const restore = setButtonState(button, true, "送信中...");
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({ type: "messages", itemId: button.dataset.messageId, reason })
      });
      showToast("通報しました", "確認後、必要に応じて対応します。");
    } catch (error) {
      showErrorToast(error);
    } finally {
      restore();
    }
    return;
  }
  if (button.dataset.action === "share") {
    await copyShareLink(card, button);
  }
  if (button.dataset.action === "copy-x") {
    const item = stateItem(type, id);
    if (!item) return;
    const original = button.textContent;
    lastXShareText = xShareText(type, item);
    await copyText(lastXShareText);
    button.textContent = "コピー済み";
    setTimeout(() => {
      button.textContent = original;
    }, 1400);
    showToast("X告知文をコピーしました", "そのまま貼り付けられます。投稿画面を開くこともできます。", `<button class="action" type="button" data-toast-action="open-x-post">Xを開く</button>`);
  }
  if (button.dataset.action === "status") {
    const nextStatus = card.dataset.status === "closed" ? "open" : "closed";
    const endPending = beginPendingAction(`${type}:${id}:status`);
    if (!endPending) return;
    const previous = updateStateItem(type, id, item => {
      item.status = nextStatus;
    });
    try {
      const updated = await api(`/api/${type}/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      upsertStateItem(type, updated);
    } catch (error) {
      restoreStateItem(type, previous);
      showErrorToast(error);
    } finally {
      endPending();
    }
  }
  if (button.dataset.action === "delete") {
    if (!confirm("この投稿を削除しますか？")) return;
    const endPending = beginPendingAction(`${type}:${id}:delete`);
    if (!endPending) return;
    const previous = cloneStateItem(stateItem(type, id));
    removeStateItem(type, id);
    try {
      await api(`/api/${type}/${id}`, { method: "DELETE" });
    } catch (error) {
      restoreStateItem(type, previous);
      showErrorToast(error);
    } finally {
      endPending();
    }
  }
  if (button.dataset.action === "report") {
    const reason = prompt("通報理由を入力してください", "不適切な投稿");
    if (!reason) return;
    const restore = setButtonState(button, true, "送信中...");
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({ type, itemId: id, reason })
      });
      showToast("通報しました", "確認後、必要に応じて対応します。");
    } catch (error) {
      showErrorToast(error);
    } finally {
      restore();
    }
  }
}

async function handleReplySubmit(event) {
  if (!event.target.classList.contains("reply-form")) return;
  event.preventDefault();
  const form = event.target;
  const card = event.target.closest("[data-id]");
  const input = form.querySelector("input");
  const body = input.value.trim();
  if (!body) return;
  const endPending = beginPendingAction(`${card.dataset.type}:${card.dataset.id}:reply`);
  if (!endPending) return;
  const restore = setSubmitState(form, true, "返信中...");
  const previous = updateStateItem(card.dataset.type, card.dataset.id, item => {
    item.replies = Array.isArray(item.replies) ? item.replies : [];
    item.replies.push({
      id: `pending:${crypto.randomUUID()}`,
      author: account.name === "Anonymous" ? "Player" : account.name,
      accountId: account.id,
      body,
      createdAt: Date.now(),
      viewerOwned: true,
      canDelete: false
    });
    item.viewerReplied = true;
    item.lastReplyAt = Date.now();
    item.lastActivityAt = Date.now();
  });
  input.value = "";
  try {
    const updated = await api(`/api/${card.dataset.type}/${card.dataset.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    upsertStateItem(card.dataset.type, updated);
    window.location.hash = appHash(card.dataset.type, card.dataset.id);
    focusSharedCard();
    showToast("返信しました", "一覧にも反映しました。");
  } catch (error) {
    restoreStateItem(card.dataset.type, previous);
    input.value = body;
    showErrorToast(error);
  } finally {
    endPending();
    restore();
  }
}

async function handleMessageSubmit(event) {
  if (!event.target.classList.contains("message-form")) return;
  event.preventDefault();
  const form = event.target;
  const card = event.target.closest("[data-id], [data-conversation-id]");
  const input = form.querySelector("textarea");
  const body = input.value.trim();
  if (!body) return;
  const payload = card.dataset.type === "messages"
    ? { conversationId: card.dataset.conversationId, body }
    : { recruitmentId: card.dataset.id, body };
  const restore = setSubmitState(form, true, "送信中...");
  try {
    const result = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    input.value = "";
    state.messages = result.messages || state.messages || [];
    saveCachedState();
    renderMessages();
    switchView("myView");
    showToast("メッセージを送信しました", "マイページのメッセージに追加しました。");
  } catch (error) {
    showErrorToast(error);
  } finally {
    restore();
  }
}

$("#postForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const restore = setSubmitState(form, true, "投稿中...");
  setStatusText("#recruitmentFormStatus", "投稿中... 一覧へ反映しています");
  const game = $("#gameInput").value;
  const rank = $("#rankInput").value || "ランク不問";
  const style = $("#styleInput").value;
  const profile = publicProfile();
  const payload = {
    title: [game, rank !== "ランク不問" ? rank : "", `${style}募集`].filter(Boolean).join(" "),
    author: profile.displayName || account.name,
    authorProfile: profile,
    game,
    platform: $("#platformInput").value,
    voice: $("#voiceInput").value,
    rank,
    style,
    capacity: $("#capacityInput").value,
    body: $("#messageInput").value.trim()
  };
  try {
    const created = await api("/api/recruitments", { method: "POST", body: JSON.stringify(payload) });
    $("#postForm").reset();
    renderRecruitmentFormOptions();
    localStorage.removeItem(recruitmentDraftKey);
    $("#recruitmentLayout").classList.remove("form-open");
    updateCreateButton("recruitmentView");
    setStatusText("#recruitmentFormStatus", "投稿しました。一覧へ反映しました");
    upsertStateItem("recruitments", created);
    renderBetaChecklist();
    window.location.hash = appHash("recruitments", created.id);
    focusSharedCard();
    showPostCreatedToast("recruitments", created);
  } catch (error) {
    showErrorToast(error);
  } finally {
    restore();
    updateFormStatus();
  }
});

$("#chatForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const restore = setSubmitState(form, true, "投稿中...");
  setStatusText("#chatFormStatus", "投稿中... 一覧へ反映しています");
  const payload = {
    title: $("#chatTitleInput").value.trim(),
    category: $("#chatCategoryInput").value,
    author: account.name,
    body: $("#chatBodyInput").value.trim()
  };
  try {
    const created = await api("/api/threads", { method: "POST", body: JSON.stringify(payload) });
    $("#chatForm").reset();
    localStorage.removeItem(threadDraftKey);
    $("#chatLayout").classList.remove("form-open");
    updateCreateButton("chatView");
    setStatusText("#chatFormStatus", "投稿しました。一覧へ反映しました");
    upsertStateItem("threads", created);
    renderBetaChecklist();
    window.location.hash = appHash("threads", created.id);
    focusSharedCard();
    showPostCreatedToast("threads", created);
  } catch (error) {
    showErrorToast(error);
  } finally {
    restore();
    updateFormStatus();
  }
});

$("#inquiryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const restore = setSubmitState(form, true, "送信中...");
  $("#inquiryStatus").textContent = "送信中...";
  const category = $("#inquiryCategoryInput").value;
  try {
    const result = await api("/api/inquiries", {
      method: "POST",
      body: JSON.stringify({
        name: $("#inquiryNameInput").value.trim(),
        contact: $("#inquiryContactInput").value.trim(),
        category,
        requestId: $("#inquiryRequestIdInput").value.trim(),
        message: $("#inquiryMessageInput").value.trim()
      })
    });
    if (category === "βフィードバック") localStorage.setItem(betaFeedbackSentKey, "1");
    $("#inquiryForm").reset();
    const receipt = result.requestId ? ` 受付ID: ${result.requestId.slice(0, 8)}` : "";
    $("#inquiryStatus").textContent = `送信しました。確認ありがとうございます。${receipt}`;
    renderBetaChecklist();
  } catch (error) {
    $("#inquiryStatus").textContent = "送信に失敗しました。";
    showErrorToast(error);
  } finally {
    restore();
  }
});

$("#myDataFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || !["download-my-data", "open-data-delete-request"].includes(button.dataset.action)) return;
  if (button.dataset.action === "download-my-data") {
    const result = await api("/api/me/export");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`red-thread-user-data-${stamp}.json`, result.data);
    showToast("データを保存しました", "このブラウザのアカウントに紐づくデータを書き出しました。");
    return;
  }
  switchView("contactView");
  $("#inquiryCategoryInput").value = "削除依頼";
  $("#inquiryNameInput").value = account.name === "Anonymous" ? "" : account.name;
  $("#inquiryMessageInput").value = [
    "データ削除を依頼します。",
    "",
    `対象アカウントID: ${account.id}`,
    `表示名: ${account.name}`,
    "",
    "削除したい対象:",
    "",
    "補足:"
  ].join("\n");
  $("#inquiryMessageInput").focus();
});

["#feed", "#chatFeed", "#reminderFeed", "#myFeed", "#messageFeed"].forEach(selector => {
  $(selector).addEventListener("click", handleCardClick);
  $(selector).addEventListener("submit", handleReplySubmit);
  $(selector).addEventListener("submit", handleMessageSubmit);
});

document.body.addEventListener("click", async event => {
  const safeTag = event.target.closest("[data-safe-tag]");
  if (safeTag) {
    const tag = safeTag.dataset.safeTag;
    if (safeTagFilters.has(tag)) safeTagFilters.delete(tag);
    else safeTagFilters.add(tag);
    resetFeedLimit("recruitments");
    switchView("recruitmentView");
    renderRecruitments();
    $("#feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const filterRemove = event.target.closest("[data-filter-remove]");
  if (filterRemove) {
    const [scope, key, ...rest] = filterRemove.dataset.filterRemove.split(":");
    const value = rest.join(":");
    if (scope === "recruitment") removeRecruitmentFilter(key, value);
    if (scope === "chat") removeChatFilter(key, value);
    return;
  }
  const guideButton = event.target.closest("[data-guide-jump]");
  if (guideButton) {
    const target = guideButton.dataset.guideJump;
    if (target === "profile") {
      switchView("myView");
      $("#profileNameInput")?.focus();
    }
    if (target === "recruitment") {
      switchView("recruitmentView");
      $("#recruitmentLayout").classList.add("form-open");
      updateCreateButton("recruitmentView");
      focusCreateForm("recruitmentView");
    }
    if (target === "active") {
      $("#sortInput").value = "active";
      switchView("recruitmentView");
      renderRecruitments();
      $("#feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target === "referral") {
      await copyText(`${window.location.origin}/?ref=friend`);
      showToast("紹介リンクをコピーしました", "XやDiscordでテスト募集を呼びかけるときに使えます。");
    }
    return;
  }
  const gameEntry = event.target.closest("[data-game-entry]");
  if (gameEntry) {
    document.querySelectorAll("#gameFilter input").forEach(input => {
      input.checked = input.value === gameEntry.dataset.gameEntry;
    });
    syncCheckListLabels($("#gameFilter"));
    renderRankFilter();
    resetFeedLimit("recruitments");
    renderRecruitments();
    switchView("recruitmentView");
    $("#feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const quickPost = event.target.closest("[data-quick-post]");
  if (quickPost) {
    const [quickType, quickId] = quickPost.dataset.quickPost.split(":");
    window.location.hash = appHash(quickType, quickId);
    focusSharedCard();
    return;
  }
  const loadMoreButton = event.target.closest("[data-load-more]");
  if (loadMoreButton) {
    const type = loadMoreButton.dataset.loadMore;
    feedLimits[type] = (feedLimits[type] || feedPageSize) + feedPageSize;
    if (type === "recruitments") renderRecruitments();
    if (type === "threads") renderThreads();
    return;
  }
  const clearButton = event.target.closest("[data-filter-clear]");
  if (clearButton) {
    if (clearButton.dataset.filterClear === "recruitment") clearRecruitmentFilters();
    if (clearButton.dataset.filterClear === "chat") clearChatFilters();
    return;
  }
  const button = event.target.closest("[data-empty-action]");
  if (!button) return;
  if (button.dataset.emptyAction === "open-recruitment") {
    switchView("recruitmentView");
    $("#recruitmentLayout").classList.add("form-open");
    updateCreateButton("recruitmentView");
  }
  if (button.dataset.emptyAction === "open-thread") {
    switchView("chatView");
    $("#chatLayout").classList.add("form-open");
    updateCreateButton("chatView");
  }
});

$("#betaTaskList").addEventListener("click", event => {
  const button = event.target.closest("[data-beta-task]");
  if (!button) return;
  if (button.dataset.betaTask === "recruitment") {
    switchView("recruitmentView");
    $("#recruitmentLayout").classList.add("form-open");
    updateCreateButton("recruitmentView");
    $("#gameInput").focus();
  }
  if (button.dataset.betaTask === "thread") {
    switchView("chatView");
    $("#chatLayout").classList.add("form-open");
    updateCreateButton("chatView");
    $("#chatTitleInput").focus();
  }
  if (button.dataset.betaTask === "feedback") {
    openBetaFeedbackDraft();
  }
});

$("#betaQuickStart").addEventListener("click", event => {
  const button = event.target.closest("[data-beta-jump]");
  if (!button) return;
  if (button.dataset.betaJump === "recruitment") {
    switchView("recruitmentView");
    $("#recruitmentLayout").classList.add("form-open");
    updateCreateButton("recruitmentView");
    $("#gameInput").focus();
  }
  if (button.dataset.betaJump === "thread") {
    switchView("chatView");
    $("#chatLayout").classList.add("form-open");
    updateCreateButton("chatView");
    $("#chatTitleInput").focus();
  }
  if (button.dataset.betaJump === "feedback") {
    openBetaFeedbackDraft();
  }
});

document.body.addEventListener("click", event => {
  const chip = event.target.closest("[data-activity-type]");
  if (!chip) return;
  if (chip.dataset.activityType === "game") {
    document.querySelectorAll("#gameFilter input").forEach(input => {
      input.checked = input.value === chip.dataset.value;
    });
    syncCheckListLabels($("#gameFilter"));
    renderRankFilter();
    renderRecruitments();
    switchView("recruitmentView");
  }
  if (chip.dataset.activityType === "category") {
    document.querySelectorAll("#chatCategoryFilter input").forEach(input => {
      input.checked = input.value === chip.dataset.value;
    });
    syncCheckListLabels($("#chatCategoryFilter"));
    renderThreads();
    switchView("chatView");
  }
});

document.body.addEventListener("change", event => {
  const input = event.target.closest?.(".check-list input[type='checkbox']");
  if (!input) return;
  syncCheckedLabel(input.closest("label"));
});

document.body.addEventListener("click", event => {
  const button = event.target.closest("[data-template]");
  if (!button) return;
  const [type, key] = button.dataset.template.split(":");
  if (type === "recruitment") applyRecruitmentTemplate(key);
  if (type === "thread") applyThreadTemplate(key);
});

$("#loadReportsButton").addEventListener("click", async () => {
  await loadAdminData();
});

$("#exportBackupButton").addEventListener("click", async () => {
  const button = $("#exportBackupButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "取得中...";
  try {
    const backup = await api("/api/admin/export");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`partyfinder-backup-${stamp}.json`, backup);
    await loadAdminData();
    const checksum = backup.checksum ? backup.checksum.replace(/^sha256:/, "").slice(0, 12) : "";
    showToast("バックアップを取得しました", checksum ? `JSONファイルを保存しました。照合ID: ${checksum}` : "JSONファイルを保存しました。");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

$("#reportFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  const card = event.target.closest("[data-report-id]");
  if (button.dataset.action === "resolve-report") {
    await api(`/api/admin/reports/${card.dataset.reportId}/resolve`, { method: "POST" });
  }
  if (button.dataset.action === "reject-report") {
    const resolution = prompt("却下理由を入力してください", "問題なし");
    if (!resolution) return;
    await api(`/api/admin/reports/${card.dataset.reportId}/reject`, {
      method: "POST",
      body: JSON.stringify({ resolution })
    });
  }
  if (button.dataset.action === "delete-reported") {
    const type = card.dataset.type;
    const itemId = card.dataset.itemId;
    const reason = prompt("削除理由を入力してください", "通報対応");
    if (!reason) return;
    if (type === "replies") {
      if (!confirm("この返信を削除しますか？")) return;
      await api(`/api/${card.dataset.parentType}/${card.dataset.parentId}/replies/${card.dataset.replyId}`, {
        method: "DELETE",
        body: JSON.stringify({ reason })
      });
    } else {
      if (!confirm("この投稿を削除しますか？")) return;
      await api(`/api/${type}/${itemId}`, {
        method: "DELETE",
        body: JSON.stringify({ reason })
      });
    }
  }
  if (button.dataset.action === "hide-reported-message") {
    const reason = prompt("非表示理由を入力してください", "通報対応");
    if (!reason) return;
    if (!confirm("このDMを非表示にしますか？")) return;
    await api(`/api/messages/${card.dataset.itemId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason })
    });
  }
  if (button.dataset.action === "ban-reported") {
    const reason = prompt("停止理由を入力してください", "通報対応");
    if (!reason) return;
    const durationInput = prompt("停止日数を入力してください。空欄または0で無期限です。", "7");
    if (durationInput === null) return;
    const note = prompt("内部メモを入力してください", `通報ID: ${card.dataset.reportId}`) || "";
    await api("/api/admin/bans", {
      method: "POST",
      body: JSON.stringify({
        accountId: card.dataset.reportedAccountId,
        displayName: card.dataset.reportedName || "Unknown",
        reason,
        durationDays: Number(durationInput || 0),
        note
      })
    });
  }
  const data = await api("/api/admin/reports");
  renderReports(data.reports.filter(report => report.status === "open"));
  await loadAdminData();
  await loadState();
});

function promptBetaFeedbackTriage() {
  const type = prompt("βフィードバック分類を入力してください: 不具合 / UI改善 / 要望 / 保留 / 対応不要", "UI改善");
  if (!type) return null;
  const priority = prompt("優先度を入力してください: 高 / 中 / 低", "中");
  if (!priority) return null;
  const note = prompt("内部メモを入力してください", "") || "";
  return {
    betaFeedbackType: type,
    betaFeedbackPriority: priority,
    betaFeedbackNote: note
  };
}

$("#inquiryFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || !["triage-inquiry", "quick-triage-inquiry", "inspect-delete-data", "erase-account-data", "copy-inquiry-reply", "copy-inquiry-memo", "resolve-inquiry"].includes(button.dataset.action)) return;
  const card = event.target.closest("[data-inquiry-id]");
  if (button.dataset.action === "inspect-delete-data") {
    const accountId = card.dataset.accountId;
    if (!accountId) return;
    const result = await api(`/api/admin/accounts/${encodeURIComponent(accountId)}/data`);
    const counts = result.data.counts || {};
    showToast(
      "対象データ",
      `募集:${counts.recruitments || 0} / スレッド:${counts.threads || 0} / 返信:${counts.replies || 0} / DM:${counts.visibleMessages || 0} / 問い合わせ:${counts.inquiries || 0}`,
      `<button class="action" type="button" data-toast-action="copy-account-data" data-copy="${escapeHtml(JSON.stringify(result.data))}">コピー</button>`
    );
    return;
  }
  if (button.dataset.action === "erase-account-data") {
    const accountId = card.dataset.accountId;
    if (!accountId) return;
    const confirmation = prompt(`この処理は復元できません。バックアップと対象データ確認が済んでいる場合だけ、対象アカウントIDを入力してください。\n${accountId}`, "");
    if (confirmation !== accountId) {
      showToast("処理を中止しました", "アカウントIDが一致しませんでした。", "", "error");
      return;
    }
    const reason = prompt("処理理由を入力してください", "削除依頼対応");
    if (!reason) return;
    await api(`/api/admin/accounts/${encodeURIComponent(accountId)}/erase`, {
      method: "POST",
      body: JSON.stringify({
        confirmAccountId: confirmation,
        inquiryId: card.dataset.inquiryId,
        reason,
        resolutionNote: `アカウントデータ処理済み。理由: ${reason}`
      })
    });
    showToast("データ処理を実行しました", "対象アカウントの投稿・返信・DMを処理しました。");
    await loadAdminData();
    await loadState();
    return;
  }
  if (button.dataset.action === "quick-triage-inquiry") {
    await api(`/api/admin/inquiries/${card.dataset.inquiryId}/triage`, {
      method: "POST",
      body: JSON.stringify({
        betaFeedbackType: button.dataset.betaFeedbackType,
        betaFeedbackPriority: button.dataset.betaFeedbackPriority,
        betaFeedbackNote: "クイック分類"
      })
    });
    await loadAdminData();
    return;
  }
  if (button.dataset.action === "triage-inquiry") {
    const triage = promptBetaFeedbackTriage();
    if (!triage) return;
    await api(`/api/admin/inquiries/${card.dataset.inquiryId}/triage`, {
      method: "POST",
      body: JSON.stringify(triage)
    });
    await loadAdminData();
    return;
  }
  if (button.dataset.action === "copy-inquiry-reply" || button.dataset.action === "copy-inquiry-memo") {
    const inquiry = adminInquiriesCache.find(entry => entry.id === card.dataset.inquiryId);
    if (!inquiry) return;
    const text = button.dataset.action === "copy-inquiry-reply"
      ? buildInquiryReplyDraft(inquiry)
      : buildInquiryInternalMemo(inquiry);
    const originalText = button.textContent;
    await copyText(text);
    button.textContent = "コピー済み";
    setTimeout(() => {
      button.textContent = originalText;
    }, 1400);
    return;
  }
  const defaultNote = card.dataset.category === "削除依頼" ? "削除依頼の対象を確認済み。" : "";
  const resolutionNote = prompt("対応メモを入力してください", defaultNote);
  if (resolutionNote === null) return;
  await api(`/api/admin/inquiries/${card.dataset.inquiryId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolutionNote })
  });
  await loadAdminData();
});

$("#adminInquirySearchInput").addEventListener("input", () => {
  renderInquiries(adminInquiriesCache);
});

$("#adminInquiryResolvedInput").addEventListener("change", () => {
  renderInquiries(adminInquiriesCache);
});

$("#betaLaunchFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || !["copy-beta-invite", "copy-beta-followup"].includes(button.dataset.action)) return;
  const textarea = button.dataset.action === "copy-beta-followup"
    ? $(`#betaLaunchFeed .readonly-textarea[data-beta-template="${button.dataset.templateIndex}"]`)
    : $(`#betaLaunchFeed .readonly-textarea[data-beta-template="invite"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#publicReportFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-public-report") return;
  const textarea = $(`#publicReportFeed .readonly-textarea[data-public-report="summary"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#operatorDigestFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-operator-digest") return;
  const textarea = $(`#operatorDigestFeed .readonly-textarea[data-operator-digest="summary"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#incidentBriefFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  const targets = {
    "copy-incident-brief": "summary",
    "copy-incident-public-notice": "public-notice",
    "copy-incident-handoff": "internal-handoff"
  };
  if (!button || !targets[button.dataset.action]) return;
  const textarea = $(`#incidentBriefFeed .readonly-textarea[data-incident-brief="${targets[button.dataset.action]}"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#backupStatusFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-backup-status") return;
  const textarea = $(`#backupStatusFeed .readonly-textarea[data-backup-status="summary"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#publicLaunchFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-public-template") return;
  const textarea = $(`#publicLaunchFeed .readonly-textarea[data-public-template="${button.dataset.templateIndex}"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#publicReleaseChecklistFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-public-release-checklist") return;
  const textarea = $(`#publicReleaseChecklistFeed .readonly-textarea[data-public-release-checklist="summary"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#deploymentHandoffFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-deployment-handoff") return;
  const textarea = $(`#deploymentHandoffFeed .readonly-textarea[data-deployment-handoff="summary"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#betaReportFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || !["copy-beta-report", "copy-beta-queue"].includes(button.dataset.action)) return;
  const textarea = button.dataset.action === "copy-beta-queue"
    ? $(`#betaReportFeed .readonly-textarea[data-beta-report="queue"]`)
    : $(`#betaReportFeed .readonly-textarea[data-beta-report="summary"]`);
  const originalText = button.textContent;
  await copyText(textarea?.value || "");
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = originalText;
  }, 1400);
});

$("#betaBacklogFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "copy-beta-backlog") return;
  await copyText(betaBacklogClipboardText(adminBetaBacklogCache));
  button.textContent = "コピー済み";
  setTimeout(() => {
    button.textContent = "修正候補をコピー";
  }, 1400);
});

$("#announcementFeed").addEventListener("submit", async event => {
  if (event.target.dataset.action !== "create-announcement") return;
  event.preventDefault();
  const form = new FormData(event.target);
  await api("/api/admin/announcements", {
    method: "POST",
    body: JSON.stringify({
      title: form.get("title"),
      body: form.get("body"),
      tone: form.get("tone")
    })
  });
  event.target.reset();
  await loadAdminData();
  await loadState();
});

$("#botDraftFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || !["publish-bot-drafts", "publish-bot-draft", "publish-bot-recommended"].includes(button.dataset.action)) return;
  const card = event.target.closest("[data-bot-draft-id]");
  const actionKey = button.dataset.action === "publish-bot-draft" && card
    ? `bot:${card.dataset.botDraftId}`
    : button.dataset.action === "publish-bot-recommended"
      ? "bot:recommended"
    : "bot:all";
  const endPending = beginPendingAction(actionKey);
  if (!endPending) return;
  const restore = setButtonState(button, true, "公開中...");
  const draftIds = button.dataset.action === "publish-bot-draft" && card
    ? [card.dataset.botDraftId]
    : button.dataset.action === "publish-bot-recommended"
      ? (button.dataset.draftIds || "").split(",").filter(Boolean)
      : [];
  const payload = draftIds.length ? { draftIds } : {};
  try {
    const result = await api("/api/admin/bot/publish", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const count = result.published?.length || 0;
    showToast(
      count ? "公式ボットを公開しました" : "公開済みです",
      count ? `${count}件を追加しました。` : "追加できる未投稿の見本はありません。"
    );
    await loadState();
    await loadAdminData();
  } catch (error) {
    showErrorToast(error);
  } finally {
    restore();
    endPending();
  }
});

$("#announcementFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  const card = event.target.closest("[data-announcement-id]");
  if (!card) return;
  if (button.dataset.action === "toggle-announcement") {
    const nextActive = button.textContent.includes("表示する");
    await api(`/api/admin/announcements/${card.dataset.announcementId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: nextActive })
    });
  }
  if (button.dataset.action === "delete-announcement") {
    if (!confirm("このお知らせを削除しますか？")) return;
    await api(`/api/admin/announcements/${card.dataset.announcementId}`, { method: "DELETE" });
  }
  await loadAdminData();
  await loadState();
});

$("#adSlotFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "toggle-ad") return;
  const card = event.target.closest("[data-slot-key]");
  const slotKey = card.dataset.slotKey;
  const current = button.textContent.includes("非表示");
  await api(`/api/admin/ad-slots/${slotKey}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: !current })
  });
  await loadAdminData();
  await loadState();
});

$("#adSlotFeed").addEventListener("submit", async event => {
  if (event.target.dataset.action !== "save-ad") return;
  event.preventDefault();
  const card = event.target.closest("[data-slot-key]");
  const form = new FormData(event.target);
  await api(`/api/admin/ad-slots/${card.dataset.slotKey}`, {
    method: "PATCH",
    body: JSON.stringify({
      label: form.get("label"),
      kind: form.get("kind"),
      targetUrl: form.get("targetUrl"),
      html: form.get("html")
    })
  });
  await loadAdminData();
  await loadState();
});

$("#banFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "unban-account") return;
  const card = event.target.closest("[data-account-id]");
  await api(`/api/admin/bans/${encodeURIComponent(card.dataset.accountId)}`, { method: "DELETE" });
  await loadAdminData();
});

$("#deletedFeed").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.dataset.action !== "restore-deleted") return;
  const card = event.target.closest("[data-deleted-id]");
  if (!confirm("この削除履歴から復元しますか？")) return;
  await api(`/api/admin/deleted-items/${card.dataset.deletedId}/restore`, { method: "POST" });
  await loadAdminData();
  await loadState();
});

$("#toast").addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.toastAction === "copy-share") {
    await copyText(`${button.dataset.title || "Red Thread"}\n${shareUrl(button.dataset.type, button.dataset.id)}`);
    button.textContent = "コピー済み";
    setTimeout(() => {
      button.textContent = "共有リンクをコピー";
    }, 1400);
  }
  if (button.dataset.toastAction === "open-x-post") {
    const text = lastXShareText || `${window.location.origin}/?ref=x`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  if (button.dataset.toastAction === "copy-error-id") {
    await copyText(button.dataset.requestId || "");
    button.textContent = "コピー済み";
    setTimeout(() => {
      button.textContent = "IDをコピー";
    }, 1400);
  }
  if (button.dataset.toastAction === "copy-account-data") {
    await copyText(button.dataset.copy || "");
    button.textContent = "コピー済み";
    setTimeout(() => {
      button.textContent = "コピー";
    }, 1400);
  }
  if (button.dataset.toastAction === "open-error-inquiry") {
    openErrorInquiryDraft({
      requestId: button.dataset.requestId || "",
      message: button.dataset.errorMessage || ""
    });
  }
  if (button.dataset.toastAction === "open-beta-feedback") {
    openBetaFeedbackDraft({
      type: button.dataset.type,
      title: button.dataset.title
    });
  }
});

document.querySelectorAll("[data-view]").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
$("#detailFilterToggle").addEventListener("click", () => {
  const body = $("#detailFilterBody");
  const open = body.hidden;
  body.hidden = !open;
  $("#detailFilterToggle").setAttribute("aria-expanded", String(open));
});
$("#gameInput").addEventListener("change", () => {
  renderRecruitmentFormOptions();
  saveFormDraft(recruitmentDraftKey, recruitmentDraftFields);
});
document.querySelectorAll("[data-filter-tab]").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll("[data-filter-tab]").forEach(item => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".filter-panel").forEach(panel => {
    const active = panel.id === tab.dataset.filterTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}));
$("#openRecruitFormButton").addEventListener("click", () => {
  if (!$("#chatView").hidden) {
    $("#chatLayout").classList.toggle("form-open");
    updateCreateButton("chatView");
    if ($("#chatLayout").classList.contains("form-open")) focusCreateForm("chatView");
    return;
  }
  if ($("#recruitmentView").hidden) switchView("recruitmentView");
  $("#recruitmentLayout").classList.toggle("form-open");
  updateCreateButton("recruitmentView");
  if ($("#recruitmentLayout").classList.contains("form-open")) focusCreateForm("recruitmentView");
});
$("#loginToggleButton").addEventListener("click", () => $("#accountPanel").classList.toggle("open"));
$("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  saveAccount({
    id: `user:${$("#loginNameInput").value.trim() || "Player"}`,
    name: $("#loginNameInput").value.trim() || "Player",
    discord: "",
    profile: account.profile || loadProfile()
  });
  $("#accountPanel").classList.remove("open");
  renderAll();
});
$("#profileForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const restore = setSubmitState(form, true, "保存中...");
  const profile = {
    displayName: $("#profileNameInput").value.trim(),
    discordHandle: $("#profileDiscordInput").value.trim(),
    games: checkedValues("#profileGamesInput").join(", "),
    playTime: "",
    style: $("#profileStyleInput").value,
    bio: $("#profileBioInput").value.trim()
  };
  saveAccount({ ...account, profile });
  renderAccount();
  renderMyPage();
  restore();
  showToast("プロフィールを保存しました", "マイページに反映しました。");
});
$("#profileApplyNameButton").addEventListener("click", () => {
  const name = $("#profileNameInput").value.trim();
  if (!name) {
    showToast("表示名が未入力です", "先にプロフィールの表示名を入力してください。", "", "error");
    return;
  }
  saveAccount({ ...account, name, profile: { ...profileValues(), displayName: name } });
  renderAccount();
  renderMyPage();
  showToast("表示名を反映しました", "募集者プロフィールにもこの名前を使えます。");
});
$("#betaAccessForm").addEventListener("submit", async event => {
  event.preventDefault();
  betaAccess.code = $("#betaAccessInput").value.trim();
  if (betaAccess.code) localStorage.setItem(betaAccessKey, betaAccess.code);
  else localStorage.removeItem(betaAccessKey);
  await syncServerAccount();
  renderBetaAccess();
  showToast(
    betaAccess.granted ? "β参加コードを保存しました" : "β参加コードを確認できませんでした",
    betaAccess.granted ? "このブラウザから投稿できるようになりました。" : "コードを確認して、もう一度入力してください。",
    "",
    betaAccess.granted ? "info" : "error"
  );
});
$("#openBetaFeedbackButton").addEventListener("click", () => {
  openBetaFeedbackDraft();
});
$("#discordLoginButton").addEventListener("click", () => {
  window.location.href = "/auth/discord/start";
});
$("#logoutButton").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" }).catch(() => null);
  const guest = { id: crypto.randomUUID(), name: "Anonymous", discord: "", profile: account.profile || loadProfile() };
  saveAccount(guest);
  renderAll();
});
["#searchInput", "#sortInput", "#gameFilter", "#platformFilter", "#voiceFilter", "#rankFilter", "#styleFilter"].forEach(selector => {
  $(selector).addEventListener("input", () => {
    resetFeedLimit("recruitments");
    debounceRender("recruitments", renderRecruitments);
  });
  $(selector).addEventListener("change", () => {
    resetFeedLimit("recruitments");
    debounceRender("recruitments", renderRecruitments, 20);
  });
});
["#chatSearchInput", "#chatSortInput", "#chatCategoryFilter"].forEach(selector => {
  $(selector).addEventListener("input", () => {
    resetFeedLimit("threads");
    debounceRender("threads", renderThreads);
  });
  $(selector).addEventListener("change", () => {
    resetFeedLimit("threads");
    debounceRender("threads", renderThreads, 20);
  });
});
["#messageInput", "#chatTitleInput", "#chatBodyInput"].forEach(selector => {
  $(selector).addEventListener("input", updateFormStatus);
});

async function init() {
  bindFormDraft(recruitmentDraftKey, recruitmentDraftFields);
  bindFormDraft(threadDraftKey, threadDraftFields);
  updateFormStatus();
  loadCachedState();
  const accountSync = syncServerAccount().catch(() => null);
  const stateSync = loadState();
  await Promise.all([accountSync, stateSync]);
  renderAccount();
  renderBetaAccess();
  renderBetaChecklist();
  restoreRecruitmentDraft();
  updateFormStatus();
  syncCheckListLabels();
  focusSharedCard();
}

window.addEventListener("hashchange", focusSharedCard);
window.addEventListener("unhandledrejection", event => {
  event.preventDefault();
  showErrorToast(event.reason);
});
window.addEventListener("error", event => {
  showErrorToast(event.error || new Error(event.message));
});

init().catch(error => {
  showErrorToast(error);
});
