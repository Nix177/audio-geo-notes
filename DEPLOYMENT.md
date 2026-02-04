# Guide de Déploiement

Ce projet peut être hébergé sur n'importe quel serveur statique. Voici les méthodes pour **GitHub Pages** (gratuit, public) et **Hostinger** (privé ou public).

---

## Option A : GitHub Pages (Gratuit & Public)
Accessible uniquement si le dépôt est **Public** (ou avec un compte GitHub Pro).

1.  Allez dans **Settings** > **Pages** sur GitHub.
2.  Source : `Deploy from a branch`.
3.  Branch : `main` / `/(root)`.
4.  Sauvegardez. Le site sera en ligne sous quelques minutes.

---

## Option B : Hostinger (Recommandé pour Privé)
Si vous avez un hébergement Hostinger (ou une invitation), c'est la meilleure option pour garder le code privé tout en le mettant en ligne.

### Méthode 1 : Synchronisation Git (Automatique)
C'est la méthode "Pro". Le site se mettra à jour automatiquement à chaque "Push".

1.  **Sur Hostinger (hPanel)** :
    - Allez dans la gestion de votre site web.
    - Cherchez l'outil **Git** (section "Avancé").
    - Ajoutez le dépôt : `Nix177/audio-geo-notes`.
    - Branche : `main`.
    - **IMPORTANT** : Si le dépôt est privé, Hostinger affichera une **clé SSH** (une longue suite de caractères commençant par `ssh-rsa...`). Copiez-la.

2.  **Sur GitHub** :
    - Allez dans le dépôt > **Settings** > **Deploy keys**.
    - Cliquez sur **Add deploy key**.
    - Titre : `Hostinger`.
    - Key : Collez la clé copiée depuis Hostinger.
    - Cochez "Allow write access" (optionnel, mais pratique).
    - Sauvegardez.

3.  **Retour sur Hostinger** :
    - Cliquez sur **Connecter** ou **Créer**.
    - Cliquez ensuite sur **Déployer**.
    - C'est en ligne !

### Méthode 2 : Gestionnaire de Fichiers (Manuel)
Plus simple si vous ne voulez pas configurer de clés, mais vous devrez refaire ça à chaque mise à jour.

1.  **Sur Hostinger** :
    - Allez dans **Gestionnaire de fichiers** (Files).
    - Entrez dans le dossier `public_html`.
    - Supprimez le fichier `default.php` s'il existe.
2.  **Depuis votre PC** :
    - Sélectionnez tous les fichiers de votre dossier `i:\Sites\audio-geo-notes\` (`index.html`, `css`, `assets`, etc.).
    - Glissez-déposez les fichiers directement dans la fenêtre du navigateur Hostinger.

---

## Vérification
Après déploiement, votre site sera accessible via votre nom de domaine Hostinger (ex: `votre-domaine.com` ou `audio-geo-notes.votre-domaine.com`).
