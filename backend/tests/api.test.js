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
  const uploadsDir = path.join(tempDir, "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const store = new NotesStore(dbPath, seedNotes);
  await store.init();

  const app = createApp({ store, uploadsDir });
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

function buildAudioForm(fields = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, String(value));
  }
  form.set("audio", new Blob(["fake audio bytes"], { type: "audio/webm" }), "clip.webm");
  return form;
}

test("GET /api/health returns service status", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const { status, body } = await jsonResponse(await fetch(`${ctx.baseUrl}/api/health`));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.status, "up");
});

test("POST /api/notes accepts multipart audio and returns audioUrl", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const form = buildAudioForm({
    title: "Test Audio Note",
    description: "Description note test",
    author: "QA Bot",
    lat: "48.857",
    lng: "2.353"
  });

  const createdResponse = await fetch(`${ctx.baseUrl}/api/notes`, {
    method: "POST",
    body: form
  });
  const created = await jsonResponse(createdResponse);

  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.data.title, "Test Audio Note");
  assert.equal(created.body.data.description, "Description note test");
  assert.ok(typeof created.body.data.audioUrl === "string");
  assert.ok(created.body.data.audioUrl.includes("/uploads/"));
  const uploadedAudioResponse = await fetch(created.body.data.audioUrl);
  assert.equal(uploadedAudioResponse.status, 200);
  const uploadedContentType = (uploadedAudioResponse.headers.get("content-type") || "").toLowerCase();
  assert.ok(
    uploadedContentType.startsWith("audio/") ||
      uploadedContentType.startsWith("video/webm") ||
      uploadedContentType.startsWith("application/octet-stream")
  );

  const noteId = created.body.data.id;

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

test("stream lifecycle: start, upload chunks, heartbeat, stop", async (t) => {
  const ctx = await startTestServer();
  t.after(async () => ctx.cleanup());

  const startForm = new FormData();
  startForm.set("title", "Live Test Session");
  startForm.set("description", "Session de test live");
  startForm.set("author", "Live QA");
  startForm.set("lat", "48.85");
  startForm.set("lng", "2.34");

  const startedResponse = await fetch(`${ctx.baseUrl}/api/streams/start`, {
    method: "POST",
    body: startForm
  });
  const started = await jsonResponse(startedResponse);

  assert.equal(started.status, 201);
  assert.equal(started.body.ok, true);
  assert.equal(started.body.data.isLive, true);
  assert.equal(started.body.data.isStream, true);
  assert.equal(started.body.data.streamActive, true);

  const streamId = started.body.data.id;

  const chunkForm = buildAudioForm();
  const chunkResponse = await fetch(`${ctx.baseUrl}/api/streams/${streamId}/audio`, {
    method: "POST",
    body: chunkForm
  });
  const chunkUpdated = await jsonResponse(chunkResponse);
  assert.equal(chunkUpdated.status, 200);
  assert.ok(chunkUpdated.body.data.audioUrl);

  const heartbeatResponse = await fetch(`${ctx.baseUrl}/api/streams/${streamId}/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listeners: 17 })
  });
  const heartbeat = await jsonResponse(heartbeatResponse);
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.data.listeners, 17);

  const stopResponse = await fetch(`${ctx.baseUrl}/api/streams/${streamId}/stop`, {
    method: "POST"
  });
  const stopped = await jsonResponse(stopResponse);
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.data.streamActive, false);
  assert.equal(stopped.body.data.isLive, false);

  const lateChunkResponse = await fetch(`${ctx.baseUrl}/api/streams/${streamId}/audio`, {
    method: "POST",
    body: buildAudioForm()
  });
  const lateChunk = await jsonResponse(lateChunkResponse);
  assert.equal(lateChunk.status, 409);

  const liveList = await jsonResponse(await fetch(`${ctx.baseUrl}/api/notes?mode=live`));
  assert.equal(liveList.status, 200);
  assert.ok(liveList.body.data.every((note) => note.id !== streamId));

  const archiveList = await jsonResponse(await fetch(`${ctx.baseUrl}/api/notes?mode=archive`));
  assert.equal(archiveList.status, 200);
  assert.ok(archiveList.body.data.some((note) => note.id === streamId));
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
