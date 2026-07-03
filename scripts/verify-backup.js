const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const backupPath = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!backupPath) {
  fail("Usage: node scripts/verify-backup.js <backup-file.json>");
}

const absolutePath = path.resolve(process.cwd(), backupPath);
if (!fs.existsSync(absolutePath)) {
  fail(`Backup file not found: ${absolutePath}`);
}

let backup;
try {
  backup = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
} catch (error) {
  fail(`Backup is not valid JSON: ${error.message}`);
}

if (backup.format !== "partyfinder-backup-v1") {
  fail(`Unsupported backup format: ${backup.format || "missing"}`);
}

if (!backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
  fail("Backup data object is missing.");
}

const expectedChecksum = backup.checksum || "";
if (!expectedChecksum.startsWith("sha256:")) {
  fail("Backup checksum is missing.");
}

const actualChecksum = `sha256:${crypto.createHash("sha256").update(JSON.stringify(backup.data)).digest("hex")}`;
if (actualChecksum !== expectedChecksum) {
  fail(`Backup checksum mismatch. Expected ${expectedChecksum}, got ${actualChecksum}`);
}

if (!backup.exportedAt || Number.isNaN(Date.parse(backup.exportedAt))) {
  fail("Backup exportedAt timestamp is missing or invalid.");
}

const requiredArrays = [
  "recruitments",
  "threads",
  "messages",
  "reports",
  "inquiries",
  "announcements",
  "bannedAccounts",
  "moderationEvents",
  "deletedItems",
  "auditLogs",
  "adSlots"
];

for (const key of requiredArrays) {
  if (!Array.isArray(backup.data[key])) {
    fail(`Backup data.${key} must be an array.`);
  }
}

const summary = {
  recruitments: backup.data.recruitments.length,
  threads: backup.data.threads.length,
  messages: backup.data.messages.length,
  reports: backup.data.reports.length,
  inquiries: backup.data.inquiries.length,
  deletedItems: backup.data.deletedItems.length,
  auditLogs: backup.data.auditLogs.length
};

console.log(`Backup verified: ${absolutePath}`);
console.log(`Exported at: ${backup.exportedAt}`);
console.log(`Summary: ${Object.entries(summary).map(([key, value]) => `${key}=${value}`).join(", ")}`);
