# Vocal Walls - Audio Geo Notes

Projet full-stack avec:
- **Site web** (frontend Leaflet + audio mock)
- **Backend API** Node.js/Express avec persistance JSON
- **Application mobile Android** React Native (Expo)

## Structure
- `index.html`, `css/`, `js/`: version web
- `backend/`: API REST
- `mobile/`: app React Native Android

## 1) Backend (obligatoire)
```bash
cd backend
npm install
npm start
```

API disponible sur `http://localhost:4000`.

Endpoints principaux:
- `GET /api/health`
- `GET /api/notes?mode=archive|live`
- `POST /api/notes`
- `POST /api/notes/:id/votes` (`{ "type": "like" | "dislike" }`)
- `POST /api/notes/:id/report`
- `POST /api/notes/:id/play`

## 2) Site web
Servir le dossier racine en HTTP (pas en `file://`), par exemple:

```bash
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

Le web consomme l'API sur `http://localhost:4000` (surcharge possible via `window.VOCAL_WALLS_API_BASE`).

## 3) Mobile Android (React Native / Expo)
```bash
cd mobile
npm install
npm run android
```

Par défaut l'app utilise `http://10.0.2.2:4000` (émulateur Android).

Pour un téléphone physique:
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
