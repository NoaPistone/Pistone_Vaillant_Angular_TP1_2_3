# 06 — Raccourcis clavier du lecteur

## Objectif
Contrôler la lecture sans lâcher la guitare : mains sur l'instrument, une touche suffit.

## Critères d'acceptation
| Touche | Action |
|---|---|
| Espace | Lecture / pause |
| ← / → | Reculer / avancer de 5 s |
| Maj + ← / → | Reculer / avancer de 1 s |
| A | Marquer le début de boucle (spec 02) |
| B | Marquer la fin de boucle (spec 02) |
| L | Effacer la boucle |
| − / + | Vitesse −5 % / +5 % (spec 03) |
| ? | Afficher / masquer l'aide des raccourcis |

1. Les raccourcis ne fonctionnent que si un morceau est chargé.
2. Ils sont **ignorés** quand le focus est dans un champ de saisie (`input`, `textarea`, `select`, `contenteditable`) : taper un titre ne lance pas la lecture.
3. Espace ne fait pas défiler la page quand il est utilisé comme raccourci.
4. L'aide (`?`) liste tous les raccourcis dans un panneau fermable par Échap.

## Conception
- Dans `practice-player` : `host: { '(document:keydown)': 'onKey($event)' }`.
- `onKey(event: KeyboardEvent)` : sortir si `event.target` est un champ éditable ou si `event.ctrlKey || event.metaKey || event.altKey` (ne pas casser `Cmd + R`, etc.).
- `switch (event.key)` ; `event.preventDefault()` uniquement pour les touches gérées.
- Positions bornées à `[0, duration]`.
- Aide : `<dialog>` natif (`showModal()`, Échap natif).

## Cas limites
- Clavier AZERTY : utiliser `event.key` (caractère produit), pas `event.code`.
- Touche maintenue : `event.repeat` accepté pour ← / →, ignoré pour Espace, A, B.

## Accessibilité
- Les raccourcis à une lettre doivent pouvoir être désactivés (WCAG 2.1.4) : case « Activer les raccourcis clavier » dans l'aide, cochée par défaut, mémorisée dans `localStorage` (try/catch).

## Tests attendus
- `keydown` Espace → `play()` / `pause()` appelés (spies sur l'élément audio).
- `keydown` → avec `currentTime = 10` → `currentTime === 15`.
- `keydown` Espace avec `target` = `<input>` → aucune action.
- `keydown` Cmd + R → aucune action, pas de `preventDefault`.
- Raccourcis désactivés → aucune action.

## Hors périmètre
Raccourcis personnalisables. Pédale MIDI ou Bluetooth (possible plus tard via Web MIDI API).
