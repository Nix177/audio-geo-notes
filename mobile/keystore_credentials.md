# Vocal Walls — Android Keystore Credentials

Ce fichier contient les identifiants du keystore correspondant à la signature attendue par le Google Play Store.

## Empreinte Vérifiée (Google Play)
- **SHA-1** : `A7:73:7F:61:A3:EC:82:53:B9:7D:85:6E:72:E3:FF:ED:55:90:4A:36`

## Fichier Keystore Actuel
- **Localisation** : `mobile/android/app/upload-keystore.jks` (C'est une copie du backup trouvé dans Downloads)
- **Source Originale** : `C:\Users\nicol\Downloads\@nix177__audio-geo-notes-mobile-keystore-backup\@nix177__audio-geo-notes-mobile-keystore.bak.jks`

## Configuration `build.gradle`
```
storeFile file('upload-keystore.jks')
storePassword 'db71623f26a41a37a8ba6c8670f1a9ef'
keyAlias 'f49c3e15cbb22bb37a4e5ab10a3c07e2'
keyPassword '3f4d5d4b220cf39ab6a83e8a2ec7f6b2'
```

> [!IMPORTANT]
> **NE PLUS SUPPRIMER** le fichier `mobile/android/app/upload-keystore.jks`. Sans lui, vous ne pourrez plus mettre à jour l'application sur le Play Store.
