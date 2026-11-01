# 08 — Media Session (clavier multimédia, écran verrouillé)

## Objectif
Contrôler la lecture avec les touches multimédia du clavier, le casque Bluetooth ou le centre de contrôle macOS / iOS.

## Critères d'acceptation
1. Le centre de contrôle du système affiche le titre du morceau et « Guitar Practice Cloud » comme artiste.
2. Les touches lecture/pause, ±10 s et « position » du système pilotent le lecteur.
3. Au changement de morceau, les métadonnées sont mises à jour ; à l'arrêt, elles sont effacées.

## Conception
- Dans `practice-player` (ou `tracks-page`), à chaque nouveau morceau :
  ```ts
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Guitar Practice Cloud' });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => audio.currentTime -= 10);
    navigator.mediaSession.setActionHandler('seekforward', () => audio.currentTime += 10);
  }
  ```
- À la destruction : `metadata = null` et handlers à `null`.

## Cas limites
- API absente (jsdom, vieux navigateurs) : garde `'mediaSession' in navigator`, aucune erreur.

## Tests attendus
- `navigator.mediaSession` simulé (`vi.stubGlobal`) → `metadata.title` égal au titre, handler `pause` appelle `audio.pause()`.
- API absente → aucune exception.

## Hors périmètre
Pochette dans le centre de contrôle (dépend de la spec 13, image de couverture).
