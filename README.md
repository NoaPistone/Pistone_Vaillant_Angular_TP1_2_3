# Guitar Practice Cloud — TP1 à TP3 Angular

Binôme : Meric VAILLANT et Noa PISTONE.

Portail Angular connecté à une API Express/Mongoose : comptes utilisateurs (TP1),
bibliothèque audio paginée avec upload et lecture authentifiée (TP2), suppression,
progression d'upload et tests automatisés (TP3).

## Architecture

```text
frontend-starter/ (Angular, port 4200)
  composant → service → HttpClient → intercepteur JWT → proxy /api
                                                          │
backend/ (Express, port 3000)                             ▼
  route Express → middleware auth (JWT) → Mongoose → MongoDB Atlas
                                       └→ Multer → data/uploads/ (fichiers audio)
```

- Angular ne parle jamais à MongoDB : tout passe par l'API décrite dans
  [API_CONTRACT.md](API_CONTRACT.md).
- `proxy.conf.json` redirige `/api` de `localhost:4200` vers `localhost:3000`.
- Le JWT est gardé dans `localStorage` et ajouté à chaque requête par
  `auth.interceptor.ts` ; un `401` déconnecte l'utilisateur.
- MongoDB stocke les utilisateurs et les métadonnées des pistes ; les fichiers
  audio restent sur le disque du serveur.

## Prérequis

- Node.js 22 ou plus récent ;
- un compte MongoDB Atlas par binôme ;
- Git et un navigateur récent.

Consulter [ATLAS_SETUP.md](ATLAS_SETUP.md) pour créer la base de données.

## Démarrer le backend

```bash
cd backend
cp .env.example .env
```

Renseigner dans `.env` l’URI MongoDB Atlas et le secret JWT. Ne jamais publier
ce fichier ni copier un secret dans le code Angular.

```bash
npm install
npm start
```

Le backend écoute normalement sur `http://localhost:3000`
(vérification : `http://localhost:3000/api/health`).

## Démarrer le frontend

Dans un autre terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le compte de démonstration est
`demo@example.com` / `Demo1234!`.

## Tests et build

Depuis `frontend-starter/` : `npm test` (38 tests Vitest, sans backend) puis
`npm run build`. Depuis `backend/` : `npm test` (7 tests `node:test`, sans MongoDB).

## Documents de travail

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md) et [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : missions des trois séances ;
- [API_CONTRACT.md](API_CONTRACT.md) : endpoints, authentification et formats échangés ;
- [SCHEMA_FLUX_TP1.md](SCHEMA_FLUX_TP1.md) : schéma annoté du flux de connexion ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : rapport d'usage de l'IA, avec les preuves dans [`preuves/`](preuves/).

Le backend contient également ses propres consignes pour les assistants :
[`backend/AGENTS.md`](backend/AGENTS.md), [`backend/CLAUDE.md`](backend/CLAUDE.md),
[`backend/GEMINI.md`](backend/GEMINI.md) et
[`backend/best-practices.md`](backend/best-practices.md). Elles couvrent
Node.js, Express, Mongoose, MongoDB, l’authentification, Multer, les uploads,
les logs et les tests.

Les fichiers audio présents dans `frontend-starter/fichiers-audio-de-test/` sont
des fixtures fournies pour les essais. Aucun fichier uploadé, dossier de
dépendances (`node_modules`), fichier `.env` ou identifiant local n’est inclus.
