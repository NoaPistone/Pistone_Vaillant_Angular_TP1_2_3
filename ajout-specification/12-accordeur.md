# 12 — Accordeur

## Objectif
S'accorder avant de jouer, sans quitter le site.

## Critères d'acceptation
1. Page `/tuner` accessible depuis la navigation (protégée par le guard, comme les autres pages).
2. Après autorisation du micro, la note la plus proche (Mi grave, La, Ré, Sol, Si, Mi aigu) et l'écart en cents (−50 à +50) s'affichent en temps réel.
3. Aiguille ou barre centrée : verte à ±5 cents, orange au-delà.
4. Précision : ±2 cents sur un signal sinusoïdal de test entre 80 et 1000 Hz.
5. Rafraîchissement au moins 20 fois par seconde.
6. Référence du La réglable (430 à 450 Hz, défaut 440).
7. Silence ou bruit faible : affichage « — » au lieu d'une note aléatoire.
8. Le micro est libéré en quittant la page.

## Conception
- Route lazy-loadée : `{ path: 'tuner', loadComponent: () => import(...), canActivate: [authGuard] }`.
- `getUserMedia` (filtres désactivés, comme la spec 10) → `AudioContext.createMediaStreamSource` → `AnalyserNode` (`fftSize = 4096`).
- Boucle `requestAnimationFrame` : `analyser.getFloatTimeDomainData(buffer)` → détection de fréquence par **autocorrélation** (fonction pure `detectPitch(buffer, sampleRate): number | null`).
- Seuil de silence : RMS < 0,01 → `null`.
- Note : `n = 12 × log2(f / la) + 69` ; nom = `NOTES[round(n) % 12]` ; cents = `(n − round(n)) × 100`.
- Arrêt : `cancelAnimationFrame`, `track.stop()`, `audioContext.close()` dans `DestroyRef.onDestroy`.

## Cas limites
- Harmoniques de la guitare : l'autocorrélation peut détecter l'octave supérieure ; choisir le premier pic au-dessus de 90 % du maximum.
- Mi grave (82 Hz) : nécessite au moins 2 périodes dans le tampon → `fftSize` ≥ 2048 à 44,1 kHz.

## Accessibilité
Note et écart affichés en texte (« La, +3 cents »), pas uniquement par la couleur ou l'aiguille ; zone `aria-live="polite"` limitée à un changement par seconde.

## Tests attendus
- `detectPitch` sur une sinusoïde générée à 110 Hz → 110 ± 0,5 Hz.
- Sinusoïde à 82,41 Hz → note « Mi », |cents| < 2.
- Tampon de zéros → `null`.
- Fonction `toNote(441, 440)` → `{ name: 'La', cents: ≈ +3,9 }`.
- Destruction → `track.stop()` et `close()` appelés.

## Hors périmètre
Accordages alternatifs (Drop D, DADGAD) : simple table à ajouter ensuite. Accordeur polyphonique.
