# 13 — Évolutions nécessitant le backend (hors périmètre des TP)

Ces évolutions modifient le backend **et** `API_CONTRACT.md`. À ne faire qu'avec l'accord de l'enseignant ;
chaque route ajoutée est documentée dans le contrat dans le même changement (méthode, URL, auth, paramètres, corps, réponses, erreurs).

## 13.1 Recherche par titre
- **Contrat** : `GET /api/tracks?page=1&limit=5&q=blues` (JWT). `q` optionnel, 1 à 50 caractères.
- **Backend** : `filter.title = { $regex: escapeRegex(q), $options: 'i' }` — échapper `q` (injection d'expression régulière). Index texte si la volumétrie l'exige.
- **Front** : champ « Rechercher » avec temporisation de 300 ms (`debounceTime`), retour en page 1 à chaque saisie, `q` transmis par `TrackService.list(page, limit, q)`.
- **Tests** : service transmet `q` ; composant ne déclenche qu'une requête pour une saisie rapide (faux timers).

## 13.2 Renommer une piste
- **Contrat** : `PUT /api/tracks/:id` `{ title }` + JWT → `200 Track` ; `400` titre vide ; `404` inconnue ou pas à l'utilisateur.
- **Backend** : `findOneAndUpdate({ _id, ownerId: req.auth.sub }, { title }, { new: true, runValidators: true })`.
- **Front** : bouton « Renommer » dans la card, édition en place, Échap annule, Entrée valide.

## 13.3 Notes de travail par morceau
- **Données** : champs `key` (tonalité, ex. « La mineur »), `bpm` (40–220), `notes` (texte libre, 2000 caractères max) dans `Track`.
- **Contrat** : inclus dans `PUT /api/tracks/:id` (13.2) et dans les réponses `Track`.
- **Front** : affichage dans la card ; le BPM préremplit le métronome (spec 09).

## 13.4 Boucles sauvegardées
- **Données** : `loops: [{ id, name, start, end }]` dans `Track` (20 max, `start < end ≤ durée`).
- **Contrat** : `POST /api/tracks/:id/loops`, `DELETE /api/tracks/:id/loops/:loopId`.
- **Front** : liste des boucles dans le lecteur, un clic charge A et B (spec 02).

## 13.5 Statistiques de pratique
- **Données** : collection `PracticeSession { ownerId, trackId, startedAt, seconds }`.
- **Contrat** : `POST /api/practice` (envoyé à la pause ou toutes les 60 s de lecture), `GET /api/practice/summary` (temps par jour sur 30 jours, par morceau).
- **Front** : page « Ma progression » avec graphique.

## 13.6 Image de couverture et tags ID3 (option avancée du TP2)
- **Données** : `coverName` (fichier image sur disque, comme l'audio), `artist`, `album`.
- **Upload** : champ multipart `cover` facultatif (JPEG/PNG/WebP, 2 Mo max, contrôlé par Multer).
- **ID3** : lecture côté serveur des tags (titre, artiste, image intégrée) avec une bibliothèque dédiée ; à défaut, recherche sur un service public de métadonnées musicales en respectant ses conditions d'usage et les droits des images.
- **Contrat** : `GET /api/tracks/:id/cover` (JWT, même logique de propriété que l'audio).

## 13.7 Lecture en streaming authentifié
- **Contrat** : `POST /api/tracks/:id/audio-url` (JWT) → `{ url, expiresAt }`, URL signée valable 60 s ; `GET` sur cette URL sans header.
- **Intérêt** : `<audio src>` natif, démarrage immédiat, requêtes `Range` ; garde la boucle sans latence grâce au cache du navigateur.
- **Sécurité** : signature HMAC avec `JWT_SECRET`, identifiant de piste et propriétaire dans la signature, expiration courte.

## 13.8 Sauvegarde des prises (spec 10)
- **Contrat** : `POST /api/tracks/:id/takes` multipart `audio` (webm/m4a, 25 Mo), `GET /api/tracks/:id/takes`, `GET /api/takes/:id/audio`, `DELETE /api/takes/:id`.
