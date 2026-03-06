# Documentation Technique Complete - VocalWalls (audio-geo-notes)

Ce document fournit une vue d'ensemble détaillée de l'architecture, des fichiers, des services utilisés et des étapes nécessaires pour passer d'un prototype à une application de production à grande échelle.

---

## 1. Architecture et Interactions

L'application repose sur un modèle **Client-Serveur** classique :

*   **Le Backend (Node.js)** : Agit comme le cerveau central. Il reçoit les coordonnées GPS, les fichiers audio (notes) et les flux (streams) et les redistribute aux autres clients.
*   **Les Clients (Web & Mobile)** : Les utilisateurs postent des notes vocales géo-localisées ou lancent des "Live". Ils récupèrent périodiquement (polling) les notes des autres pour les afficher sur une carte.

**Flux de données type :**
1. Un utilisateur mobile enregistre un audio.
2. L'app envoie un `POST` multipart avec le fichier `.m4a` et les coordonnées GPS au Backend.
3. Le Backend enregistre le fichier dans `/uploads` et met à jour sa base de données JSON.
4. L'application Web, qui "écoute" les nouveaux points, affiche un nouveau marqueur sur la carte.

---

## 2. Description des Fichiers

### 📂 Backend (`/backend`)
*   **`src/index.js`** : Point d'entrée de l'application. Initialise le serveur Express.
*   **`src/app.js`** : Définit toutes les routes API (POST/GET pour les notes, votes, reports, streams et stats).
*   **`src/store.js`** : Gère la persistance des données. **Attention** : Actuellement, il utilise un simple fichier JSON sur le disque comme "base de données".
*   **`src/seed-data.js`** : Script pour peupler la base de données avec des notes de test.
*   **`uploads/`** (Généré) : Dossier contenant tous les fichiers audio physiques postés par les utilisateurs.

### 📂 Mobile (`/mobile`)
*   **`App.js`** : Le fichier principal (monolithique). Il contient toute la logique : calcul GPS, enregistrement audio, interface de la carte (Google Maps), et appels API.
*   **`app.json`** : Configuration Expo (nom de l'app, icônes, permissions Android/iOS, API Keys Google Maps).
*   **`eas.json`** : Configuration des builds (profiles "preview" et "production").
*   **`keystore_new.jks`** : La clé de signature sécurisée pour le Google Play Store.

### 📂 Web (Racine)
*   **`index.html`** : L'interface web de la carte.
*   **`js/app.js`** : Logique de la carte web : récupère les données du backend et place les marqueurs. Utilise l'API Google Maps JS.
*   **`css/style.css`** : Design moderne et sombre de l'interface web.

---

## 3. Services Utilisés

| Service | Usage | Coût / Limites |
| :--- | :--- | :--- |
| **Fly.io** | Hébergement du Backend | **Gratuit (limité)**. Limites de mémoire et de CPU. Les fichiers du dossier `uploads/` sont supprimés à chaque déploiement sauf si un "volume" est configuré. |
| **Google Maps API** | Affichage des cartes (Web & Mobile) | **Gratuit (via crédit)**. Google offre 200$/mois de crédit. Suffisant pour quelques milliers de vues, mais devient payant au-delà. |
| **Expo / EAS** | Compilation de l'app Android/iOS | **Gratuit (limité)**. Les builds en file d'attente gratuite sont prioritaires plus faibles. |
| **GitHub** | Code Source | Gratuit. |

---

## 4. Vers la Production "Full Scale" (Milliers d'utilisateurs)

Pour passer d'un prototype à une application robuste supportant des milliers d'utilisateurs, voici les changements critiques à effectuer :

### A. Base de Données (Urgent)
*   **Actuellement** : Fichier JSON (`store.js`). Risque de corruption de données et lenteur extrême si le fichier dépasse quelques Mo.
*   **Besoins Release** : Migrer vers **PostgreSQL** ou **MongoDB** (hébergé sur Supabase, MongoDB Atlas ou DigitalOcean). Cela permet des recherches géospatiales rapides.

### B. Stockage des Fichiers (Audio)
*   **Actuellement** : Local au serveur (`/uploads`). Si le serveur redémarre ou change de machine, les audios sont perdus.
*   **Besoins Release** : Utiliser un stockage objet comme **AWS S3**, **Google Cloud Storage** ou **Cloudflare R2**. Cela permet de servir les audios via un **CDN** (plus rapide pour l'utilisateur).

### C. Temps Réel (Streaming & Mises à jour)
*   **Actuellement** : Polling (l'app demande au serveur toutes les 8s s'il y a du nouveau). Lourd pour le serveur et lent pour l'utilisateur.
*   **Besoins Release** : Implémenter des **WebSockets** (Socket.io). Le serveur "pousse" instantanément la nouvelle note aux utilisateurs. Pour le live audio, passer du modèle actuel (tronçons d'audio) à un protocole comme **WebRTC** ou **HLS**.

### D. Authentification & Sécurité
*   **Actuellement** : Pas de comptes utilisateurs. N'importe qui peut poster.
*   **Besoins Release** : Ajouter un système de login (Email/Google/Apple) via **Supabase Auth** ou **Firebase**. Ajouter des limites de débit (Rate Limiting) pour éviter le spam.

### E. Monitoring & Maintenance
*   **Logging** : Utiliser un service comme **Sentry** pour capturer les crashs sur les téléphones des utilisateurs.
*   **Analytics** : Savoir combien de personnes utilisent l'app par jour.

---

## Résumé des priorités
1. **Migration DB (PostgreSQL)** : Indispensable pour la stabilité.
2. **Migration Files (S3)** : Indispensable pour ne pas perdre les audios.
3. **Authentification** : Indispensable pour la modération.
