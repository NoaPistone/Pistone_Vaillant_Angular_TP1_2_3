# 05 — Glisser-déposer un fichier audio

## Objectif
Importer un morceau en le faisant glisser depuis le Finder sur la carte « Importer ».

## Critères d'acceptation
1. Survoler la carte avec un fichier la met en évidence (bordure pointillée accentuée, texte « Déposez le fichier ici »).
2. Déposer un fichier le sélectionne exactement comme le sélecteur : même validation (MIME, 25 Mo), mêmes messages.
3. Déposer plusieurs fichiers : seul le premier est pris, message « Un seul fichier à la fois : seul le premier a été retenu. ».
4. Déposer en dehors de la carte n'ouvre pas le fichier dans l'onglet (comportement par défaut du navigateur bloqué sur la page).
5. Pendant un envoi, le dépôt est ignoré.
6. Le sélecteur de fichier classique reste disponible.

## Conception
- `track-upload.html` : `(dragover)`, `(dragleave)`, `(drop)` sur l'`<article>`.
- `dragover` : `event.preventDefault()` (obligatoire pour autoriser le drop) + `dragging.set(true)`.
- `drop` : `event.preventDefault()`, lire `event.dataTransfer?.files[0]`, puis appeler une méthode commune `selectFile(file)` utilisée aussi par `choose()`.
- Le nom du fichier déposé s'affiche (« Fichier : song1.mp3 »), car l'`<input type="file">` ne peut pas être rempli par code.
- Bloquer le dépôt hors zone : dans `TracksPageComponent`, `host: { '(window:dragover)': '$event.preventDefault()', '(window:drop)': '$event.preventDefault()' }` (propriété `host` plutôt que `@HostListener`, recommandation Angular).

## Cas limites
- Dossier déposé : `file.type` vide → message « Format refusé » (validation existante).
- `dragleave` déclenché en survolant un enfant : comparer `event.currentTarget` et `event.relatedTarget` avant de remettre `dragging` à `false`.

## Accessibilité
Le glisser-déposer est un raccourci : le sélecteur classique reste la voie accessible au clavier. Le texte d'aide est annoncé par `aria-describedby`.

## Tests attendus
- `drop` simulé avec `{ preventDefault: vi.fn(), dataTransfer: { files: [mp3] } }` → `file()` défini, `preventDefault` appelé.
- `drop` d'un `.txt` → message « Format refusé ».
- `drop` de deux fichiers → premier retenu, message affiché.
- `drop` pendant `uploading` → ignoré.

## Hors périmètre
Upload multiple en file d'attente.
