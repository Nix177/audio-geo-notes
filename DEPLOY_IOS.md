# Déployer Vocal Walls sur TestFlight (iOS) - Guide Ultra-Détaillé

Ce guide suppose que tu as déjà un **Compte Apple Developer** ($99/an) actif.

---

## PHASE 1 : Préparer App Store Connect (dans le navigateur)

### Étape 1.1 — Créer l'app sur App Store Connect

1. Va sur [App Store Connect](https://appstoreconnect.apple.com/) et connecte-toi avec ton Apple ID développeur.
2. Clique sur **"Apps"** (ou "Mes apps").
3. Clique sur le bouton **"+"** en haut à gauche → **"Nouvelle app"**.
4. Remplis les champs :
   - **Plateformes** : ✅ iOS
   - **Nom** : `Vocal Walls` (le nom affiché sur l'App Store)
   - **Langue principale** : `Français`
   - **Bundle ID** : Sélectionne `io.vocalwalls.mobile`
     - ⚠️ Si le Bundle ID n'apparaît pas dans la liste, clique sur le lien **"Register a new Bundle ID on the Developer Portal"** (voir étape 1.2)
   - **SKU** : `vocalwalls-ios-1` (identifiant interne, ce que tu veux)
   - **Accès** : `Accès complet`
5. Clique sur **"Créer"**.

### Étape 1.2 — Enregistrer le Bundle ID (si pas déjà fait)

1. Va sur le [Apple Developer Portal → Identifiers](https://developer.apple.com/account/resources/identifiers/list).
2. Clique sur **"+"**.
3. Sélectionne **"App IDs"** → **Continue**.
4. Sélectionne **"App"** → **Continue**.
5. Remplis :
   - **Description** : `Vocal Walls Mobile`
   - **Bundle ID** : Sélectionne **"Explicit"** et tape : `io.vocalwalls.mobile`
6. Coche les capabilities dont tu as besoin (pour l'instant, aucune spéciale nécessaire).
7. Clique **Continue** → **Register**.
8. Retourne à l'étape 1.1 et sélectionne ce Bundle ID.

### Étape 1.3 — Récupérer les identifiants nécessaires

Tu auras besoin de 3 infos pour la config EAS. Voici où les trouver :

| Info | Où la trouver |
|------|--------------|
| **Apple ID** (email) | Ton email de connexion Apple Developer |
| **Apple Team ID** | [developer.apple.com/account](https://developer.apple.com/account) → en haut à droite ou dans "Membership Details" → **Team ID** (format: `ABC123DEFG`) |
| **ASC App ID** | App Store Connect → Ta nouvelle app → **Informations générales** → **Apple ID** (un nombre, ex: `6449012345`) |

---

## PHASE 2 : Configurer EAS Submit (dans ton code)

### Étape 2.1 — Mettre à jour `eas.json`

Ouvre le fichier `mobile/eas.json` et remplace les 3 valeurs placeholder dans la section `submit.production.ios` :

```json
"ios": {
  "appleId": "ton-email@icloud.com",       ← ton Apple ID
  "ascAppId": "6449012345",                ← le nombre trouvé à l'étape 1.3
  "appleTeamId": "ABC123DEFG"              ← le Team ID trouvé à l'étape 1.3
}
```

---

## PHASE 3 : Lancer le Build + Upload vers TestFlight

### Étape 3.1 — Ouvrir un terminal dans le dossier `mobile/`

```bash
cd c:\Users\nicol\OneDrive\Documents\Sites\audio-geo-notes\mobile
```

### Étape 3.2 — Lancer la commande de build iOS

```bash
npx eas build --platform ios --auto-submit
```

> Le flag `--auto-submit` va automatiquement envoyer le build terminé vers App Store Connect (TestFlight).

### Étape 3.3 — Répondre aux questions interactives

EAS va te poser plusieurs questions. Voici exactement quoi répondre :

1. **"Log in to your Apple Developer account"**
   - Tape ton **Apple ID** (email) → Entrée
   - Tape ton **mot de passe** → Entrée
   - Si 2FA activée : entre le **code à 6 chiffres** reçu sur ton iPhone/Mac

2. **"Select a team"** (si tu as plusieurs équipes)
   - Sélectionne ton équipe personnelle

3. **"Generate a new Apple Distribution Certificate?"**
   - Réponds **Yes** (Y)

4. **"Generate a new Apple Provisioning Profile?"**
   - Réponds **Yes** (Y)

5. **La build démarre** 🚀
   - Tu verras un lien pour suivre la progression en direct
   - La build prend généralement **10-20 minutes**

6. **"Submit to App Store Connect?"**
   - Grâce à `--auto-submit`, c'est automatique

### Étape 3.4 — Attendre le traitement Apple

Après l'upload, Apple traite le build (vérifications automatiques) :
- ⏱️ Durée : **5 à 30 minutes**
- Tu recevras un **email** quand c'est prêt
- Le statut passe de "Processing" à "Ready to Test" dans App Store Connect

---

## PHASE 4 : Activer TestFlight

### Étape 4.1 — Vérifier le build dans App Store Connect

1. Va sur [App Store Connect](https://appstoreconnect.apple.com/) → **Apps** → **Vocal Walls**.
2. Clique sur l'onglet **"TestFlight"** dans le menu de gauche.
3. Tu devrais voir ton build avec le numéro de version `1.0.0`.
4. Le statut devrait être **"Ready to Test"** (ou "Missing Compliance" — voir ci-dessous).

### Étape 4.2 — Répondre aux questions de conformité (obligation)

Apple te demandera si ton app utilise du **chiffrement** :
1. Clique sur le build → **"Manage Missing Compliance"**.
2. Question : "Does your app use encryption?"
   - → Sélectionne **"No"** (ton app n'utilise pas de chiffrement spécial, juste HTTPS standard).
3. Clique **"Save"**.

### Étape 4.3 — S'ajouter comme testeur interne

1. Dans TestFlight → **"Internal Testing"** (menu de gauche).
2. Clique **"+"** pour créer un **nouveau groupe** (ex: "Équipe").
3. Ajoute ton **Apple ID** (email) comme testeur.
4. Clique **"Save"**.

### Étape 4.4 — Installer sur ton iPhone 📱

1. Sur ton iPhone, télécharge l'app **"TestFlight"** depuis l'App Store (gratuite, par Apple).
2. Tu recevras un **email d'invitation** de TestFlight.
3. Ouvre l'email sur ton iPhone → clique **"View in TestFlight"**.
4. Dans TestFlight, clique **"Install"** à côté de "Vocal Walls".
5. L'app s'installe sur ton iPhone ! 🎉

---

## Résumé des commandes (dans l'ordre)

```bash
# 1. Aller dans le dossier mobile
cd mobile

# 2. Builder et soumettre automatiquement
npx eas build --platform ios --auto-submit
```

C'est tout côté terminal. Le reste se fait dans le navigateur (App Store Connect).

---

## Dépannage

| Problème | Solution |
|---------|---------|
| Bundle ID déjà pris | Change-le dans `app.json` (ex: `io.vocalwalls.mobile2`) et re-register sur le Developer Portal |
| "Missing Compliance" | Normal ! Va dans TestFlight → Build → répondre "No" à la question sur le chiffrement |
| Build échoue | Lance `npx eas build --platform ios` sans `--auto-submit` d'abord pour isoler le problème |
| "App-specific password required" | Va sur [appleid.apple.com](https://appleid.apple.com) → Security → Generate App-Specific Password |
