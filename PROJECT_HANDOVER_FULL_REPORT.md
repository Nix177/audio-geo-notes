# PROJECT HANDOVER FULL REPORT

Date: 2026-02-08
Repository: `https://github.com/Nix177/audio-geo-notes.git`
Branch: `main`

## 1) Executive summary

`audio-geo-notes` is now a full-stack demo for:
- posting geolocated audio notes (title + description + audio),
- seeing those notes on web and mobile,
- listening to audio notes from web and mobile,
- voting (like/downvote) and reporting content,
- starting/stopping a live audio stream (chunk-based near real-time model),
- syncing data through a backend API.

The project currently includes:
- a static web app (`index.html`, `css/style.css`, `js/app.js`),
- a Node/Express backend (`backend/`),
- an Expo React Native Android app (`mobile/`).

## 2) Current Git status (checked now)

Commands run:
- `git fetch origin`
- `git status -sb`
- `git branch -vv`
- `git log --oneline --decorate -n 8`

Observed status:
- local branch is `main`.
- `main` is ahead of `origin/main` by 2 commits.
- there are local uncommitted modifications (listed below in section 3).

Conclusion:
- Git is coherent locally, but **not fully synced to remote yet** because:
  - there are uncommitted changes,
  - and local is already ahead of remote.

To be fully up to date remotely, run:
```bash
git add -A
git commit -m "docs: add full project handover report and latest fixes"
git push origin main
```

## 3) Files changed in the latest work

Main changed files:
- `backend/src/app.js`
- `backend/src/store.js`
- `backend/src/index.js`
- `backend/src/seed-data.js`
- `backend/tests/api.test.js`
- `backend/package.json`
- `backend/package-lock.json`
- `index.html`
- `css/style.css`
- `js/app.js`
- `mobile/App.js`
- `mobile/app.json`
- `mobile/package.json`
- `mobile/package-lock.json`
- `README.md`
- `ARCHITECTURE.md`
- `DEPLOYMENT.md`
- `backend/README.md`
- `mobile/README.md`

Diff footprint (latest local diff snapshot):
- 19 files changed
- ~1716 insertions
- ~1476 deletions

## 4) What was implemented

### Backend
- Added real multipart audio upload handling with `multer`.
- Added static audio serving via `/uploads`.
- Added note serialization with computed `audioUrl`.
- Added stream lifecycle endpoints:
  - start stream,
  - upload stream audio chunk,
  - heartbeat update,
  - stop stream.
- Added richer note/stream model fields:
  - `description`, `audioPath`, `audioMime`,
  - `isStream`, `streamActive`, `streamStartedAt`, `streamEndedAt`.
- Added/updated moderation + usage actions:
  - vote, report, play counters.
- Added stats endpoint.
- Added/updated backend integration tests for:
  - multipart note upload,
  - vote/report/play flow,
  - full stream lifecycle,
  - invalid vote rejection,
  - static audio retrieval check,
  - chunk upload rejected after stream stop.

### Web app
- Added modal support for:
  - note description,
  - real audio player (`<audio>`),
  - empty-audio state.
- Added composer modal for:
  - title/description/author,
  - map-based position selection,
  - recording toggle,
  - publish note,
  - start/stop live stream.
- Added stream chunk upload + heartbeat loop.
- Added live modal refresh for active streams.
- Added stricter publish behavior:
  - note publish now requires recorded audio.
- Improved API error handling:
  - differentiates HTTP errors from network failures.

### Mobile app (React Native / Expo)
- Reworked app to support:
  - API URL input in UI,
  - archive/live mode listing,
  - geolocation updates (`expo-location`),
  - recording and playback (`expo-av`),
  - note publish with multipart audio,
  - vote/report,
  - stream lifecycle (start/chunk loop/heartbeat/stop).
- Improved permission handling:
  - audio permission and location permission are separated.
- Improved API error handling:
  - HTTP errors keep API marked reachable.
- Added cleanup for active live recording loop on unmount.
- Added Android permissions in `mobile/app.json`.
- Added `expo-asset` plugin/dependency to make Android export/build path stable.

### Documentation
- Updated root and component READMEs to match current architecture and flow.
- Updated architecture and deployment docs.

## 5) Detailed functional behavior

### 5.1 Create an archive note (web or mobile)
1. User records audio on client.
2. Client builds `multipart/form-data` with fields:
   - `title`, `description`, `author`, `lat`, `lng`, etc.
   - file field `audio`.
3. Client calls `POST /api/notes`.
4. Backend stores note metadata in JSON DB and writes uploaded file under uploads dir.
5. Backend returns note JSON with `audioUrl`.
6. Other clients pull updates by polling `GET /api/notes?mode=archive`.

### 5.2 Playback + counters
1. User opens note details.
2. Client plays `audioUrl`.
3. Client calls `POST /api/notes/:id/play`.
4. Backend increments `plays`, updates `updatedAt`.

### 5.3 Moderation interactions
- Like/downvote:
  - `POST /api/notes/:id/votes` with `{ "type": "like" | "dislike" }`
- Report:
  - `POST /api/notes/:id/report`
- Clients use optimistic local updates then reconcile with API response.

### 5.4 Live stream model (current)
Current stream is chunk-based, not pure low-latency WebRTC:
1. Client creates stream note via `POST /api/streams/start`.
2. Client records short chunks repeatedly and uploads each chunk:
   - `POST /api/streams/:id/audio` (multipart with `audio`).
3. Client updates listeners periodically:
   - `POST /api/streams/:id/heartbeat`.
