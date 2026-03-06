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

## Protection anti-abus (demo)
- Limitation de debit sur les ecritures API (`POST/PUT/PATCH/DELETE`): au-dela du seuil, reponse `429`.
- Vote deduplique par client et par note: meme vote repete => `409`, bascule like/dislike autorisee.
- Report deduplique par client et par note: second report identique => `409`.
- Identite client:
  - priorite a l'en-tete `x-client-id` (recommande pour mobile/web),
  - fallback sur IP (`x-forwarded-for` / `req.ip`).

## Tests
```bash
npm test
```
