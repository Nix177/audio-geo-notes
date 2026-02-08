const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}

function clampInteger(value, min = 0) {
  return Math.max(min, Math.round(value));
}

function normalizeSeedNote(note, index) {
  const timestamp = nowIso();
  return {
    id: note.id || `seed_${index}_${crypto.randomUUID().slice(0, 8)}`,
    title: note.title || "Note sans titre",
    category: note.category || "🎧 Ambiance",
    icon: note.icon || "🎧",
    type: note.type || "story",
    author: note.author || "Anonyme",
    duration: clampInteger(toSafeNumber(note.duration, 120), 10),
    baseHealth: clampInteger(toSafeNumber(note.baseHealth, 80), 0),
    isLive: Boolean(note.isLive),
    lat: toSafeNumber(note.lat, 48.8566),
    lng: toSafeNumber(note.lng, 2.3522),
    likes: clampInteger(toSafeNumber(note.likes, 0), 0),
    downvotes: clampInteger(toSafeNumber(note.downvotes, 0), 0),
    reports: clampInteger(toSafeNumber(note.reports, 0), 0),
    plays: clampInteger(toSafeNumber(note.plays, 0), 0),
    listeners: clampInteger(toSafeNumber(note.listeners, 0), 0),
    createdAt: note.createdAt || timestamp,
    updatedAt: note.updatedAt || timestamp
  };
}

class NotesStore {
  constructor(filePath, seedNotes = []) {
    this.filePath = filePath;
    this.seedNotes = seedNotes;
    this.state = null;
    this.persistQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      this.state = {
        notes: notes.map((note, index) => normalizeSeedNote(note, index))
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = {
        notes: this.seedNotes.map((note, index) => normalizeSeedNote(note, index))
      };
      await this.persist();
    }
  }

  async persist() {
    const payload = JSON.stringify(this.state, null, 2);
    this.persistQueue = this.persistQueue.then(() =>
      fs.writeFile(this.filePath, payload, "utf8")
    );
    return this.persistQueue;
  }

  ensureReady() {
    if (!this.state) {
      throw new Error("Store not initialized");
    }
  }

  listNotes(mode) {
    this.ensureReady();
    let notes = this.state.notes;

    if (mode === "archive") {
      notes = notes.filter((note) => !note.isLive);
    } else if (mode === "live") {
      notes = notes.filter((note) => note.isLive);
    }

    return notes
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  getNoteById(noteId) {
    this.ensureReady();
    return this.state.notes.find((note) => note.id === noteId) || null;
  }

  async createNote(input) {
    this.ensureReady();
    const timestamp = nowIso();
    const note = normalizeSeedNote(
      {
        ...input,
        id: `note_${crypto.randomUUID()}`,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      this.state.notes.length
    );

    this.state.notes.push(note);
    await this.persist();
    return note;
  }

  async applyVote(noteId, voteType) {
    this.ensureReady();
    const note = this.getNoteById(noteId);
    if (!note) return null;

    if (voteType === "like") {
      note.likes += 1;
    } else if (voteType === "dislike") {
      note.downvotes += 1;
    } else {
      throw new Error("Invalid vote type");
    }

    note.updatedAt = nowIso();
    await this.persist();
    return note;
  }

  async reportNote(noteId) {
    this.ensureReady();
    const note = this.getNoteById(noteId);
    if (!note) return null;

    note.reports += 1;
    note.updatedAt = nowIso();
    await this.persist();
    return note;
  }

  async incrementPlay(noteId) {
    this.ensureReady();
    const note = this.getNoteById(noteId);
    if (!note) return null;

    note.plays += 1;
    note.updatedAt = nowIso();
    await this.persist();
    return note;
  }
}

module.exports = {
  NotesStore
};
