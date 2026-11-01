# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| PATCH | `/tracks/:id` | `{title?, description?}` + JWT | `200 Track` |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) ; supprime aussi les records du morceau |
| POST | `/scores` | `{trackId, difficulty, instrument?, score, stars, accuracy, maxCombo}` + JWT | `201 {best: true, record}` ou `200 {best: false, record}` |
| GET | `/scores/me` | JWT | `200 ScoreRecord[]` |
| GET | `/scores/leaderboard?difficulty=&limit=20` | JWT | `200 LeaderboardEntry[]` |
| GET | `/shop/:shelf` (`avatars`, `backgrounds`) | JWT | `200 Avatar[]` ou `200 Background[]` ; `404` rayon inconnu |
| POST | `/shop/:shelf/:id/buy` | JWT | `200 User` ; `400` points insuffisants, `404` article inconnu, `409` déjà possédé |
| PUT | `/users/me/avatar` | `{avatar}` + JWT | `200 User` ; `400` avatar inconnu, `403` non possédé |
| PUT | `/users/me/background` | `{background}` + JWT | `200 User` ; `400` fond inconnu, `403` non possédé |
| GET | `/friends` | JWT | `200 Friend[]` (par nom) |
| POST | `/friends` | `{tag}` + JWT | `201 Friend` ; `400` identifiant mal formé ou le sien, `404` joueur inconnu, `409` déjà ami |
| DELETE | `/friends/:id` | JWT | `204` ; `404` pas un ami |
| POST | `/groups` | `{name}` + JWT | `201 Group` ; `400` nom de 2 à 40 caractères, `409` groupe déjà créé (un seul par joueur) |
| GET | `/groups` | JWT | `200 Group[]` (groupes dont on est membre) |
| POST | `/groups/join` | `{code}` + JWT | `200 Group` ; `400` code mal formé ou groupe complet, `404` code inconnu, `409` déjà membre |
| POST | `/groups/:id/leave` | JWT | `204` (le créateur qui part supprime le groupe) ; `404` |
| GET | `/groups/:id/tracks` | JWT (membre) | `200 (Track & {ownerName})[]` |
| GET | `/groups/:id/live` | JWT (membre) | flux `text/event-stream` de `LiveState` |
| POST | `/groups/:id/live/track` | `{trackId}` + JWT (hôte) | `204` ; `400`, `403`, `404`, `409` |
| POST | `/groups/:id/live/player` | `{instrument, difficulty, ready}` + JWT | `204` ; `400`, `409` |
| POST | `/groups/:id/live/start` | JWT (hôte) | `204` ; `403`, `409` si morceau absent ou joueurs pas prêts |
| POST | `/groups/:id/live/score` | `{score, combo, done}` + JWT | `204` ; `400`, `409` hors partie |
| POST | `/groups/:id/live/reset` | JWT (hôte) | `204` ; `403`, `409` |

`Track` contient `id`, `ownerId`, `title`, `description` (chaîne vide par défaut), `originalName`, `mimeType`, `size` et `createdAt`. `PATCH` accepte un titre non vide (120 caractères max) et une description (500 max) ; au moins un des deux est requis.

`User` contient `id`, `name`, `email`, `tag` (identifiant d'ami unique, 4 caractères sans 0/O/1/I, affiché `#K7P2`), `createdAt`, `coins` (points), `avatar` (objet `Avatar` affiché), `avatars` (identifiants possédés), `background` (objet `Background` affiché derrière la piste) et `backgrounds` (identifiants possédés). `Avatar` contient `id`, `name`, `emoji`, `color` et `price`. `Background` contient `id`, `name`, `shader` (`null` pour le dégradé de départ, sinon `caustics`, `aurora`, `flux`, `lasers`, `dots`, `sparks` ou `ascii` : fond animé WebGL), `stage`, `deep`, `spotA`, `spotB` (couleurs hexadécimales, décor de secours sans WebGL) et `price`.

`Friend` contient `id`, `name`, `tag` et `avatar`. L'amitié est réciproque : `POST /friends` (le `#` initial est facultatif) l'ajoute des deux côtés, `DELETE` la retire des deux côtés.

Chaque `POST /scores` crédite `floor(score / 100) + 10 × stars` points ; la réponse contient aussi `coinsEarned` et `coins` (nouveau solde).

`Group` contient `id`, `name`, `code` (invitation, 6 caractères), `isOwner` et `members` (`id`, `name`, `avatar`, `isOwner`), 4 membres au plus. Un membre peut lire l'audio (`GET /tracks/:id/audio`) et enregistrer un score (`POST /scores`) sur les morceaux des autres membres.

`LiveState` (une ligne `data: {json}` par changement) contient `state` (`lobby`, `playing`, `finished`), `hostId` (le créateur du groupe), `track` (`{id, title}` ou `null`), `startAt` et `serverNow` (millisecondes, horloge du serveur), `canStart`, `bandScore` et `players` (`id`, `name`, `avatar`, `instrument`, `difficulty`, `ready`, `score`, `combo`, `done`, `connected`). Une action du salon exige d'avoir ouvert le flux (`409` sinon).

`ScoreRecord` contient `id`, `trackId`, `difficulty` (`easy`, `medium`, `hard`, `expert`), `instrument` (`lead` par défaut, `bass`, `drums`, `vocals`), `score`, `stars` (0 à 5), `accuracy` (0 à 100), `maxCombo` et `updatedAt`. Seul le meilleur score par joueur, morceau, difficulté et instrument est conservé. `POST /scores` exige des entiers positifs (`400` sinon) et un morceau appartenant au joueur (`404` sinon).

`LeaderboardEntry` contient `rank`, `name`, `avatar`, `total` (somme des records), `stars`, `played` et `isMe` (vrai pour le joueur connecté). `difficulty` est facultatif (toutes difficultés par défaut, `400` si inconnue) ; `limit` va de 1 à 50.

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.
