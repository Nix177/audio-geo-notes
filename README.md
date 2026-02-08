# Vocal Walls - Audio Geo Notes

Plateforme full-stack pour capsules audio geolocalisees et live communautaires.

## Ce que la demo permet
- Poster un son geolocalise avec **titre + description + audio**.
- Voir la note sur carte/web et dans l'app mobile.
- Ecouter depuis web et mobile.
- Voter (like/downvote) et reporter.
- Demarrer un **stream live audio** (chunks en quasi temps reel) depuis web ou mobile.

## Structure
- `index.html`, `css/`, `js/`: version web
- `backend/`: API REST + uploads audio
- `mobile/`: app React Native Android (Expo)

## 1) Backend (obligatoire)
```bash
cd backend
npm install
npm start
```

API par defaut: `http://localhost:4000`

Endpoints cle:
- `GET /api/notes?mode=archive|live`
- `POST /api/notes` (multipart audio)
- `POST /api/notes/:id/votes`
- `POST /api/notes/:id/report`
- `POST /api/notes/:id/play`
- `POST /api/streams/start`
- `POST /api/streams/:id/audio`
- `POST /api/streams/:id/heartbeat`
- `POST /api/streams/:id/stop`

## 2) Site web
Servir la racine en HTTP (pas `file://`):

```bash
python -m http.server 8080
```

Ouvrir ensuite: `http://localhost:8080`

Le web utilise `window.VOCAL_WALLS_API_BASE` (defaut `http://localhost:4000`).

## 3) Mobile Android (Expo)
```bash
cd mobile
npm install
npm run android
```

Par defaut, l'app cible `http://10.0.2.2:4000` (emulateur Android).

Pour telephone physique (meme wifi):
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://<IP_LOCALE_PC>:4000"
npm run android
```

## Tests
Backend:
```bash
cd backend
npm test
```
