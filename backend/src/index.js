const path = require("node:path");
const { createApp } = require("./app");
const { NotesStore } = require("./store");
const { seedNotes } = require("./seed-data");

async function startServer() {
  const port = Number(process.env.PORT || 4000);
  const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "notes.json");

  const store = new NotesStore(dbPath, seedNotes);
  await store.init();

  const app = createApp({ store });
  const server = app.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
    console.log(`[api] database: ${dbPath}`);
  });

  return { app, server, store };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("[api] failed to start", error);
    process.exitCode = 1;
  });
}

module.exports = {
  startServer
};
