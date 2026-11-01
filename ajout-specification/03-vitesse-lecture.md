# 03 — Vitesse de lecture sans changer la tonalité

## Objectif
Ralentir un morceau pour apprendre un passage rapide, en gardant la même tonalité pour pouvoir jouer par-dessus.

## Critères d'acceptation
1. Le lecteur propose un curseur « Vitesse » de 50 % à 100 % par pas de 5 %, valeur par défaut 100 %.
2. La valeur s'affiche à côté du curseur (« 75 % »).
3. Le changement s'applique immédiatement, sans interrompre la lecture.
4. La tonalité ne change pas (pas d'effet « voix grave »).
5. Trois boutons de préréglage : 50 %, 75 %, 100 %.
6. La vitesse choisie est conservée quand on change de morceau pendant la session.

## Conception
- Dans `practice-player` (spec 02), ou directement dans `tracks-page` si la spec 02 n'est pas encore faite.
- `rate = signal(1)`.
- `<input type="range" min="0.5" max="1" step="0.05">` lié à `rate`.
- Application : `audio.playbackRate = rate()` et `audio.preservesPitch = true` (natif, valeur par défaut dans les navigateurs récents ; on la fixe explicitement).
- Réappliquer `playbackRate` sur `(loadedmetadata)` : le navigateur remet la vitesse à 1 quand `src` change.
- Aucune dépendance, aucune Web Audio API.

## Cas limites
- En dessous de 50 %, la qualité de l'étirement temporel du navigateur se dégrade : borne volontaire.
- Safari ancien : `webkitPreservesPitch`. Hors support : la tonalité baisse avec la vitesse, la fonction reste utilisable.

## Accessibilité
- `<label>` associé au curseur, `aria-valuetext="75 %"`.
- Le curseur se règle aux flèches du clavier (natif).

## Tests attendus
- Changer le curseur à 0,75 → `audio.playbackRate === 0.75` et `preservesPitch === true`.
- Préréglage 50 % → `rate() === 0.5` et affichage « 50 % ».
- Événement `loadedmetadata` après changement de `src` → `playbackRate` réappliqué.

## Hors périmètre
Accélérer au-delà de 100 %. Changer la tonalité (transposition) : nécessite Web Audio + algorithme de pitch-shift.
