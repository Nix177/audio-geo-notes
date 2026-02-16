# Vocal Walls Mobile (Android / Expo)

## Fonctionnalites
- Enregistrement audio local
- Publication d une capsule geolocalisee (titre + description + audio)
- Lecture des notes audio
- Like / Downvote / Report
- Demarrage / arret d un live stream audio (chunks)

## Prerequis
- Node.js 18+
- Android Studio (emulateur) ou smartphone Android avec Expo Go
- Compte Expo (`npx expo login`)
- Compte Google Play Console (pour publication store)

## Installation
```bash
cd mobile
npm install
```

## Lancer en dev
```bash
npm run android
```

## URL API (dev)
- Defaut emulateur: `http://10.0.2.2:4000`
- L app permet aussi de modifier l URL API directement dans l ecran.

Pour telephone physique:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://<IP_LOCALE_PC>:4000"
npm run android
```

## Build Android release (Play Store)
1. API de production:
- Deployer le backend sur HTTPS public (ex: `https://api.ton-domaine.com`).

2. Configurer la variable d environnement Expo (recommande):
```bash
npx eas secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value https://api.ton-domaine.com
```

3. Se connecter Expo:
```bash
npx expo login
```

4. Build AAB production:
```bash
npm run build:android:prod
```

5. Optionnel, build APK interne (QA):
```bash
npm run build:android:preview
```

6. Soumettre sur Google Play (track internal):
```bash
npm run submit:android:prod
```

## Fichiers release
- `eas.json`: profils `preview` (APK) et `production` (AAB)
- `app.json`: package Android `io.vocalwalls.mobile`, versionCode, icone/adaptive icon

## Checklist Play Store
1. Play Console:
- Creer l application
- Completer les fiches Store Listing

2. Politique de confidentialite:
- URL publique obligatoire (permissions micro + localisation)

3. Data safety:
- Declarer collecte/usage audio + localisation

4. Permissions sensibles:
- Justifier `RECORD_AUDIO`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`

5. Test interne:
- Publier d abord sur la piste `internal`
- Verifier publication audio + lecture + geolocalisation sur appareils reels

## Versioning release
- Incremente `expo.version` (ex: `1.0.1`)
- Incremente `android.versionCode` (ex: `2`) a chaque release Play Store