4. Stream stop:
   - `POST /api/streams/:id/stop`.
5. On stop, stream becomes archive content (`isLive=false`, `streamActive=false`).

## 6) API reference (practical)

Core endpoints:
- `GET /api/health`
- `GET /api/notes?mode=archive|live`
- `GET /api/notes/:id`
- `POST /api/notes` (multipart, `audio` optional in backend but required by current web/mobile UX for note publish)
- `POST /api/notes/:id/votes`
- `POST /api/notes/:id/report`
- `POST /api/notes/:id/play`
- `GET /api/streams`
- `POST /api/streams/start`
- `POST /api/streams/:id/audio`
- `POST /api/streams/:id/heartbeat`
- `POST /api/streams/:id/stop`
- `GET /api/stats`

## 7) Runbook (new machine)

### 7.1 Prerequisites
- Git
- Node.js 18+ (recommended LTS)
- npm
- Python 3 (only if you use `python -m http.server` for static web)
- Android Studio emulator or Android phone + Expo Go (for mobile testing)

### 7.2 Clone and run backend
```bash
git clone https://github.com/Nix177/audio-geo-notes.git
cd audio-geo-notes/backend
npm install
npm start
```
Default backend URL: `http://localhost:4000`

### 7.3 Run web app
From repo root:
```bash
python -m http.server 8080
```
Open:
- `http://localhost:8080`

### 7.4 Run mobile app (Android)
```bash
cd mobile
npm install
npm run android
```

API base:
- emulator default: `http://10.0.2.2:4000`
- physical phone on same Wi-Fi:
  - set app API URL in UI to `http://<YOUR_PC_LAN_IP>:4000`
  - or set env before launch:
  ```powershell
  $env:EXPO_PUBLIC_API_BASE_URL="http://<YOUR_PC_LAN_IP>:4000"
  npm run android
  ```

## 8) Validation done

Executed successfully:
- Web syntax check:
  - `node --check js/app.js`
- Backend checks:
  - `cd backend && npm run lint`
  - `cd backend && npm test` (4/4 pass)
- Mobile checks:
  - `cd mobile && npx expo-doctor` (all checks passed)
  - `cd mobile && npx expo export --platform android` (bundle generated)
- Backend smoke runtime:
  - server startup + `GET /api/health` verified.

## 9) Remaining work (priority order)

### P0 (before high-stakes external demo)
- Add a true real-time streaming path (WebRTC/Agora/LiveKit), because current model is chunk-based.
- Add auth and identity:
  - user account/session,
  - basic anti-abuse limits (rate limit, duplicate vote protection server-side).
- Harden storage:
  - move JSON DB to PostgreSQL,
  - move local uploads to object storage (S3/R2/etc).

### P1
- Real-time updates via websocket/SSE (reduce polling delay).
- Improve moderation:
  - server-side rules, flags, thresholds, audit trail.
- Improve mobile UX:
  - clearer stream status and reconnect states.

### P2
- Analytics dashboard (engagement, retention, stream metrics).
- Community features (profiles, comments, follows, map clusters by popularity).

## 10) Known limitations

- Streaming is chunk upload loop, not continuous low-latency transport.
- Persistence is file-based JSON + local filesystem uploads.
- No authentication in backend API.
- Polling-based sync (not push-driven).
- No CDN/media transcoding pipeline yet.

## 11) How to install Codex in VS Code on another computer

Official references:
- Codex IDE extension overview:
  - `https://developers.openai.com/codex/ide`
- Codex quickstart:
  - `https://developers.openai.com/codex/quickstart`
- Codex Windows setup (WSL guidance):
  - `https://developers.openai.com/codex/windows`

### Recommended setup for Windows (stable path)
1. Install WSL (PowerShell admin):
```powershell
wsl --install
```
2. Install VS Code + extension:
   - VS Code
   - "WSL" extension
   - "Codex" extension (from VS Code Marketplace).
3. Open project from WSL terminal:
```bash
cd ~/code
git clone https://github.com/Nix177/audio-geo-notes.git
cd audio-geo-notes
code .
```
4. In VS Code, confirm status bar shows `WSL: <distro>`.
5. Open Codex panel and sign in:
   - with ChatGPT account, or
   - with OpenAI API key.

### Alternative CLI setup
Inside WSL:
```bash
npm install -g @openai/codex
codex
```

## 12) Starter prompt to continue exactly from here

Copy/paste this in Codex on the new machine:

```text
You are continuing the project audio-geo-notes from a previous coding session.

Context:
- Full handover is in PROJECT_HANDOVER_FULL_REPORT.md.
- Goal: investor-ready app (web + backend + React Native Android) for geolocated audio posts, listening, voting/reporting, and live stream.
- Current stream is chunk-based; we may move to real-time later.

What to do first:
1) Read PROJECT_HANDOVER_FULL_REPORT.md fully.
2) Run a fresh validation:
   - backend: npm install && npm test
   - web: node --check js/app.js
   - mobile: npm install && npx expo-doctor
3) Confirm git status and report exactly what is committed/uncommitted.
4) Propose and implement the next highest-value milestone for demo quality, with tests.

Constraints:
- Do not revert unrelated user changes.
- Keep UX simple and intuitive.
- Prioritize reliability over adding flashy features.
```

## 13) Quick next-session checklist

- [ ] Commit and push latest local changes.
- [ ] Run full E2E test with 1 web + 1 Android emulator + 1 physical phone.
- [ ] Decide next milestone:
  - A: real-time stream architecture,
  - B: authentication + anti-abuse,
  - C: production storage migration.

