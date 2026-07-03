const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const inputPath = path.join(root, "data", "db.json");
const outputPath = path.join(root, "db", "import-from-json.sql");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validCategories = new Set(["雑談", "大会観戦", "攻略相談"]);

function normalizeTalkCategory(value) {
  if (value === "大会") return "大会観戦";
  if (value === "攻略") return "攻略相談";
  return validCategories.has(value) ? value : "雑談";
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha1").update(String(text || "unknown")).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

function asUuid(value, namespace) {
  const text = String(value || "");
  return UUID_RE.test(text) ? text : uuidFromText(`${namespace}:${text}`);
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTime(value) {
  const date = Number.isFinite(Number(value)) ? new Date(Number(value)) : new Date();
  return sql(date.toISOString());
}

function collectProfiles(db) {
  const profiles = new Map();
  const add = (accountId, displayName) => {
    if (!accountId) return;
    if (!profiles.has(accountId)) {
      profiles.set(accountId, {
        id: uuidFromText(`account:${accountId}`),
        providerUserId: accountId,
        displayName: displayName || accountId
      });
    }
  };

  for (const item of db.recruitments || []) {
    add(item.ownerAccountId, item.author);
    for (const like of item.likes || []) add(like, like);
    for (const participant of item.participants || []) add(participant.accountId, participant.name);
    for (const reply of item.replies || []) add(reply.accountId, reply.author);
  }
  for (const item of db.threads || []) {
    add(item.ownerAccountId, item.author);
    for (const like of item.likes || []) add(like, like);
    for (const reply of item.replies || []) add(reply.accountId, reply.author);
  }
  for (const report of db.reports || []) {
    add(report.reporterAccountId, report.reporterName);
    add(report.reportedAccountId, report.reportedName);
  }
  for (const inquiry of db.inquiries || []) {
    add(inquiry.accountId, inquiry.name);
  }
  for (const message of db.messages || []) {
    add(message.fromAccountId, message.fromName);
    add(message.toAccountId, message.toName);
  }
  for (const ban of db.bannedAccounts || []) {
    add(ban.accountId, ban.displayName);
  }
  for (const event of db.moderationEvents || []) {
    add(event.accountId, event.displayName);
  }
  for (const item of db.deletedItems || []) {
    add(item.deletedByAccountId, item.deletedByName);
  }
  for (const log of db.auditLogs || []) {
    add(log.actorAccountId, log.actorName);
  }
  return profiles;
}

function profileId(profiles, accountId) {
  return accountId && profiles.has(accountId) ? sql(profiles.get(accountId).id) : "null";
}

function targetType(type) {
  if (type === "recruitments") return "recruitment";
  if (type === "threads") return "thread";
  if (type === "replies") return "reply";
  if (type === "messages" || type === "direct_messages") return "message";
  return type || "recruitment";
}

function linesForDb(db) {
  const profiles = collectProfiles(db);
  const lines = [
    "-- Generated from data/db.json.",
    "-- Apply db/schema.sql first, then db/rls.sql if you use Supabase.",
    "begin;",
    ""
  ];

  for (const profile of profiles.values()) {
    lines.push(
      "insert into profiles (id, provider, provider_user_id, display_name)",
      `values (${sql(profile.id)}, 'local-import', ${sql(profile.providerUserId)}, ${sql(profile.displayName)})`,
      "on conflict (provider, provider_user_id) do update set",
      "  display_name = excluded.display_name,",
      "  updated_at = now();",
      ""
    );
  }

  for (const item of db.recruitments || []) {
    const id = asUuid(item.id, "recruitment");
    const status = ["open", "closed"].includes(item.status) ? item.status : "open";
    lines.push(
      "insert into recruitments (id, owner_id, title, game, platform, voice, rank_label, play_time, play_style, capacity, participants, body, status, created_at, updated_at)",
      `values (${sql(id)}, ${profileId(profiles, item.ownerAccountId)}, ${sql(item.title)}, ${sql(item.game)}, ${sql(item.platform)}, ${sql(item.voice)}, ${sql(item.rank)}, ${sql(item.time)}, ${sql(item.style)}, ${Number(item.capacity || 4)}, ${sql(JSON.stringify(item.participants || []))}::jsonb, ${sql(item.body)}, ${sql(status)}, ${sqlTime(item.createdAt)}, ${sqlTime(item.createdAt)})`,
      "on conflict (id) do nothing;",
      ""
    );
    for (const like of item.likes || []) {
      lines.push(
        "insert into likes (owner_id, target_type, target_id, created_at)",
        `values (${profileId(profiles, like)}, 'recruitment', ${sql(id)}, now())`,
        "on conflict (owner_id, target_type, target_id) do nothing;",
        ""
      );
    }
    for (const reply of item.replies || []) {
      lines.push(
        "insert into replies (id, owner_id, target_type, target_id, body, created_at)",
        `values (${sql(asUuid(reply.id, "reply"))}, ${profileId(profiles, reply.accountId)}, 'recruitment', ${sql(id)}, ${sql(reply.body)}, ${sqlTime(reply.createdAt)})`,
        "on conflict (id) do nothing;",
        ""
      );
    }
  }

  for (const item of db.threads || []) {
    const id = asUuid(item.id, "thread");
    const category = normalizeTalkCategory(item.category);
    lines.push(
      "insert into threads (id, owner_id, title, category, body, created_at, updated_at)",
      `values (${sql(id)}, ${profileId(profiles, item.ownerAccountId)}, ${sql(item.title)}, ${sql(category)}, ${sql(item.body)}, ${sqlTime(item.createdAt)}, ${sqlTime(item.createdAt)})`,
      "on conflict (id) do nothing;",
      ""
    );
    for (const like of item.likes || []) {
      lines.push(
        "insert into likes (owner_id, target_type, target_id, created_at)",
        `values (${profileId(profiles, like)}, 'thread', ${sql(id)}, now())`,
        "on conflict (owner_id, target_type, target_id) do nothing;",
        ""
      );
    }
    for (const reply of item.replies || []) {
      lines.push(
        "insert into replies (id, owner_id, target_type, target_id, body, created_at)",
        `values (${sql(asUuid(reply.id, "reply"))}, ${profileId(profiles, reply.accountId)}, 'thread', ${sql(id)}, ${sql(reply.body)}, ${sqlTime(reply.createdAt)})`,
        "on conflict (id) do nothing;",
        ""
      );
    }
  }

  for (const report of db.reports || []) {
    const type = targetType(report.type);
    const parentType = report.parentType ? targetType(report.parentType) : null;
    lines.push(
      "insert into reports (id, reporter_id, target_type, target_id, parent_type, parent_id, reply_id, reason, status, resolution, created_at, resolved_at)",
      `values (${sql(asUuid(report.id, "report"))}, ${profileId(profiles, report.reporterAccountId)}, ${sql(type)}, ${sql(asUuid(report.itemId, type))}, ${sql(parentType)}, ${report.parentId ? sql(asUuid(report.parentId, parentType || "parent")) : "null"}, ${report.replyId ? sql(asUuid(report.replyId, "reply")) : "null"}, ${sql(report.reason)}, ${sql(report.status || "open")}, ${sql(report.resolution)}, ${sqlTime(report.createdAt)}, ${report.resolvedAt ? sqlTime(report.resolvedAt) : "null"})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  for (const inquiry of db.inquiries || []) {
    lines.push(
      "insert into inquiries (id, account_id, name, contact, category, request_id, beta_feedback_type, beta_feedback_priority, beta_feedback_note, resolution_note, message, status, created_at, resolved_at)",
      `values (${sql(asUuid(inquiry.id, "inquiry"))}, ${sql(inquiry.accountId)}, ${sql(inquiry.name || "Anonymous")}, ${sql(inquiry.contact)}, ${sql(inquiry.category || "その他")}, ${sql(inquiry.requestId)}, ${sql(inquiry.betaFeedbackType)}, ${sql(inquiry.betaFeedbackPriority)}, ${sql(inquiry.betaFeedbackNote)}, ${sql(inquiry.resolutionNote)}, ${sql(inquiry.message)}, ${sql(inquiry.status || "open")}, ${sqlTime(inquiry.createdAt)}, ${inquiry.resolvedAt ? sqlTime(inquiry.resolvedAt) : "null"})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  for (const message of db.messages || []) {
    const status = message.status === "hidden" ? "hidden" : "visible";
    lines.push(
      "insert into direct_messages (id, conversation_id, recruitment_id, recruitment_title, from_profile_id, to_profile_id, body, status, created_at)",
      `values (${sql(asUuid(message.id, "message"))}, ${sql(message.conversationId || message.id)}, ${message.recruitmentId ? sql(asUuid(message.recruitmentId, "recruitment")) : "null"}, ${sql(message.recruitmentTitle)}, ${profileId(profiles, message.fromAccountId)}, ${profileId(profiles, message.toAccountId)}, ${sql(message.body)}, ${sql(status)}, ${sqlTime(message.createdAt)})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  for (const announcement of db.announcements || []) {
    lines.push(
      "insert into announcements (id, title, body, tone, is_active, created_at, updated_at)",
      `values (${sql(asUuid(announcement.id, "announcement"))}, ${sql(announcement.title)}, ${sql(announcement.body)}, ${sql(announcement.tone || "info")}, ${sql(announcement.isActive !== false)}, ${sqlTime(announcement.createdAt)}, ${sqlTime(announcement.updatedAt || announcement.createdAt)})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  for (const slot of db.adSlots || []) {
    lines.push(
      "insert into ad_slots (id, slot_key, label, placement, html, image_url, target_url, is_active, updated_at)",
      `values (${sql(asUuid(slot.id, "ad-slot"))}, ${sql(slot.slotKey)}, ${sql(slot.label)}, ${sql(slot.placement)}, ${sql(slot.html)}, ${sql(slot.imageUrl)}, ${sql(slot.targetUrl)}, ${sql(Boolean(slot.isActive))}, ${sqlTime(slot.updatedAt || Date.now())})`,
      "on conflict (slot_key) do update set",
      "  label = excluded.label,",
      "  placement = excluded.placement,",
      "  html = excluded.html,",
      "  image_url = excluded.image_url,",
      "  target_url = excluded.target_url,",
      "  is_active = excluded.is_active,",
      "  updated_at = excluded.updated_at;",
      ""
    );
  }

  for (const ban of db.bannedAccounts || []) {
    if (!ban.accountId || !profiles.has(ban.accountId)) continue;
    lines.push(
      "update profiles set",
      `  status = 'banned', display_name = ${sql(ban.displayName || ban.accountId)},`,
      `  ban_reason = ${sql(ban.reason || "moderation")},`,
      `  ban_note = ${sql(ban.note || "")},`,
      `  banned_until = ${ban.expiresAt ? sqlTime(ban.expiresAt) : "null"},`,
      "  updated_at = now()",
      `where id = ${sql(profiles.get(ban.accountId).id)};`,
      ""
    );
  }

  for (const event of db.moderationEvents || []) {
    lines.push(
      "insert into moderation_events (id, account_id, display_name, action, details, created_at)",
      `values (${sql(asUuid(event.id, "moderation-event"))}, ${sql(event.accountId)}, ${sql(event.displayName || "Anonymous")}, ${sql(event.action)}, ${sql(JSON.stringify(event.details || {}))}::jsonb, ${sqlTime(event.createdAt)})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  for (const item of db.deletedItems || []) {
    lines.push(
      "insert into deleted_items (id, kind, payload, deleted_by_account_id, deleted_by_name, deleted_at, restored_at)",
      `values (${sql(asUuid(item.id, "deleted-item"))}, ${sql(item.kind)}, ${sql(JSON.stringify(item.payload || {}))}::jsonb, ${sql(item.deletedByAccountId)}, ${sql(item.deletedByName || "Admin")}, ${sqlTime(item.deletedAt)}, ${item.restoredAt ? sqlTime(item.restoredAt) : "null"})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  for (const log of db.auditLogs || []) {
    lines.push(
      "insert into audit_logs (id, actor_id, actor_name, action, details, created_at)",
      `values (${sql(asUuid(log.id, "audit-log"))}, ${profileId(profiles, log.actorAccountId)}, ${sql(log.actorName || "Admin")}, ${sql(log.action)}, ${sql(JSON.stringify(log.details || {}))}::jsonb, ${sqlTime(log.createdAt)})`,
      "on conflict (id) do nothing;",
      ""
    );
  }

  lines.push("commit;", "");
  return lines.join("\n");
}

if (!fs.existsSync(inputPath)) {
  console.error(`Missing ${inputPath}`);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(inputPath, "utf8"));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, linesForDb(db), "utf8");
console.log(`Wrote ${outputPath}`);
