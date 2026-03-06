const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

function scoreForNote(note) {
  return note.likes - note.downvotes - note.reports * 2;
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

function shouldHideNote(note) {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const noteAgeMs = note.createdAt ? (Date.now() - new Date(note.createdAt).getTime()) : 0;
  const isOlderThan3Days = noteAgeMs > (3 * ONE_DAY);
  
  const negativeWeight = (note.downvotes || 0) + ((note.reports || 0) * 2);
  const positiveWeight = (note.likes || 0);
  const totalVotes = negativeWeight + positiveWeight;

  if (isOlderThan3Days && negativeWeight > positiveWeight) {
    return true;
  }

  if (totalVotes > 0 && (negativeWeight / totalVotes) > 0.15) {
    return true;
  }

  return false;
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

function isInRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
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
  const geoAccuracy = parseOptionalNumber(body.geoAccuracy);
  const geoCapturedAtRaw = toStringOrEmpty(body.geoCapturedAt);

  const isLive = forceLive ? true : parseBoolean(body.isLive, false);
  const isStream = forceStream ? true : parseBoolean(body.isStream, false);

  if (lat === undefined || lng === undefined) {
    return { error: "lat and lng are required" };
  }
  if (!isInRange(lat, -90, 90) || !isInRange(lng, -180, 180)) {
    return { error: "lat or lng is out of range" };
  }

  if (geoCapturedAtRaw) {
    const capturedAt = Date.parse(geoCapturedAtRaw);
    if (!Number.isFinite(capturedAt)) {
      return { error: "geoCapturedAt must be an ISO date" };
    }
    const driftMs = Math.abs(Date.now() - capturedAt);
    if (driftMs > 5 * 60 * 1000) {
      return { error: "geolocation proof is too old" };
    }
  }

  if (
    geoAccuracy !== undefined &&
    (!Number.isFinite(geoAccuracy) || geoAccuracy < 0 || geoAccuracy > 1000)
  ) {
    return { error: "geoAccuracy is invalid" };
  }

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
      lat,
      lng,
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

function getClientKey(req) {
  const explicitKey = toStringOrEmpty(req.get("x-client-id"));
  if (explicitKey) return explicitKey.slice(0, 120);

  const forwardedFor = toStringOrEmpty(req.get("x-forwarded-for"));
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function createWriteLimiter({ windowMs = 60_000, maxWrites = 120 } = {}) {
  const historyByClient = new Map();

  return function writeLimiter(req, res, next) {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }

    const key = getClientKey(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const history = historyByClient.get(key) || [];
    const freshHistory = history.filter((entryTs) => entryTs > cutoff);

    if (freshHistory.length >= maxWrites) {
      return res.status(429).json({
        ok: false,
        error: "rate limit exceeded"
      });
    }

    freshHistory.push(now);
    historyByClient.set(key, freshHistory);
    return next();
  };
}

function createApp({ store, uploadsDir, abuseConfig = {} }) {
  const app = express();
  const upload = createUploader(uploadsDir);
  const writeLimiter = createWriteLimiter({
    windowMs: abuseConfig.windowMs,
    maxWrites: abuseConfig.maxWrites
  });
  const voteRegistry = new Map();
  const reportRegistry = new Map();
  const lastPostByClient = new Map();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", writeLimiter);
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

    const notes = store.listNotes(mode)
      .filter((note) => !shouldHideNote(note))
      .map((note) => serializeNote(note, req));
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

      const clientKey = getClientKey(req);
      const lat = parsed.value.lat;
      const lng = parsed.value.lng;
      const now = Date.now();

      if (lastPostByClient.has(clientKey)) {
        const lastPost = lastPostByClient.get(clientKey);
        const distance = getDistanceInMeters(lastPost.lat, lastPost.lng, lat, lng);
        const timeDiffSeconds = (now - lastPost.timestamp) / 1000;
        
        if (timeDiffSeconds > 0) {
          const speed = distance / timeDiffSeconds;
          if (speed > 83 && distance > 200) {
            return res.status(403).json({ ok: false, error: "Triche détectée: déplacement trop rapide." });
          }
        }
      }

      lastPostByClient.set(clientKey, { lat, lng, timestamp: now });

      const created = await store.createNote(parsed.value);
      return res.status(201).json({ ok: true, data: serializeNote(created, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/streams", (req, res) => {
    const activeOnly = parseBoolean(req.query.active, true);
    const streams = store.listStreams(activeOnly)
      .filter((note) => !shouldHideNote(note))
      .map((note) => serializeNote(note, req));
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

      const clientKey = getClientKey(req);
      const lat = parsed.value.lat;
      const lng = parsed.value.lng;
      const now = Date.now();

      if (lastPostByClient.has(clientKey)) {
        const lastPost = lastPostByClient.get(clientKey);
        const distance = getDistanceInMeters(lastPost.lat, lastPost.lng, lat, lng);
        const timeDiffSeconds = (now - lastPost.timestamp) / 1000;
        
        if (timeDiffSeconds > 0) {
          const speed = distance / timeDiffSeconds;
          if (speed > 83 && distance > 200) {
            return res.status(403).json({ ok: false, error: "Triche détectée: déplacement trop rapide." });
          }
        }
      }

      lastPostByClient.set(clientKey, { lat, lng, timestamp: now });

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

      const targetNote = store.getNoteById(req.params.id);
      if (!targetNote) {
        return res.status(404).json({ ok: false, error: "note not found" });
      }

      const clientKey = getClientKey(req);
      const votesForNote = voteRegistry.get(targetNote.id) || new Map();
      const previousVote = votesForNote.get(clientKey);

      if (previousVote === voteType) {
        return res.status(409).json({
          ok: false,
          error: "vote already submitted"
        });
      }

      if (previousVote) {
        await store.removeVote(targetNote.id, previousVote);
      }

      votesForNote.set(clientKey, voteType);
      voteRegistry.set(targetNote.id, votesForNote);

      const updatedNote = await store.applyVote(req.params.id, voteType);
      return res.json({ ok: true, data: serializeNote(updatedNote, req) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/report", async (req, res, next) => {
    try {
      const note = store.getNoteById(req.params.id);
      if (!note) {
        return res.status(404).json({ ok: false, error: "note not found" });
      }

      const clientKey = getClientKey(req);
      const reportsForNote = reportRegistry.get(note.id) || new Set();
      if (reportsForNote.has(clientKey)) {
        return res.status(409).json({
          ok: false,
          error: "report already submitted"
        });
      }

      reportsForNote.add(clientKey);
      reportRegistry.set(note.id, reportsForNote);

      const reported = await store.reportNote(req.params.id);
      return res.json({ ok: true, data: serializeNote(reported, req) });
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
