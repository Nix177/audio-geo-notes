# Déploiement

## Environnements
Le projet contient:
- un frontend web statique
- un backend API Node.js
- une app mobile Expo (Android)

## 1) Déployer le backend API
### Option simple (VM/VPS)
```bash
cd backend
npm ci
PORT=4000 npm start
```

### Avec PM2
```bash
npm install -g pm2
cd backend
npm ci
pm2 start src/index.js --name vocal-walls-api --env production
pm2 save
```

### Variables
- `PORT`: port HTTP API
- `DB_PATH`: chemin du fichier JSON de données (ex: volume persistant)

## 2) Déployer le site web
Le site web est statique et peut être servi par Nginx, GitHub Pages, Hostinger, etc.

Important: configure `window.VOCAL_WALLS_API_BASE` pour pointer vers l'URL publique de l'API si besoin.

Exemple:
```html
<script>
  window.VOCAL_WALLS_API_BASE = "https://api.vocalwalls.io";
</script>
```

## 3) Android (Expo)
### Build cloud EAS
```bash
cd mobile
npm ci
npx expo login
npx eas build:configure
npx eas build --platform android
```

### Runtime API URL
Définir `EXPO_PUBLIC_API_BASE_URL` vers l'API publique:
```bash
EXPO_PUBLIC_API_BASE_URL=https://api.vocalwalls.io npx expo start --android
```

## 4) Vérifications post-déploiement
- `GET /api/health` renvoie `status: up`.
- Le site web charge les notes et les actions like/report mettent à jour les compteurs.
- L'app mobile lit et publie des notes sur la même API.
