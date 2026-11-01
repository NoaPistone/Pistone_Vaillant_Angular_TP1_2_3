# 02 — Boucle A-B sur un riff

## Objectif
Rejouer en boucle un passage précis d'un backing track pour travailler un riff, sans latence (le morceau est déjà en mémoire sous forme de Blob).

## Critères d'acceptation
1. Le lecteur affiche deux boutons « Marquer A » et « Marquer B ». Un clic enregistre la position courante (`currentTime`, arrondie au dixième de seconde).
2. Les positions A et B s'affichent au format `m:ss.d` (ex. `1:23.4`).
3. Quand A et B sont définis et que A < B, la lecture revient à A dès que la position atteint ou dépasse B.
4. Si l'utilisateur marque B avant A, ou B ≤ A, la boucle n'est pas active et le message « La fin B doit être après le début A » s'affiche.
5. Un bouton « Effacer la boucle » supprime A et B ; la lecture continue normalement.
6. Deux boutons « −0,1 s » / « +0,1 s » à côté de A et de B permettent l'ajustement fin, bornés à `[0, duration]`.
7. Changer de morceau efface la boucle.
8. Un indicateur « Boucle active 1:23.4 → 1:31.0 » est visible quand la boucle est active.
9. Combinable avec la vitesse de lecture (spec 03).

## Conception
- Nouveau composant `components/practice-player/` (`practice-player.ts/.html/.css/.spec.ts`) qui **remplace** le `<audio>` actuel de `tracks-page.html`.
  - `input.required<string>()` : `src` (l'ObjectURL) ; `input.required<string>()` : `title`.
  - `output<void>()` : `audioError` (relayé vers `onAudioError()` de la page).
  - `viewChild.required<ElementRef<HTMLAudioElement>>('audio')`.
- État : `loopStart = signal<number | null>(null)`, `loopEnd = signal<number | null>(null)`, `loopActive = computed(() => start !== null && end !== null && start < end)`.
- Événement natif `(timeupdate)` : `if (loopActive() && audio.currentTime >= loopEnd()) audio.currentTime = loopStart()`.
- `effect()` interdit pour cette logique : tout se fait dans le gestionnaire d'événement.
- Formatage : fonction pure `formatTime(seconds)` dans `shared/utils/time.ts` (réutilisée par la spec 11).
- La page conserve la responsabilité de l'ObjectURL (création / révocation) ; le lecteur ne la révoque jamais.

## Cas limites
- `timeupdate` est émis ~4 fois par seconde : le retour à A peut déborder de B d'environ 250 ms. Acceptable ; si trop imprécis, passer par `requestAnimationFrame` pendant la lecture (`ponytail:` à noter dans le code).
- `duration` vaut `NaN` avant `loadedmetadata` : boutons A/B désactivés tant que la durée est inconnue.
- Boucle de moins de 0,5 s : refusée avec le message « Boucle trop courte (0,5 s minimum) ».

## Accessibilité
- Boutons avec texte explicite et `aria-pressed` sur l'indicateur de boucle.
- Indicateur dans une zone `aria-live="polite"`.

## Tests attendus (`practice-player.spec.ts`)
- Marquer A puis B avec `currentTime` simulé (`Object.defineProperty(audio, 'currentTime', { writable: true, value: 10 })`) → `loopActive()` vrai et texte « 0:10.0 → … » affiché.
- `timeupdate` avec `currentTime >= B` → `currentTime` remis à A.
- B ≤ A → boucle inactive et message affiché.
- « Effacer la boucle » → A et B à `null`.
- Changement de l'input `src` → boucle effacée.
- `formatTime` : `0 → "0:00.0"`, `83.42 → "1:23.4"`.

## Hors périmètre
Sauvegarde des boucles (nécessite le backend, voir spec 13). Plusieurs boucles nommées.
