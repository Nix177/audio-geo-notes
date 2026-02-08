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

## Installation
```bash
cd mobile
npm install
```

## Lancer
```bash
npm run android
```

## URL API
- Defaut emulateur: `http://10.0.2.2:4000`
- L app permet aussi de modifier l URL API directement dans l ecran.

Pour telephone physique:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://<IP_LOCALE_PC>:4000"
npm run android
```
