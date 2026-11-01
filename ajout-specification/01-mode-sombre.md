# 01 — Mode sombre ✅

## Objectif
S'entraîner le soir sans être ébloui : l'interface suit automatiquement le thème clair ou sombre du système.

## Critères d'acceptation
1. Avec le système en apparence sombre, fond, cartes, textes, champs, liens et messages passent en couleurs sombres sans rechargement manuel de la configuration.
2. Avec l'apparence claire, le rendu est identique à l'existant.
3. Le changement d'apparence du système pendant que la page est ouverte s'applique immédiatement.
4. Les éléments natifs (champs, `<progress>`, lecteur `<audio>`, barres de défilement) suivent le thème.
5. Le Paginator et la SnackBar Material restent lisibles dans les deux thèmes.
6. Contraste WCAG AA (4,5:1) respecté pour le texte dans les deux thèmes.

## Conception (implémentée)
- `src/styles.css` : variables `--fg`, `--bg`, `--surface`, `--surface-alt`, `--border`, `--input-border`, `--muted`, `--accent`, `--link`, `--header`, `--error`, `--success` dans `:root`, redéfinies dans `@media (prefers-color-scheme: dark)`.
- `color-scheme: light dark` sur `:root` pour les contrôles natifs.
- Jetons Material surchargés (`--mat-sys-surface`, `--mat-sys-on-surface`, `--mat-sys-on-surface-variant`, `--mat-sys-inverse-*`) car le thème prébuilt `azure-blue` est clair uniquement.
- Les CSS de composants (`track-card`, `track-upload`, `tracks-page`) n'utilisent plus de couleurs en dur, sauf le rouge du bouton « Supprimer » (texte blanc lisible dans les deux thèmes).
- Aucun code TypeScript.

## Cas limites
- Navigateur sans support de `prefers-color-scheme` : thème clair.
- Nouvelle couleur ajoutée plus tard : passer par une variable, jamais une couleur en dur.

## Accessibilité
Ratios vérifiés : texte principal ~14:1, texte secondaire `--muted` sur `--surface` ~7:1, bouton (blanc sur `#1d755e`) ~5,3:1.

## Tests attendus
Vérification manuelle : macOS Réglages → Apparence → Sombre, ou DevTools Chrome → ⋮ → More tools → Rendering → « Emulate CSS media feature prefers-color-scheme: dark ». Parcourir connexion, profil, bibliothèque, upload, SnackBar.
Pas de test automatisé : pur CSS, jsdom ne calcule pas les styles.

## Hors périmètre
Bouton de bascule manuel clair/sombre mémorisé. À ajouter si demandé : attribut `data-theme` sur `<html>` + `localStorage`, et dupliquer le bloc sombre sous `:root[data-theme="dark"]`.
