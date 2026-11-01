# 07 — Télécharger le morceau en cours

## Objectif
Récupérer sur son ordinateur le fichier d'un backing track déjà chargé dans le lecteur.

## Critères d'acceptation
1. Quand un morceau est chargé, un lien « Télécharger » apparaît dans le lecteur.
2. Le fichier est enregistré sous son nom d'origine (`originalName`, ex. `song1.mp3`).
3. Aucune nouvelle requête réseau : le Blob déjà en mémoire est réutilisé.
4. Le lien disparaît quand le lecteur est arrêté (piste supprimée).

## Conception
- `tracks-page.html` : `<a [href]="audioUrl()" [attr.download]="currentTrack()?.originalName">Télécharger</a>`.
- Aucun code TypeScript : l'ObjectURL existe déjà, l'attribut HTML `download` fait le reste.
- Angular peut marquer une URL `blob:` comme non sûre dans `href` : si la console signale `unsafe:blob:`, utiliser `DomSanitizer.bypassSecurityTrustUrl()` **uniquement** sur l'URL produite par `URL.createObjectURL` (jamais sur une donnée utilisateur).

## Cas limites
- Révocation de l'ObjectURL pendant le téléchargement : impossible, la révocation n'a lieu qu'au changement de morceau ou à la destruction.

## Accessibilité
Lien textuel explicite : « Télécharger song1.mp3 ».

## Tests attendus
- Morceau chargé → lien présent avec `href="blob:fake-url"` et `download="a.mp3"`.
- Après `stopPlayer()` → lien absent.

## Hors périmètre
Télécharger une piste sans l'avoir lue (nécessiterait un appel `audio()` dédié).
