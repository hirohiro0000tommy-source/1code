const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "db.json");

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log("Local demo data was removed. Restart the server to recreate clean seed data.");
} else {
  console.log("Local demo data is already empty. Restart the server to create seed data.");
}
