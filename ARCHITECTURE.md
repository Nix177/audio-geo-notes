# Technical Architecture - Vocal Walls

## Overview
Trois couches:
- Web frontend (`index.html`, `css/`, `js/`)
- Backend API (`backend/`)
- Mobile Android Expo (`mobile/`)

## Backend
Stack:
- Node.js + Express
- Multer pour uploads audio
- Persistance JSON (`backend/data/notes.json`)
- Fichiers audio dans `backend/uploads`

Notes:
- Champs metier: titre, description, auteur, geoloc, stats moderation, audio URL
- Types: archive et live
- Stream live: demarrage, envoi de chunks audio, heartbeat, arret

## API
- Notes:
  - `GET /api/notes?mode=archive|live`
  - `POST /api/notes` (multipart)
  - `POST /api/notes/:id/votes`
  - `POST /api/notes/:id/report`
  - `POST /api/notes/:id/play`
- Streams:
  - `GET /api/streams`
  - `POST /api/streams/start`
  - `POST /api/streams/:id/audio`
  - `POST /api/streams/:id/heartbeat`
  - `POST /api/streams/:id/stop`

## Web frontend
- Carte Leaflet avec marqueurs geolocalises
- Modal detail avec lecture audio, description, moderation
- Composer modal pour publier et streamer
- Polling periodique pour synchro multi-clients

## Mobile frontend
- Enregistrement audio (expo-av)
- Geolocalisation (expo-location)
- Publication capsule, playback, votes
- Live stream en boucle de chunks audio

## Quality
- Tests integration backend (`backend/tests/api.test.js`)
- Validation syntaxique web (`node --check js/app.js`)
- Validation mobile (`expo-doctor`)
