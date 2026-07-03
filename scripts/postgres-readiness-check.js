const requiredTables = {
  profiles: ["id", "provider", "provider_user_id", "display_name", "role", "status", "ban_reason", "ban_note", "banned_until", "created_at", "updated_at"],
  recruitments: ["id", "owner_id", "title", "game", "platform", "voice", "rank_label", "play_time", "play_style", "capacity", "participants", "body", "status", "created_at", "updated_at"],
  threads: ["id", "owner_id", "title", "category", "body", "status", "created_at", "updated_at"],
  replies: ["id", "owner_id", "target_type", "target_id", "body", "status", "created_at"],
  likes: ["id", "owner_id", "target_type", "target_id", "created_at"],
  reports: ["id", "reporter_id", "target_type", "target_id", "parent_type", "parent_id", "reply_id", "reason", "status", "resolution", "created_at", "resolved_at"],
  inquiries: ["id", "account_id", "name", "contact", "category", "request_id", "beta_feedback_type", "beta_feedback_priority", "beta_feedback_note", "resolution_note", "message", "status", "created_at", "resolved_at"],
  direct_messages: ["id", "conversation_id", "recruitment_id", "recruitment_title", "from_profile_id", "to_profile_id", "body", "status", "created_at"],
  announcements: ["id", "title", "body", "tone", "is_active", "created_at", "updated_at"],
  ad_slots: ["id", "slot_key", "label", "placement", "html", "image_url", "target_url", "is_active", "created_at", "updated_at"],
  moderation_events: ["id", "account_id", "display_name", "action", "details", "created_at"],
  deleted_items: ["id", "kind", "payload", "deleted_by_account_id", "deleted_by_name", "deleted_at", "restored_at"],
  audit_logs: ["id", "actor_id", "actor_name", "action", "details", "created_at"]
};

const requiredPolicies = {
  direct_messages: [
    "dm participants read messages",
    "users send own messages",
    "moderators hide direct messages"
  ]
};

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const adminRolePlaceholders = [
  "discord:replace-with-your-discord-user-id",
  "discord:replace-with-moderator-discord-user-id"
];

function requirePg() {
  try {
    return require("pg");
  } catch (error) {
    throw new Error("pg package is required. Run npm install before checking Postgres readiness.");
  }
}

async function main() {
  const generatedAdminRolesPath = path.join(root, "db", "generated-admin-roles.sql");
  const adminRolesPath = fs.existsSync(generatedAdminRolesPath)
    ? generatedAdminRolesPath
    : path.join(root, "db", "admin-roles.sql");
  const adminRolesSql = fs.readFileSync(adminRolesPath, "utf8");
  const remainingPlaceholders = adminRolePlaceholders.filter(value => adminRolesSql.includes(value));
  if (remainingPlaceholders.length && (process.env.DATABASE_URL || process.env.NODE_ENV === "production")) {
    throw new Error(`${path.relative(root, adminRolesPath)} still contains placeholder account IDs: ${remainingPlaceholders.join(", ")}. Run npm run admin:roles:write with real ADMIN_ACCOUNT_IDS before applying staff roles.`);
  }

  if (!process.env.DATABASE_URL) {
    if (process.env.STORAGE_DRIVER === "postgres" || process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required for Postgres readiness checks.");
    }
    console.log("Postgres readiness skipped: DATABASE_URL is not set.");
    return;
  }

  const { Pool } = requirePg();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query("select 1");
    const tables = Object.keys(requiredTables);
    const result = await pool.query(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public' and table_name = any($1)
       order by table_name, ordinal_position`,
      [tables]
    );
    const columnsByTable = new Map();
    for (const row of result.rows) {
      if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
      columnsByTable.get(row.table_name).add(row.column_name);
    }

    const missing = [];
    for (const [table, columns] of Object.entries(requiredTables)) {
      const actual = columnsByTable.get(table);
      if (!actual) {
        missing.push(`${table} table`);
        continue;
      }
      for (const column of columns) {
        if (!actual.has(column)) missing.push(`${table}.${column}`);
      }
    }

    if (missing.length) {
      throw new Error(`Postgres schema is missing: ${missing.join(", ")}`);
    }

    const rls = await pool.query(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace and relname = any($1)`,
      [tables]
    );
    const rlsMissing = rls.rows.filter(row => !row.relrowsecurity).map(row => row.relname);
    if (rlsMissing.length) {
      throw new Error(`RLS is not enabled on: ${rlsMissing.join(", ")}`);
    }

    const policyResult = await pool.query(
      `select tablename, policyname
       from pg_policies
       where schemaname = 'public' and tablename = any($1)`,
      [Object.keys(requiredPolicies)]
    );
    const policiesByTable = new Map();
    for (const row of policyResult.rows) {
      if (!policiesByTable.has(row.tablename)) policiesByTable.set(row.tablename, new Set());
      policiesByTable.get(row.tablename).add(row.policyname);
    }
    const missingPolicies = [];
    for (const [table, policies] of Object.entries(requiredPolicies)) {
      const actual = policiesByTable.get(table) || new Set();
      for (const policy of policies) {
        if (!actual.has(policy)) missingPolicies.push(`${table}: ${policy}`);
      }
    }
    if (missingPolicies.length) {
      throw new Error(`Postgres RLS policies are missing: ${missingPolicies.join(", ")}`);
    }

    console.log("Postgres readiness passed");
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
