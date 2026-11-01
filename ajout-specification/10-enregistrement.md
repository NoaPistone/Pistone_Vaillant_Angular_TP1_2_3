# 10 — S'enregistrer par-dessus le backing track

## Objectif
Enregistrer sa guitare (micro ou interface audio) pendant la lecture du backing track, puis réécouter sa prise pour progresser.

## Critères d'acceptation
1. Bouton « Enregistrer » : demande l'autorisation du micro au premier usage.
2. Refus d'autorisation : message « Accès au micro refusé. Autorisez-le dans les réglages du navigateur. ».
3. Pendant l'enregistrement : le backing track joue depuis la position courante (ou depuis A si une boucle est active), un voyant rouge et une durée s'affichent.
4. « Arrêter » termine l'enregistrement et met le morceau en pause.
5. La prise apparaît dans une liste « Mes prises » (session courante) avec un lecteur, sa durée et un lien « Télécharger » (`.webm` ou `.m4a` selon le navigateur).
6. « Supprimer la prise » libère sa mémoire (`URL.revokeObjectURL`).
7. Le micro est libéré (voyant système éteint) dès l'arrêt.
8. Choix du périphérique d'entrée si plusieurs existent (interface audio USB).

## Conception
- Service `shared/services/recorder.service.ts` (sans HttpClient).
- `navigator.mediaDevices.getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })` : filtres désactivés, sinon la guitare est dégradée.
- `MediaRecorder` → morceaux dans `ondataavailable` → `new Blob(chunks, { type: recorder.mimeType })` → `URL.createObjectURL`.
- Arrêt : `stream.getTracks().forEach(t => t.stop())`.
- Liste des périphériques : `navigator.mediaDevices.enumerateDevices()` filtrée sur `audioinput`.
- Prises conservées en mémoire uniquement (Signal `takes`), révoquées dans `ngOnDestroy`.
- Contexte sécurisé requis : fonctionne sur `localhost` et en HTTPS.

## Cas limites
- Casque obligatoire : sans casque, le micro enregistre aussi le backing track. Afficher un conseil.
- Latence entre le son entendu et la prise (~50 à 200 ms) : visible à la réécoute ; compensation hors périmètre.
- Navigateur sans `MediaRecorder` : bouton masqué.

## Accessibilité
État d'enregistrement annoncé (`role="status"` : « Enregistrement en cours », « Enregistrement terminé, 42 secondes »). Le voyant n'est pas le seul indicateur : texte en plus de la couleur.

## Tests attendus
- `getUserMedia` simulé qui rejette `NotAllowedError` → message d'erreur affiché.
- `MediaRecorder` simulé : `stop()` puis `ondataavailable` → une prise ajoutée avec ObjectURL.
- Arrêt → `track.stop()` appelé sur chaque piste du flux.
- Suppression d'une prise → `URL.revokeObjectURL` appelé.

## Hors périmètre
Sauvegarde des prises sur le serveur (nécessite une route d'upload dédiée, spec 13). Mixage piste + prise.
