const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const node = process.execPath;
const backupDir = path.join(root, "backups");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(name => /^backup-.*\.json$/.test(name))
    .map(name => {
      const fullPath = path.join(backupDir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const before = new Set(listBackups().map(item => item.fullPath));
const backupResult = spawnSync(node, ["scripts/backup-json-data.js"], {
  cwd: root,
  env: process.env,
  encoding: "utf8"
});

if (backupResult.status !== 0) {
  process.stdout.write(backupResult.stdout || "");
  process.stderr.write(backupResult.stderr || "");
  fail("Backup drill failed while creating a backup.");
}

const created = listBackups().find(item => !before.has(item.fullPath));
if (!created) {
  fail("Backup drill could not find the newly created backup file.");
}

const verifyResult = spawnSync(node, ["scripts/verify-backup.js", created.fullPath], {
  cwd: root,
  env: process.env,
  encoding: "utf8"
});

process.stdout.write(verifyResult.stdout || "");
process.stderr.write(verifyResult.stderr || "");

if (verifyResult.status !== 0) {
  fail("Backup drill failed while verifying the new backup.");
}

console.log(`Backup drill passed: ${created.fullPath}`);
