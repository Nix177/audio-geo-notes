# Technical Architecture - Vocal Walls

## Overview
Le projet est organisé en 3 couches:
- `web` (racine): frontend Leaflet/audio (`index.html`, `css/`, `js/`)
- `backend`: API REST Node.js/Express + persistance JSON
- `mobile`: app React Native (Expo) pour Android

## Backend (`backend/`)
### Stack
- Node.js 18+
- Express 4
- CORS
- Persistance locale JSON (`backend/data/notes.json`)

### API
- `GET /api/health`
- `GET /api/notes?mode=archive|live`
- `POST /api/notes`
- `POST /api/notes/:id/votes`
- `POST /api/notes/:id/report`
- `POST /api/notes/:id/play`

### Data model (note)
- `id`, `title`, `author`, `category`, `icon`, `type`
- `isLive`, `lat`, `lng`, `duration`
- `likes`, `downvotes`, `reports`, `plays`, `listeners`
- `createdAt`, `updatedAt`

## Web frontend (`js/app.js`)
### Runtime behavior
- Charge des seeds locales, puis tente la synchro API.
- Fallback local automatique si backend indisponible.
- Actions modération synchronisées avec l'API:
  - like/downvote/report
  - incrément `plays` à l'ouverture du modal
- Création de notes via bouton record/live (API ou fallback local).

## Mobile frontend (`mobile/App.js`)
### Runtime behavior
- Mode `archive/live` avec fetch API.
- Liste des notes avec score visible.
- Actions:
  - création de note
  - like/downvote/report
- Rafraîchissement manuel + état de connexion backend.

## Testing
- Backend: tests d'intégration `node:test` dans `backend/tests/api.test.js`.
- Web: vérification syntaxique `node --check js/app.js`.
- Mobile: validation de config et dépendances via `expo-doctor`.
