# 04 — Annuler un upload en cours

## Objectif
Pouvoir interrompre l'envoi d'un gros fichier choisi par erreur, sans attendre la fin.

## Critères d'acceptation
1. Pendant l'envoi, un bouton « Annuler » apparaît à côté de la barre de progression.
2. Un clic interrompt la requête : dans Network, la requête `POST /api/tracks` passe en état « (annulé) ».
3. L'état revient à `idle`, les champs se réactivent, le fichier reste sélectionné pour pouvoir relancer.
4. Le message « Envoi annulé. » s'affiche (`role="status"`).
5. Aucune piste n'est créée et la liste n'est pas rechargée.

## Conception
- `track-upload.ts` : conserver la souscription (`private uploadSubscription?: Subscription`).
- `cancel()` : `uploadSubscription?.unsubscribe()` — avec le backend XHR (`withXhr()`), Angular appelle `xhr.abort()`.
- État : réutiliser `UploadState`, `{ status: 'idle' }` + un signal `info = signal('')` pour le message.
- Désabonner aussi à la destruction du composant (`DestroyRef.onDestroy`) : quitter la page annule l'envoi.

## Cas limites
- Annulation à 100 % pendant « Traitement par le serveur… » : la requête est coupée côté client, mais le serveur peut avoir déjà enregistré la piste. Le bouton « Annuler » est donc masqué quand `processing()` est vrai.
- Côté serveur, Multer supprime le fichier partiel quand la connexion est coupée avant la fin.

## Accessibilité
Bouton « Annuler l'envoi » atteignable au clavier ; le focus revient sur le bouton « Envoyer » après annulation.

## Tests attendus
- Avec un `Subject` simulant la progression : `cancel()` → l'Observable est désabonné (`subject.observed === false`), état `idle`, message affiché, `uploaded` non émis.
- Bouton « Annuler » absent quand `percent() === 100`.

## Hors périmètre
Reprise d'un upload interrompu (upload par morceaux, nécessite le backend).
