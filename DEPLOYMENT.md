# Deployment

## Components to deploy
- Backend API (Node.js)
- Static web frontend
- Mobile app build (Expo / EAS)

## 1) Backend API
```bash
cd backend
npm ci
PORT=4000 npm start
```

Recommended env vars:
- `PORT`
- `DB_PATH` (persistent volume path)
- `UPLOADS_DIR` (persistent volume path for audio files)

Important: persist both JSON database and uploads folder.

## 2) Web frontend
Serve root folder with nginx / apache / static hosting.

If API is not on localhost, set:
```html
<script>
  window.VOCAL_WALLS_API_BASE = "https://api.your-domain.com";
</script>
```

## 3) Android app
```bash
cd mobile
npm ci
npx expo login
npx eas build:configure
npx eas build --platform android
```

At runtime, app can target API via:
- env var `EXPO_PUBLIC_API_BASE_URL`
- or direct API URL input in app UI

## Post-deploy checks
- `GET /api/health` returns `status: up`
- create a note with audio from mobile
- verify note appears on web map and can be played
- verify votes/report sync between clients
- start/stop live stream and verify updates on other clients
