const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const { NotesStore } = require("../src/store");
const { createApp } = require("../src/app");
const { seedNotes } = require("../src/seed-data");

async function startTestServer() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audio-geo-notes-"));
  const dbPath = path.join(tempDir, "notes.json");

  const store = new NotesStore(dbPath, seedNotes);
  await store.init();

  const app = createApp({ store });
  const server = app.listen(0);
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    server,
    cleanup: async () => {
      server.close();
      await once(server, "close");
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

async function jsonResponse(response) {
  const body = await response.json();
  return {
    status: response.status,
    body
  };
}

test("GET /api/health returns service status", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const { status, body } = await jsonResponse(await fetch(`${ctx.baseUrl}/api/health`));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.status, "up");
});

test("GET /api/notes returns filtered live notes", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const { status, body } = await jsonResponse(await fetch(`${ctx.baseUrl}/api/notes?mode=live`));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((note) => note.isLive));
});

test("POST /api/notes creates a new note then allows vote/report/play", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const createPayload = {
    title: "Test Note",
    author: "QA Bot",
    category: "🧪 Test",
    type: "story",
    icon: "🧪",
    duration: 95,
    lat: 48.857,
    lng: 2.353
  };

  const createdResponse = await fetch(`${ctx.baseUrl}/api/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(createPayload)
  });
  const created = await jsonResponse(createdResponse);
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.data.title, createPayload.title);

  const noteId = created.body.data.id;
  assert.ok(noteId);

  const likeResponse = await fetch(`${ctx.baseUrl}/api/notes/${noteId}/votes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "like" })
  });
  const liked = await jsonResponse(likeResponse);
  assert.equal(liked.status, 200);
  assert.equal(liked.body.data.likes, 1);

  const reportResponse = await fetch(`${ctx.baseUrl}/api/notes/${noteId}/report`, {
    method: "POST"
  });
  const reported = await jsonResponse(reportResponse);
  assert.equal(reported.status, 200);
  assert.equal(reported.body.data.reports, 1);

  const playResponse = await fetch(`${ctx.baseUrl}/api/notes/${noteId}/play`, {
    method: "POST"
  });
  const played = await jsonResponse(playResponse);
  assert.equal(played.status, 200);
  assert.equal(played.body.data.plays, 1);
});

test("POST /api/notes/:id/votes rejects invalid vote type", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const notesData = await jsonResponse(await fetch(`${ctx.baseUrl}/api/notes`));
  const noteId = notesData.body.data[0].id;

  const invalidVoteResponse = await fetch(`${ctx.baseUrl}/api/notes/${noteId}/votes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "up" })
  });
  const invalidVote = await jsonResponse(invalidVoteResponse);
  assert.equal(invalidVote.status, 400);
  assert.equal(invalidVote.body.ok, false);
});
