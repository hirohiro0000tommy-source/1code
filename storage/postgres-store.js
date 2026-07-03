function requirePg() {
  try {
    return require("pg");
  } catch (error) {
    throw new Error("STORAGE_DRIVER=postgres requires the pg package. Run npm install before starting the server.");
  }
}

function toMillis(value) {
  if (!value) return Date.now();
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function toDate(value) {
  const time = Number(value);
  return new Date(Number.isFinite(time) ? time : Date.now());
}

function normalizeTargetType(value) {
  if (value === "recruitment") return "recruitments";
  if (value === "thread") return "threads";
  if (value === "message") return "messages";
  return value;
}

function dbTargetType(value) {
  if (value === "recruitments") return "recruitment";
  if (value === "threads") return "thread";
  if (value === "messages") return "message";
  return value;
}

function normalizeTalkCategory(value) {
  if (value === "大会") return "大会観戦";
  if (value === "攻略") return "攻略相談";
  return ["雑談", "大会観戦", "攻略相談"].includes(value) ? value : "雑談";
}

function normalizePlayStyle(value) {
  if (value === "ガチ" || value === "勝ち重視") return "ガチ";
  if (value === "初心者" || value === "初心者歓迎") return "初心者";
  if (value === "まったり" || value === "楽しく") return "まったり";
  if (value === "エンジョイ" || value === "練習したい" || value === "固定メンバー募集") return "エンジョイ";
  return "エンジョイ";
}

function createPostgresStore() {
  const { Pool } = requirePg();
  const connectionString = process.env.DATABASE_URL;
  const adminAccountIds = String(process.env.ADMIN_ACCOUNT_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  const moderatorAccountIds = String(process.env.MODERATOR_ACCOUNT_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when STORAGE_DRIVER=postgres.");
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  async function ensureDb() {
    await pool.query("select 1");
    for (const accountId of adminAccountIds) {
      await pool.query(
        `insert into profiles (provider, provider_user_id, display_name, role, status)
         values ('local', $1, $1, 'admin', 'active')
         on conflict (provider, provider_user_id) do update set
           role = 'admin',
           status = 'active',
           updated_at = now()`,
        [accountId]
      );
    }
    for (const accountId of moderatorAccountIds) {
      await pool.query(
        `insert into profiles (provider, provider_user_id, display_name, role, status)
         values ('local', $1, $1, 'moderator', 'active')
         on conflict (provider, provider_user_id) do update set
           role = case when profiles.role = 'admin' then 'admin' else 'moderator' end,
           status = 'active',
           updated_at = now()`,
        [accountId]
      );
    }
  }

  async function profileId(client, accountId, displayName) {
    if (!accountId) return null;
    const result = await client.query(
      `insert into profiles (provider, provider_user_id, display_name)
       values ('local', $1, $2)
       on conflict (provider, provider_user_id) do update set
         display_name = coalesce(nullif(excluded.display_name, ''), profiles.display_name),
         updated_at = now()
       returning id`,
      [accountId, displayName || accountId]
    );
    return result.rows[0].id;
  }

  async function read() {
    const client = await pool.connect();
    try {
      const [recruitments, threads, replies, likes, reports, inquiries, directMessages, announcements, adSlots, bannedProfiles, moderationEvents, deletedItems, auditLogs] = await Promise.all([
        client.query(
          `select r.*, p.provider_user_id as owner_account_id, p.display_name as author_name
           from recruitments r
           left join profiles p on p.id = r.owner_id
           where r.status <> 'hidden'
           order by r.created_at desc`
        ),
        client.query(
          `select t.*, p.provider_user_id as owner_account_id, p.display_name as author_name
           from threads t
           left join profiles p on p.id = t.owner_id
           where t.status <> 'hidden'
           order by t.created_at desc`
        ),
        client.query(
          `select rp.*, p.provider_user_id as account_id, p.display_name as author_name
           from replies rp
           left join profiles p on p.id = rp.owner_id
           where rp.status <> 'hidden'
           order by rp.created_at asc`
        ),
        client.query(
          `select l.*, p.provider_user_id as account_id
           from likes l
           left join profiles p on p.id = l.owner_id`
        ),
        client.query(
          `select rp.*, p.provider_user_id as reporter_account_id, p.display_name as reporter_name
           from reports rp
           left join profiles p on p.id = rp.reporter_id
           order by rp.created_at desc`
        ),
        client.query("select * from inquiries order by created_at desc"),
        client.query(
          `select dm.*,
             fp.provider_user_id as from_account_id,
             fp.display_name as from_name,
             tp.provider_user_id as to_account_id,
             tp.display_name as to_name
           from direct_messages dm
           left join profiles fp on fp.id = dm.from_profile_id
           left join profiles tp on tp.id = dm.to_profile_id
           where dm.status <> 'hidden'
           order by dm.created_at asc`
        ),
        client.query("select * from announcements order by created_at desc"),
        client.query("select * from ad_slots order by placement, slot_key"),
        client.query("select provider_user_id, display_name, ban_reason, ban_note, banned_until, updated_at from profiles where status = 'banned'"),
        client.query("select * from moderation_events order by created_at desc limit 500"),
        client.query("select * from deleted_items order by deleted_at desc limit 500"),
        client.query(
          `select al.*, p.provider_user_id as actor_account_id
           from audit_logs al
           left join profiles p on p.id = al.actor_id
           order by al.created_at desc
           limit 500`
        )
      ]);

      const replyMap = new Map();
      for (const row of replies.rows) {
        const key = `${normalizeTargetType(row.target_type)}:${row.target_id}`;
        if (!replyMap.has(key)) replyMap.set(key, []);
        replyMap.get(key).push({
          id: row.id,
          author: row.author_name || "Anonymous",
          accountId: row.account_id || "",
          body: row.body,
          createdAt: toMillis(row.created_at)
        });
      }

      const likeMap = new Map();
      for (const row of likes.rows) {
        const key = `${normalizeTargetType(row.target_type)}:${row.target_id}`;
        if (!likeMap.has(key)) likeMap.set(key, []);
        if (row.account_id) likeMap.get(key).push(row.account_id);
      }

      return {
        recruitments: recruitments.rows.map(row => {
          const key = `recruitments:${row.id}`;
          return {
            id: row.id,
            title: row.title,
            author: row.author_name || "Anonymous",
            game: row.game,
            platform: row.platform,
            voice: row.voice,
            rank: row.rank_label || "",
            time: row.play_time || "",
            style: normalizePlayStyle(row.play_style),
            capacity: row.capacity || 4,
            participants: Array.isArray(row.participants) ? row.participants : [],
            body: row.body,
            status: row.status || "open",
            createdAt: toMillis(row.created_at),
            ownerAccountId: row.owner_account_id || "",
            likes: likeMap.get(key) || [],
            replies: replyMap.get(key) || []
          };
        }),
        threads: threads.rows.map(row => {
          const key = `threads:${row.id}`;
          return {
            id: row.id,
            title: row.title,
            category: normalizeTalkCategory(row.category),
            author: row.author_name || "Anonymous",
            body: row.body,
            createdAt: toMillis(row.created_at),
            ownerAccountId: row.owner_account_id || "",
            likes: likeMap.get(key) || [],
            replies: replyMap.get(key) || []
          };
        }),
        reports: reports.rows.map(row => ({
          id: row.id,
          type: normalizeTargetType(row.target_type),
          itemId: row.target_id,
          parentType: normalizeTargetType(row.parent_type),
          parentId: row.parent_id || "",
          replyId: row.reply_id || "",
          title: "",
          conversationId: "",
          recruitmentId: "",
          messagePreview: "",
          reason: row.reason,
          reporterAccountId: row.reporter_account_id || "",
          reporterName: row.reporter_name || "Anonymous",
          status: row.status,
          resolution: row.resolution || "",
          createdAt: toMillis(row.created_at),
          resolvedAt: row.resolved_at ? toMillis(row.resolved_at) : null
        })),
        bannedAccounts: bannedProfiles.rows.map(row => ({
          accountId: row.provider_user_id,
          displayName: row.display_name || row.provider_user_id,
          reason: row.ban_reason || "moderation",
          note: row.ban_note || "",
          expiresAt: row.banned_until ? toMillis(row.banned_until) : null,
          createdAt: toMillis(row.updated_at)
        })) || [],
        inquiries: inquiries.rows.map(row => ({
          id: row.id,
          name: row.name,
          contact: row.contact || "",
          category: row.category || "その他",
          requestId: row.request_id || "",
          betaFeedbackType: row.beta_feedback_type || "",
          betaFeedbackPriority: row.beta_feedback_priority || "",
          betaFeedbackNote: row.beta_feedback_note || "",
          resolutionNote: row.resolution_note || "",
          message: row.message,
          accountId: row.account_id || "",
          status: row.status || "open",
          createdAt: toMillis(row.created_at),
          resolvedAt: row.resolved_at ? toMillis(row.resolved_at) : null
        })),
        messages: directMessages.rows.map(row => ({
          id: row.id,
          conversationId: row.conversation_id,
          recruitmentId: row.recruitment_id || "",
          recruitmentTitle: row.recruitment_title || "募集",
          fromAccountId: row.from_account_id || "",
          fromName: row.from_name || "Player",
          toAccountId: row.to_account_id || "",
          toName: row.to_name || "Player",
          body: row.body,
          createdAt: toMillis(row.created_at)
        })),
        announcements: announcements.rows.map(row => ({
          id: row.id,
          title: row.title,
          body: row.body,
          tone: row.tone || "info",
          isActive: row.is_active,
          createdAt: toMillis(row.created_at),
          updatedAt: toMillis(row.updated_at)
        })),
        auditLogs: auditLogs.rows.map(row => ({
          id: row.id,
          actorAccountId: row.actor_account_id || "",
          actorName: row.actor_name || "Admin",
          action: row.action,
          details: row.details || {},
          createdAt: toMillis(row.created_at)
        })),
        moderationEvents: moderationEvents.rows.map(row => ({
          id: row.id,
          accountId: row.account_id || "",
          displayName: row.display_name || "Anonymous",
          action: row.action,
          details: row.details || {},
          createdAt: toMillis(row.created_at)
        })),
        deletedItems: deletedItems.rows.map(row => ({
          id: row.id,
          kind: row.kind,
          payload: row.payload || {},
          deletedByAccountId: row.deleted_by_account_id || "",
          deletedByName: row.deleted_by_name || "Admin",
          deletedAt: toMillis(row.deleted_at),
          restoredAt: row.restored_at ? toMillis(row.restored_at) : null
        })),
        adSlots: adSlots.rows.map(row => ({
          id: row.id,
          slotKey: row.slot_key,
          label: row.label,
          placement: row.placement,
          html: row.html || "",
          imageUrl: row.image_url || "",
          targetUrl: row.target_url || "",
          isActive: row.is_active,
          updatedAt: toMillis(row.updated_at)
        }))
      };
    } finally {
      client.release();
    }
  }

  async function write(db) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from reports");
      await client.query("delete from inquiries");
      await client.query("delete from direct_messages");
      await client.query("delete from announcements");
      await client.query("delete from moderation_events");
      await client.query("delete from deleted_items");
      await client.query("delete from audit_logs");
      await client.query("delete from likes");
      await client.query("delete from replies");
      await client.query("delete from recruitments");
      await client.query("delete from threads");
      await client.query("delete from ad_slots");

      for (const item of db.recruitments || []) {
        const ownerId = await profileId(client, item.ownerAccountId, item.author);
        await client.query(
          `insert into recruitments
            (id, owner_id, title, game, platform, voice, rank_label, play_time, play_style, capacity, participants, body, status, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, now())`,
          [item.id, ownerId, item.title, item.game, item.platform, item.voice, item.rank || "", item.time || "", normalizePlayStyle(item.style), item.capacity || 4, JSON.stringify(item.participants || []), item.body, item.status || "open", toDate(item.createdAt)]
        );
        for (const accountId of item.likes || []) {
          const likerId = await profileId(client, accountId, accountId);
          await client.query(
            "insert into likes (owner_id, target_type, target_id, created_at) values ($1, 'recruitment', $2, now()) on conflict do nothing",
            [likerId, item.id]
          );
        }
        for (const reply of item.replies || []) {
          const replyOwnerId = await profileId(client, reply.accountId, reply.author);
          await client.query(
            "insert into replies (id, owner_id, target_type, target_id, body, created_at) values ($1, $2, 'recruitment', $3, $4, $5)",
            [reply.id, replyOwnerId, item.id, reply.body, toDate(reply.createdAt)]
          );
        }
      }

      for (const item of db.threads || []) {
        const ownerId = await profileId(client, item.ownerAccountId, item.author);
        await client.query(
          `insert into threads
            (id, owner_id, title, category, body, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, now())`,
          [item.id, ownerId, item.title, normalizeTalkCategory(item.category), item.body, toDate(item.createdAt)]
        );
        for (const accountId of item.likes || []) {
          const likerId = await profileId(client, accountId, accountId);
          await client.query(
            "insert into likes (owner_id, target_type, target_id, created_at) values ($1, 'thread', $2, now()) on conflict do nothing",
            [likerId, item.id]
          );
        }
        for (const reply of item.replies || []) {
          const replyOwnerId = await profileId(client, reply.accountId, reply.author);
          await client.query(
            "insert into replies (id, owner_id, target_type, target_id, body, created_at) values ($1, $2, 'thread', $3, $4, $5)",
            [reply.id, replyOwnerId, item.id, reply.body, toDate(reply.createdAt)]
          );
        }
      }

      for (const report of db.reports || []) {
        const reporterId = await profileId(client, report.reporterAccountId, report.reporterName);
        await client.query(
          `insert into reports
            (id, reporter_id, target_type, target_id, parent_type, parent_id, reply_id, reason, status, resolution, created_at, resolved_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            report.id,
            reporterId,
            dbTargetType(report.type),
            report.itemId,
            report.parentType ? dbTargetType(report.parentType) : null,
            report.parentId || null,
            report.replyId || null,
            report.reason,
            report.status || "open",
            report.resolution || null,
            toDate(report.createdAt),
            report.resolvedAt ? toDate(report.resolvedAt) : null
          ]
        );
      }

      for (const inquiry of db.inquiries || []) {
        await client.query(
          `insert into inquiries
            (id, account_id, name, contact, category, request_id, beta_feedback_type, beta_feedback_priority, beta_feedback_note, resolution_note, message, status, created_at, resolved_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            inquiry.id,
            inquiry.accountId || null,
            inquiry.name || "Anonymous",
            inquiry.contact || null,
            inquiry.category || "その他",
            inquiry.requestId || null,
            inquiry.betaFeedbackType || null,
            inquiry.betaFeedbackPriority || null,
            inquiry.betaFeedbackNote || null,
            inquiry.resolutionNote || null,
            inquiry.message,
            inquiry.status || "open",
            toDate(inquiry.createdAt),
            inquiry.resolvedAt ? toDate(inquiry.resolvedAt) : null
          ]
        );
      }

      for (const message of db.messages || []) {
        const fromProfileId = await profileId(client, message.fromAccountId, message.fromName);
        const toProfileId = await profileId(client, message.toAccountId, message.toName);
        await client.query(
          `insert into direct_messages
            (id, conversation_id, recruitment_id, recruitment_title, from_profile_id, to_profile_id, body, status, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            message.id,
            message.conversationId,
            message.recruitmentId || null,
            message.recruitmentTitle || null,
            fromProfileId,
            toProfileId,
            message.body,
            message.status === "hidden" ? "hidden" : "visible",
            toDate(message.createdAt)
          ]
        );
      }

      for (const announcement of db.announcements || []) {
        await client.query(
          `insert into announcements
            (id, title, body, tone, is_active, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            announcement.id,
            announcement.title,
            announcement.body,
            announcement.tone || "info",
            announcement.isActive !== false,
            toDate(announcement.createdAt),
            toDate(announcement.updatedAt || announcement.createdAt)
          ]
        );
      }

      for (const slot of db.adSlots || []) {
        await client.query(
          `insert into ad_slots
            (id, slot_key, label, placement, html, image_url, target_url, is_active, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            slot.id,
            slot.slotKey,
            slot.label,
            slot.placement,
            slot.html || null,
            slot.imageUrl || null,
            slot.targetUrl || null,
            Boolean(slot.isActive),
            toDate(slot.updatedAt || Date.now())
          ]
        );
      }

      for (const event of db.moderationEvents || []) {
        await client.query(
          "insert into moderation_events (id, account_id, display_name, action, details, created_at) values ($1, $2, $3, $4, $5::jsonb, $6)",
          [event.id, event.accountId || null, event.displayName || "Anonymous", event.action, JSON.stringify(event.details || {}), toDate(event.createdAt)]
        );
      }

      for (const item of db.deletedItems || []) {
        await client.query(
          `insert into deleted_items
            (id, kind, payload, deleted_by_account_id, deleted_by_name, deleted_at, restored_at)
           values ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
          [
            item.id,
            item.kind,
            JSON.stringify(item.payload || {}),
            item.deletedByAccountId || null,
            item.deletedByName || "Admin",
            toDate(item.deletedAt),
            item.restoredAt ? toDate(item.restoredAt) : null
          ]
        );
      }

      for (const log of db.auditLogs || []) {
        const actorId = await profileId(client, log.actorAccountId, log.actorName || "Admin");
        await client.query(
          "insert into audit_logs (id, actor_id, actor_name, action, details, created_at) values ($1, $2, $3, $4, $5::jsonb, $6)",
          [log.id, actorId, log.actorName || "Admin", log.action, JSON.stringify(log.details || {}), toDate(log.createdAt)]
        );
      }

      await client.query("update profiles set status = 'active', ban_reason = null, ban_note = null, banned_until = null, updated_at = now() where provider in ('local', 'local-import') and status = 'banned'");
      for (const ban of db.bannedAccounts || []) {
        const bannedProfileId = await profileId(client, ban.accountId, ban.displayName);
        await client.query(
          "update profiles set status = 'banned', ban_reason = $2, ban_note = $3, banned_until = $4, updated_at = now() where id = $1",
          [bannedProfileId, ban.reason || "moderation", ban.note || null, ban.expiresAt ? toDate(ban.expiresAt) : null]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  return { ensureDb, read, write };
}

module.exports = { createPostgresStore };
