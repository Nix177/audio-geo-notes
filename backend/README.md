# Vocal Walls Backend API

## Prerequis
- Node.js 18+

## Installation
```bash
cd backend
npm install
```

## Demarrage
```bash
npm start
```

API par defaut: `http://localhost:4000`

## Variables d'environnement
- `PORT` (optionnel): port HTTP, defaut `4000`
- `DB_PATH` (optionnel): chemin du fichier JSON de persistance
- `UPLOADS_DIR` (optionnel): dossier des fichiers audio uploades

## Endpoints principaux
- `GET /api/health`
- `GET /api/notes?mode=archive|live`
- `POST /api/notes` (multipart, champ `audio` optionnel)
- `POST /api/notes/:id/votes` (`like` / `dislike`)
- `POST /api/notes/:id/report`
- `POST /api/notes/:id/play`
- `GET /api/streams`
- `POST /api/streams/start`
- `POST /api/streams/:id/audio` (multipart audio)
- `POST /api/streams/:id/heartbeat`
- `POST /api/streams/:id/stop`

## Tests
```bash
npm test
```
