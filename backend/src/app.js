const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

function scoreForNote(note) {
  return note.likes - note.downvotes - note.reports * 2;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return number;
}

function toStringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildAudioUrl(req, note) {
  if (!note.audioPath) return null;
  const filename = path.basename(note.audioPath);
  return `${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(filename)}`;
}

function serializeNote(note, req) {
  const safe = { ...note };
  delete safe.audioPath;
  return {
    ...safe,
    audioUrl: buildAudioUrl(req, note),
    score: scoreForNote(note)
  };
}

function parseNotePayload(body = {}, file = null, options = {}) {
  const forceLive = Boolean(options.forceLive);
  const forceStream = Boolean(options.forceStream);

  const title = toStringOrEmpty(body.title);
  const author = toStringOrEmpty(body.author) || "Utilisateur";
  const description = toStringOrEmpty(body.description);

  if (!title) {
    return { error: "title is required" };
  }

  const duration = parseOptionalNumber(body.duration);
  const lat = parseOptionalNumber(body.lat);
  const lng = parseOptionalNumber(body.lng);
  const listeners = parseOptionalNumber(body.listeners);

  const isLive = forceLive ? true : parseBoolean(body.isLive, false);
  const isStream = forceStream ? true : parseBoolean(body.isStream, false);

  return {
    value: {
      title,
      description,
      author,
      category: toStringOrEmpty(body.category) || (isLive ? "Live" : "Communaute"),
      icon: toStringOrEmpty(body.icon) || (isLive ? "LIVE" : "AUDIO"),
      type: toStringOrEmpty(body.type) || (isLive ? "live" : "story"),
      duration: duration === undefined ? (isLive ? 180 : 120) : duration,
      isLive,
      isStream,
      streamActive: isStream ? true : parseBoolean(body.streamActive, false),
      lat: lat === undefined ? 48.8566 : lat,
      lng: lng === undefined ? 2.3522 : lng,
      baseHealth: 80,
      likes: 0,
      downvotes: 0,
      reports: 0,
      plays: 0,
      listeners: listeners === undefined ? (isLive ? 1 : 0) : listeners,
      audioPath: file?.path || null,
      audioMime: file?.mimetype || null
    }
  };
}

function createUploader(uploadsDir) {
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadsDir);
    },
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".webm";
      callback(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (!file.mimetype || !file.mimetype.startsWith("audio/")) {
        callback(new Error("only audio files are allowed"));
        return;
      }
      callback(null, true);
    }
  });
}

function createApp({ store, uploadsDir }) {
  const app = express();
  const upload = createUploader(uploadsDir);

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads", express.static(uploadsDir));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      data: {
        service: "audio-geo-notes-api",
        status: "up",
        timestamp: new Date().toISOString()
      }
    });
  });

  app.get("/api/notes", (req, res) => {
    const mode = req.query.mode;
    if (mode && mode !== "archive" && mode !== "live") {
      return res.status(400).json({
        ok: false,
        error: "mode must be archive or live"
      });
    }

    const notes = store.listNotes(mode).map((note) => serializeNote(note, req));
    return res.json({ ok: true, data: notes });
  });

  app.get("/api/notes/:id", (req, res) => {
    const note = store.getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ ok: false, error: "note not found" });
    }
    return res.json({ ok: true, data: serializeNote(note, req) });
  });

  app.post("/api/notes", upload.single("audio"), async (req, res, next) => {
    try {
      const parsed = parseNotePayload(req.body, req.file, {
        forceLive: false,
        forceStream: false
      });
      if (parsed.error) {
        return res.status(400).json({ ok: false, error: parsed.error });
      }

      const created = await store.createNote(parsed.value);
      return res.status(201).json({ ok: true, data: serializeNote(created, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/streams", (req, res) => {
    const activeOnly = parseBoolean(req.query.active, true);
    const streams = store.listStreams(activeOnly).map((note) => serializeNote(note, req));
    return res.json({ ok: true, data: streams });
  });

  app.post("/api/streams/start", upload.single("audio"), async (req, res, next) => {
    try {
      const parsed = parseNotePayload(req.body, req.file, {
        forceLive: true,
        forceStream: true
      });
      if (parsed.error) {
        return res.status(400).json({ ok: false, error: parsed.error });
      }

      const stream = await store.startStream(parsed.value);
      return res.status(201).json({ ok: true, data: serializeNote(stream, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/streams/:id/audio", upload.single("audio"), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "audio file is required" });
      }

      const existing = store.getNoteById(req.params.id);
      if (!existing || !existing.isStream) {
        return res.status(404).json({ ok: false, error: "stream not found" });
      }
      if (!existing.streamActive) {
        return res.status(409).json({ ok: false, error: "stream is not active" });
      }

      const previousPath = existing.audioPath;
      const updated = await store.attachAudio(req.params.id, {
        audioPath: req.file.path,
        audioMime: req.file.mimetype
      });

      if (
        previousPath &&
        previousPath !== updated.audioPath &&
        path.dirname(previousPath) === path.resolve(uploadsDir)
      ) {
        await fs.unlink(previousPath).catch(() => {});
      }

      return res.json({ ok: true, data: serializeNote(updated, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/streams/:id/heartbeat", async (req, res, next) => {
    try {
      const listeners = parseOptionalNumber(req.body?.listeners);
      const updated = await store.updateStreamHeartbeat(req.params.id, listeners);
      if (!updated) {
        return res.status(404).json({ ok: false, error: "stream not found" });
      }
      return res.json({ ok: true, data: serializeNote(updated, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/streams/:id/stop", async (req, res, next) => {
    try {
      const stopped = await store.stopStream(req.params.id);
      if (!stopped) {
        return res.status(404).json({ ok: false, error: "stream not found" });
      }
      return res.json({ ok: true, data: serializeNote(stopped, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/votes", async (req, res, next) => {
    try {
      const voteType = req.body?.type;
      if (voteType !== "like" && voteType !== "dislike") {
        return res.status(400).json({ ok: false, error: "type must be like or dislike" });
      }

      const note = await store.applyVote(req.params.id, voteType);
      if (!note) {
        return res.status(404).json({ ok: false, error: "note not found" });
      }

      return res.json({ ok: true, data: serializeNote(note, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/report", async (req, res, next) => {
    try {
      const note = await store.reportNote(req.params.id);
      if (!note) {
        return res.status(404).json({ ok: false, error: "note not found" });
      }
      return res.json({ ok: true, data: serializeNote(note, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/play", async (req, res, next) => {
    try {
      const note = await store.incrementPlay(req.params.id);
      if (!note) {
        return res.status(404).json({ ok: false, error: "note not found" });
      }
      return res.json({ ok: true, data: serializeNote(note, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/stats", (_req, res) => {
    const notes = store.listNotes();
    const total = notes.length;
    const live = notes.filter((note) => note.isLive).length;
    const streams = notes.filter((note) => note.isStream).length;
    const activeStreams = notes.filter((note) => note.isStream && note.streamActive).length;
    const totalReports = notes.reduce((sum, note) => sum + note.reports, 0);

    res.json({
      ok: true,
      data: {
        total,
        live,
        streams,
        activeStreams,
        archive: total - live,
        totalReports
      }
    });
  });

  app.use((error, _req, res, _next) => {
    console.error("[api:error]", error);
    res.status(500).json({ ok: false, error: error.message || "internal server error" });
  });

  return app;
}

module.exports = {
  createApp
};
