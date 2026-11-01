# 09 — Métronome et décompte avant la boucle

## Objectif
Garder le tempo pendant l'entraînement et avoir un décompte de 4 temps avant chaque reprise de la boucle A-B pour se préparer.

## Critères d'acceptation
### Métronome
1. Un panneau « Métronome » propose un BPM de 40 à 220 (champ numérique + boutons −1 / +1), défaut 90.
2. Bouton « Démarrer / Arrêter ». Le métronome fonctionne avec ou sans morceau.
3. Premier temps de chaque mesure accentué (son plus aigu). Mesure 4/4 par défaut, choix 3/4, 4/4, 6/8.
4. Indicateur visuel du temps courant (1 2 3 4).
5. La dérive reste inférieure à 5 ms après 5 minutes (planification audio, pas `setInterval`).
6. Volume du métronome réglable indépendamment du morceau.

### Décompte
7. Case « Décompte avant la boucle » (spec 02). Cochée : à chaque retour en A, la lecture se met en pause, 4 clics sont joués au BPM courant, puis la lecture reprend en A.
8. Le BPM du décompte tient compte de la vitesse de lecture (spec 03) : `bpm × rate`.

## Conception
- Nouveau service `shared/services/metronome.service.ts` (`providedIn: 'root'`), sans HttpClient.
  - Un seul `AudioContext`, créé au premier clic (les navigateurs bloquent l'audio avant une interaction).
  - Planification « lookahead » : un `setInterval` de 25 ms programme les clics des 100 ms à venir avec `oscillator.start(time)` sur `audioContext.currentTime`. C'est la planification audio qui garantit la précision, pas le timer.
  - Clic = `OscillatorNode` (1000 Hz, 1500 Hz pour l'accent) + `GainNode` en enveloppe de 30 ms.
  - Signaux exposés : `running`, `bpm`, `beat` (temps courant, pour l'indicateur).
  - `countIn(beats: number): Promise<void>` résolue après le dernier clic (utilisée par la boucle).
- Composant `components/metronome-panel/` pour l'interface.
- Arrêt et `audioContext.close()` dans `DestroyRef.onDestroy`.

## Cas limites
- Onglet en arrière-plan : `setInterval` ralenti à 1 s par le navigateur ; le lookahead de 100 ms ne suffit plus. Acceptable (on joue devant l'écran) ; noter `ponytail:` dans le code.
- BPM hors bornes : ramené dans `[40, 220]`.

## Accessibilité
Indicateur visuel en plus du son (personnes malentendantes) ; `aria-live="off"` sur l'indicateur pour ne pas saturer le lecteur d'écran.

## Tests attendus
- `AudioContext` simulé (objet avec `currentTime`, `createOscillator`, `createGain` en `vi.fn()`) : à 120 BPM, l'intervalle entre deux `start(time)` vaut 0,5 s.
- Accent : le premier clic de chaque mesure utilise 1500 Hz.
- `countIn(4)` → 4 oscillateurs programmés, promesse résolue (faux timers `vi.useFakeTimers()`).
- BPM 300 → ramené à 220.

## Hors périmètre
Détection automatique du BPM du morceau. Synchronisation du métronome sur le morceau.
