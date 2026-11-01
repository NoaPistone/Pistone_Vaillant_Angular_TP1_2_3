# 11 — Forme d'onde cliquable

## Objectif
Visualiser le morceau pour repérer les passages (intro, solo, refrain), se placer d'un clic et dessiner la boucle A-B à la souris.

## Critères d'acceptation
1. Au chargement d'un morceau, une forme d'onde s'affiche au-dessus du lecteur (largeur du conteneur, 80 px de haut).
2. Un curseur vertical suit la position de lecture.
3. Clic sur la forme d'onde → la lecture se place à la position correspondante.
4. Glisser horizontalement → définit A (début) et B (fin) de la boucle (spec 02) ; la zone est surlignée.
5. Le calcul ne bloque pas l'interface plus de 100 ms pour un fichier de 25 Mo ; un texte « Analyse… » s'affiche pendant le décodage.
6. Le dessin s'adapte au redimensionnement de la fenêtre.

## Conception
- Composant `components/waveform/` : `input.required<Blob>()`, `input<number>()` `position`, `input<[number, number] | null>()` `loop`, `output<number>()` `seek`, `output<[number, number]>()` `loopChange`.
- Le **Blob** est passé (pas l'URL) : `blob.arrayBuffer()` → `new AudioContext().decodeAudioData(buffer)` → `getChannelData(0)`.
- Réduction : pour chaque pixel, pic absolu des échantillons correspondants → tableau de `width` valeurs, calculé une seule fois par morceau.
- Dessin dans un `<canvas>` via `afterRenderEffect` (manipulation du DOM après rendu, usage prévu par Angular).
- Redimensionnement : `ResizeObserver`.
- Conversion pixel ↔ temps : `time = (x / width) * duration`.

## Cas limites
- Décodage impossible (fichier corrompu) : forme d'onde masquée, le lecteur reste utilisable, message discret.
- La page doit maintenant conserver le Blob (signal `audioBlob`) en plus de l'ObjectURL ; le Blob est libéré en même temps que l'URL.
- Fichiers longs : la réduction parcourt ~10 millions d'échantillons ; si l'interface se bloque, déplacer le calcul dans un Web Worker (`ponytail:` à noter).

## Accessibilité
- Le canvas a `role="img"` et `aria-label="Forme d'onde de <titre>"`.
- Toutes les actions de la forme d'onde ont un équivalent clavier (spec 06) : la souris n'est jamais obligatoire.

## Tests attendus
- Fonction pure `peaks(samples: Float32Array, width: number): number[]` testée : `[0, 1, -0.5, 0.25]` sur 2 pixels → `[1, 0.5]`.
- Fonction pure `xToTime(x, width, duration)` : `(50, 100, 60) → 30`.
- Clic simulé à `offsetX = 50` sur 100 px pour 60 s → `seek` émis avec 30.
- Glisser de 20 à 40 px → `loopChange` émis avec `[12, 24]`.

## Hors périmètre
Zoom. Détection automatique des sections. Spectrogramme.
