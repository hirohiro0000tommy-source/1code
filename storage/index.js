const { createJsonStore } = require("./json-store");
const { createPostgresStore } = require("./postgres-store");

function createStore({ root, initialData }) {
  const driver = process.env.STORAGE_DRIVER || "json";
  if (driver === "json") return createJsonStore({ root, initialData });
  if (driver === "postgres") return createPostgresStore({ root, initialData });
  throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
}

module.exports = { createStore };
