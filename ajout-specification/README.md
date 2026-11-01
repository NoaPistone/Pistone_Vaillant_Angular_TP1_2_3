# Ajout de spécifications — évolutions du Guitar Practice Cloud

Chaque fichier décrit une évolution de façon à pouvoir l'implémenter sans autre information.
Toutes les specs respectent [`../DOCTRINE.md`](../DOCTRINE.md) : composant → service → HttpClient,
Signals, `input()`/`output()`, tests sans backend, `npm test` et `npm run build` verts.

| # | Spec | Backend modifié | Effort | Statut |
|---|---|---|---|---|
| 01 | [Mode sombre](01-mode-sombre.md) | Non | XS | ✅ Implémenté |
| 02 | [Boucle A-B](02-boucle-ab.md) | Non | S | À faire — prioritaire |
| 03 | [Vitesse de lecture](03-vitesse-lecture.md) | Non | XS | À faire — prioritaire |
| 04 | [Annuler un upload](04-annuler-upload.md) | Non | XS | À faire |
| 05 | [Glisser-déposer](05-glisser-deposer.md) | Non | XS | À faire |
| 06 | [Raccourcis clavier](06-raccourcis-clavier.md) | Non | S | À faire |
| 07 | [Télécharger un morceau](07-telecharger.md) | Non | XS | À faire |
| 08 | [Media Session](08-media-session.md) | Non | XS | À faire |
| 09 | [Métronome et décompte](09-metronome-decompte.md) | Non | M | À faire |
| 10 | [S'enregistrer par-dessus](10-enregistrement.md) | Non | M | À faire |
| 11 | [Forme d'onde](11-forme-onde.md) | Non | M | À faire |
| 12 | [Accordeur](12-accordeur.md) | Non | L | À faire |
| 13 | [Évolutions backend](13-evolutions-backend.md) | **Oui** | M à L | Hors périmètre TP |

Effort : XS < 30 min, S < 1 h, M une demi-journée, L une journée ou plus.

## Format d'une spec

1. **Objectif** : le besoin utilisateur, en une phrase.
2. **Critères d'acceptation** : numérotés, vérifiables, chacun couvert par un test ou une vérification manuelle.
3. **Conception** : fichiers touchés, API natives utilisées, état (Signals).
4. **Cas limites**.
5. **Accessibilité**.
6. **Tests attendus**.
7. **Hors périmètre** : ce qu'on ne fait pas, volontairement.

## Ordre conseillé

03 → 02 → 06 → 04 → 05 → 07 → 08 → 09 → 11 → 10 → 12.
La vitesse et la boucle A-B sont le cœur de l'entraînement sur un riff et justifient le choix du Blob en mémoire.
