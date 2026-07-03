const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const dataPath = path.join(process.env.DATA_DIR || path.join(root, "data"), "db.json");
const backupDir = path.join(root, "backups");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeData(data) {
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
    data[key] = Array.isArray(data[key]) ? data[key] : [];
  }
  return data;
}

if (!fs.existsSync(dataPath)) {
  console.error(`Missing local data file: ${dataPath}`);
  process.exit(1);
}

const data = normalizeData(JSON.parse(fs.readFileSync(dataPath, "utf8")));
const dataJson = JSON.stringify(data);
const payload = {
  exportedAt: new Date().toISOString(),
  format: "partyfinder-backup-v1",
  checksum: `sha256:${crypto.createHash("sha256").update(dataJson).digest("hex")}`,
  data
};

fs.mkdirSync(backupDir, { recursive: true });
const outputPath = path.join(backupDir, `backup-${stamp()}.json`);
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`Wrote ${outputPath}`);
