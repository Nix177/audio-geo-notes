# Vocal Walls Mobile (React Native / Expo)

## Prérequis
- Node.js 18+
- Android Studio (émulateur Android) ou téléphone Android avec Expo Go

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
Par défaut, l'app utilise `http://10.0.2.2:4000` (émulateur Android).

Pour un téléphone réel:
```bash
set EXPO_PUBLIC_API_BASE_URL=http://<IP_LOCALE_PC>:4000
npm run android
```

ou en PowerShell:
```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://<IP_LOCALE_PC>:4000"
npm run android
```
