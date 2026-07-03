const fs = require("fs");
const path = require("path");

function createJsonStore({ root, initialData }) {
  const dataDir = process.env.DATA_DIR || path.join(root, "data");
  const dbPath = path.join(dataDir, "db.json");

  function ensureDb() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), "utf8");
    }
  }

  function read() {
    ensureDb();
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  }

  function write(db) {
    ensureDb();
    const tempPath = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tempPath, dbPath);
  }

  return { dbPath, ensureDb, read, write };
}

module.exports = { createJsonStore };
