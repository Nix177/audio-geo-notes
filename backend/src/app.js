const express = require("express");
const cors = require("cors");

function scoreForNote(note) {
  return note.likes - note.downvotes - note.reports * 2;
}

function serializeNote(note) {
  return {
    ...note,
    score: scoreForNote(note)
  };
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return number;
}

function parseCreateBody(body = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";

  if (!title) {
    return { error: "title is required" };
  }
  if (!author) {
    return { error: "author is required" };
  }

  const duration = parseOptionalNumber(body.duration);
  const lat = parseOptionalNumber(body.lat);
  const lng = parseOptionalNumber(body.lng);
  const listeners = parseOptionalNumber(body.listeners);

  return {
    value: {
      title,
      author,
      category: category || "🎧 Ambiance",
      icon: typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "🎧",
      type: type || "story",
      duration: duration === undefined ? 120 : duration,
      isLive: Boolean(body.isLive),
      lat: lat === undefined ? 48.8566 : lat,
      lng: lng === undefined ? 2.3522 : lng,
      baseHealth: 80,
      likes: 0,
      downvotes: 0,
      reports: 0,
      plays: 0,
      listeners: listeners === undefined ? 0 : listeners
    }
  };
}

function createApp({ store }) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

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

    const notes = store.listNotes(mode).map(serializeNote);
    return res.json({
      ok: true,
      data: notes
    });
  });

  app.post("/api/notes", async (req, res, next) => {
    try {
      const parsed = parseCreateBody(req.body);
      if (parsed.error) {
        return res.status(400).json({
          ok: false,
          error: parsed.error
        });
      }

      const created = await store.createNote(parsed.value);
      return res.status(201).json({
        ok: true,
        data: serializeNote(created)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/votes", async (req, res, next) => {
    try {
      const voteType = req.body?.type;
      if (voteType !== "like" && voteType !== "dislike") {
        return res.status(400).json({
          ok: false,
          error: "type must be like or dislike"
        });
      }

      const note = await store.applyVote(req.params.id, voteType);
      if (!note) {
        return res.status(404).json({
          ok: false,
          error: "note not found"
        });
      }

      return res.json({
        ok: true,
        data: serializeNote(note)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/report", async (req, res, next) => {
    try {
      const note = await store.reportNote(req.params.id);
      if (!note) {
        return res.status(404).json({
          ok: false,
          error: "note not found"
        });
      }

      return res.json({
        ok: true,
        data: serializeNote(note)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notes/:id/play", async (req, res, next) => {
    try {
      const note = await store.incrementPlay(req.params.id);
      if (!note) {
        return res.status(404).json({
          ok: false,
          error: "note not found"
        });
      }

      return res.json({
        ok: true,
        data: serializeNote(note)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/stats", (_req, res) => {
    const notes = store.listNotes();
    const total = notes.length;
    const live = notes.filter((note) => note.isLive).length;
    const archive = total - live;
    const totalReports = notes.reduce((sum, note) => sum + note.reports, 0);

    res.json({
      ok: true,
      data: {
        total,
        live,
        archive,
        totalReports
      }
    });
  });

  app.use((error, _req, res, _next) => {
    console.error("[api:error]", error);
    res.status(500).json({
      ok: false,
      error: "internal server error"
    });
  });

  return app;
}

module.exports = {
  createApp
};
