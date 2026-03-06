# Génération Manuelle des Certificats iOS (Sur Mac)

Puisque EAS échoue à le faire automatiquement, nous allons générer les fichiers `.p12` (Certificat) et `.mobileprovision` (Profil) manuellement sur votre Mac.

## Étape 1 : Préparation sur le Mac

1.  Ouvrez **Xcode** (installez-le depuis l'App Store si besoin).
2.  Allez dans **Preferences (Settings)** > **Accounts**.
3.  Ajoutez votre Apple ID (le même que pour EAS).

## Étape 2 : Créer le Certificat de Distribution

1.  Ouvrez l'application **"Trousseau d'accès"** (Keychain Access).
2.  Menu **Trousseau d'accès** > **Assistant de certification** > **Demander un certificat à une autorité de certification**.
3.  Entrez votre email, choisissez "Enregistrée sur disque", et continuez. Cela crée un fichier `CertificateSigningRequest.certSigningRequest`.
4.  Allez sur [developer.apple.com](https://developer.apple.com/account/resources/certificates/list).
5.  Cliquez **"+"** à côté de Certificates.
6.  Choisissez **"Apple Distribution"** (ou "iOS Distribution").
7.  Uploadez le fichier `.certSigningRequest`.
8.  Téléchargez le fichier `.cer` généré.
9.  Double-cliquez sur le `.cer` pour l'installer dans votre Trousseau.

**Export du .p12 :**
1.  Dans **Trousseau d'accès**, trouvez le certificat "Apple Distribution: ..." que vous venez d'ajouter.
2.  Déroulez la petite flèche noire à gauche pour voir la clé privée.
3.  Sélectionnez les deux lignes (Certificat + Clé), clic droit > **Exporter 2 éléments**.
4.  Format : `.p12`.
5.  Mot de passe : Mettez-en un (et retenez-le !).
6.  Nommez-le `dist.p12`.

## Étape 3 : Créer le Profil de Provisioning

1.  Allez sur [developer.apple.com/account/resources/profiles/list](https://developer.apple.com/account/resources/profiles/list).
2.  Cliquez **"+"**.
3.  Choisissez **"App Store"** (sous Distribution).
4.  App ID : Sélectionnez `io.vocalwalls.mobile`.
5.  Certificat : Sélectionnez celui que vous venez de créer (vérifiez la date).
6.  Nommez le profil : `Vocal Walls App Store`.
7.  Téléchargez le fichier `.mobileprovision`.

## Étape 4 : Utiliser ces fichiers avec EAS

Transférez `dist.p12` et `Vocal Walls App Store.mobileprovision` sur votre PC Windows (là où vous lancez la commande).

Ensuite, lancez la build en mode interactif sur Windows :

```bash
npx eas build --platform ios
```

Quand EAS demandera les identifiants :
1.  Répondez **Non** à "Log in to your Apple account?" (pour éviter l'auto-génération qui plante).
2.  EAS vous demandera le chemin vers votre fichier `.p12`.
3.  EAS vous demandera le mot de passe du `.p12`.
4.  EAS vous demandera le chemin vers votre `.mobileprovision`.

Cela forcera EAS à utiliser VOS fichiers valides au lieu d'essayer d'en créer.

## Dépannage (Vieux Mac / Problèmes Certificats)

### Problème 1 : "Certificat non fiable" (en rouge) 🔴
Si votre Mac est vieux (2012), il lui manque probablement le **Certificat Intermédiaire Apple**.
1.  Téléchargez ce fichier : [Apple WWDR Certificate (G3)](https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer)
2.  Double-cliquez dessus pour l'installer dans votre Trousseau.
3.  Le certificat "Apple Distribution" devrait devenir vert (ou au moins valide).

### Problème 2 : Pas de flèche / Pas de clé privée 🗝️
Si vous n'avez pas la petite flèche grise à gauche du certificat, c'est que **la clé privée a été perdue ou le CSR n'a pas été fait ici**.

**Solution : Tout effacer et recommencer proprement.**
1.  Dans Trousseau d'accès, supprimez **tous** les certificats "Apple Distribution" (clic droit > Supprimer).
2.  Allez dans **Trousseau d'accès > Assistant de certification > Demander un certificat...**
3.  **TRÈS IMPORTANT :** Cochez **"Enregistrée sur disque"** (Saved to disk).
4.  Cela crée un fichier `.certSigningRequest` sur votre bureau.
5.  Retournez sur [developer.apple.com](https://developer.apple.com/account/resources/certificates/list).
6.  **Révoquez** (Revoke) le certificat précédent qui ne marchait pas.
7.  Créez-en un **nouveau** (+) en uploadant le `.certSigningRequest` que vous venez de faire.
8.  Téléchargez le nouveau `.cer` et double-cliquez.
9.  Magie : La clé privée devrait être là (car elle a été générée en même temps que la demande sur le bureau).
