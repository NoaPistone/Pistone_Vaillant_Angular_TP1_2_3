# Doctrine de développement — Guitar Practice Cloud

Règles de travail tirées des TP1 à TP3. Elles s'appliquent à toute nouvelle mission, qu'elle soit
réalisée par le binôme ou par un assistant IA. En cas de conflit, l'ordre de priorité est :

1. le sujet de la mission (`SUJET_ETUDIANT_TP*.md`) ;
2. le contrat HTTP (`API_CONTRACT.md`) ;
3. les consignes projet (`frontend-starter/AGENTS.md`, `CLAUDE.md`, `best-practices.md`, idem côté `backend/`) ;
4. le skill officiel Angular `.claude/skills/angular-developer` (installé avec `npx skills add https://github.com/angular/skills`) ;
5. cette doctrine.

---

## 1. Déroulé d'une mission

1. **Lire** le sujet, `API_CONTRACT.md` et le code concerné. Ne rien modifier au début.
2. **Cartographier** : quel composant, quel service, quelle route backend, quel test existe déjà.
3. **Lister les manques** par rapport au sujet. Ne pas réimplémenter ce qui fonctionne déjà.
4. **Implémenter le minimum complet** : fonctionnalité, états de chargement/erreur/succès, accessibilité.
5. **Tester** : écrire ou adapter les tests, lancer `npm test`, vérifier qu'un test casse si on casse le code.
6. **Construire** : `npm run build` sans erreur.
7. **Vérifier dans le navigateur** (onglet Network, filtre Fetch/XHR) et capturer les preuves.
8. **Documenter** dans `RAPPORT_IA_MODELE.md` : objectif, fichiers modifiés, tests, preuves, limites.

## 2. Architecture

```text
frontend-starter/src/app/
├── components/<nom>/          un composant = un dossier : <nom>.ts, .html, .css, .spec.ts
│   ├── *-page/                pages routées : orchestrent l'état et appellent les services
│   └── track-card/, ...       composants de présentation : input() / output(), aucun service HTTP
├── shared/
│   ├── services/              seul endroit qui injecte HttpClient
│   ├── interceptors/          ajout du JWT, gestion globale du 401
│   ├── guards/                confort de navigation (la sécurité réelle est côté backend)
│   ├── models/                interfaces et unions de types (DTO, états d'interface)
│   ├── pipes/                 formatage d'affichage (taille, etc.)
│   ├── utils/                 fonctions pures (validation de fichier, message d'erreur HTTP)
│   ├── i18n/                  traductions de composants tiers (Paginator)
│   └── testing/               utilitaires réservés aux tests (exclus du build applicatif)
├── routes.ts
main.ts                        providers globaux : router, HttpClient (withXhr + intercepteurs)
```

Flux obligatoire : **composant → service → HttpClient → intercepteur → proxy → API Express → MongoDB**.
Un composant n'importe jamais `HttpClient`. Angular ne parle jamais directement à MongoDB.

Séparation page / présentation :

- la **page** possède l'état (Signals), appelle les services, décide des effets (rechargement, SnackBar) ;
- le **composant de présentation** reçoit des `input()`, émet des `output()`, ne connaît aucun service.

## 3. Règles Angular 22

- Composants standalone, sans écrire `standalone: true` ni `ChangeDetectionStrategy.OnPush` (défauts en v22).
- Injection avec `inject()`, jamais par le constructeur.
- État local avec `signal()`, état dérivé avec `computed()`. Pas d'`effect()` pour propager de l'état.
- API de composant avec `input()`, `input.required()`, `output()`, `viewChild()` (pas de décorateurs).
- Templates avec `@if`, `@for (...; track x.id)` + `@empty`, `@switch`. Aucune directive `*ngIf` / `*ngFor`.
- Formulaires : conserver la stratégie existante (Reactive Forms, `nonNullable: true`). Signal Forms seulement pour un projet neuf.
- Formatage dans le template via des pipes (`DatePipe`, `FileSizePipe`), pas de méthodes appelées dans le template.
- Services singletons : `@Injectable({ providedIn: 'root' })`.
- Angular Material : importer uniquement le module utilisé (`MatPaginatorModule`, `MatSnackBar`), traduire les libellés (`MatPaginatorIntl`).
- Commentaires en français, détaillés, destinés à des étudiants de M1 : expliquer le *pourquoi*, pas le *quoi*.

## 4. HTTP et gestion d'état

- Chaque appel HTTP est une méthode de service typée (`get<Page<Track>>`, `delete<void>`).
- Les composants s'abonnent avec `subscribe({ next, error })` explicites aux frontières d'action utilisateur.
- Chaque action asynchrone a son état : `loading`, `saving`, `deletingId`, `loadingAudioId`…
  Utiliser un **id** plutôt qu'un booléen quand l'état concerne un élément d'une liste.
- Modéliser les états exclusifs par une **union discriminée** (`UploadState = idle | uploading | success | error`),
  puis exposer au template des `computed()` simples (`percent()`, `errorMessage()`).
- Messages d'erreur via `httpErrorMessage(error, repli)` : statut `0` = serveur injoignable,
  sinon `error.error.message` renvoyé par l'API, sinon message de repli.
- Avec `responseType: 'blob'`, le corps d'erreur est un `Blob` : décider du message selon le **statut**.
- Rechargement de liste : annuler la requête précédente (`subscription.unsubscribe()`) pour que la dernière page demandée gagne.
- Pagination **toujours serveur** : une requête par changement de page, jamais de découpage local.
  Le Paginator Material est 0-based (`pageIndex`), l'API est 1-based (`page`).
- Après une suppression : recharger la page ; si elle est devenue vide et que `page > pages`, revenir à la dernière page.
- Un `404` sur une ressource affichée signifie « supprimée ailleurs ou pas à vous » : informer puis resynchroniser.
- Progression d'upload : `reportProgress: true`, `observe: 'events'`, et **`withXhr()`** dans `provideHttpClient`
  (le backend `fetch`, défaut depuis Angular 21, ne remonte pas la progression d'upload).
  Le service traduit les `HttpEvent` en événements métier ; pourcentage = `loaded / total`.
- Toute `ObjectURL` créée est révoquée (`URL.revokeObjectURL`) avant remplacement, à l'arrêt du lecteur et dans `ngOnDestroy`.

## 5. Sécurité

- Aucun secret (URI MongoDB, `JWT_SECRET`, mot de passe réel) dans Angular, Git, un prompt IA ou une capture.
- Le JWT n'est jamais écrit dans la console, l'interface, un test ou le rapport.
- L'intercepteur ajoute `Authorization: Bearer <token>` et, sur un `401` hors `/api/auth/`, déconnecte et redirige vers `/login`.
- Le guard et le masquage de boutons ne sont que du confort : **le backend** vérifie le JWT et le propriétaire.
- La validation frontend (type MIME, 25 Mo) reprend exactement les règles backend et ne les remplace jamais.
- Captures Network : masquer la ligne `Authorization`, les mots de passe et toute réponse contenant un token.
- Le backend n'est pas modifié pour les missions obligatoires. Si une route change volontairement,
  mettre à jour `API_CONTRACT.md` dans le même changement.

## 6. Interface et accessibilité

- Chaque action affiche : état en cours (texte du bouton, `aria-busy`), succès (`role="status"`), erreur (`role="alert"`).
- Bouton désactivé pendant l'action **et** garde dans la méthode (`if (this.deletingId()) return;`) contre la double soumission.
- Action destructive : confirmation explicite (`window.confirm`) avant tout appel HTTP, résultat notifié par SnackBar.
- Boutons d'icône ou répétés dans une liste : `aria-label` contenant le nom de l'élément (« Supprimer Blues en La »).
- Listes sémantiques (`<ul>/<li>`), métadonnées en `<dl>`, dates dans `<time datetime>`.
- Focus visible au clavier, contrastes WCAG AA, cards en grille responsive (`auto-fill, minmax(...)`).
- Le style global `button` ne doit pas écraser les boutons Material (`button:not([class*='mat-'])`).

## 7. Tests

### Outils

- Frontend : Vitest via `ng test` (`npm test`), environnement `jsdom`, config `tsconfig.spec.json`.
- Backend : `node:test` (`npm test` dans `backend/`), sans connexion MongoDB.

### Règles

- Un fichier `*.spec.ts` à côté du fichier testé. Intitulés de tests en français, décrivant le comportement attendu.
- **Aucun test ne dépend d'un backend ou de MongoDB.**
- Services : `provideHttpClient()` + `provideHttpClientTesting()`, `HttpTestingController.expectOne(url)`,
  `afterEach(() => http.verify())`. Vérifier **méthode, URL, paramètres, headers, corps** et le résultat simulé.
- Progression d'upload : simuler avec `request.event({ type: HttpEventType.UploadProgress, loaded, total })`.
- Composants : remplacer les services par des doubles (`{ provide: TrackService, useValue: { list: vi.fn(...) } }`).
  Utiliser un `Subject` pour contrôler l'ordre des émissions et observer les états intermédiaires.
- Rendu : pattern *Act → Wait → Assert* avec `await fixture.whenStable()` (application zoneless) ;
  entrées d'un composant avec `fixture.componentRef.setInput(...)`.
- Vérifier le **DOM** (texte affiché, bouton désactivé) et pas seulement l'état interne.
- Guards fonctionnels : `TestBed.runInInjectionContext(() => authGuard(...))`.
- API navigateur absentes ou à contrôler : `installLocalStorageMock()` (avant d'injecter `AuthService`),
  `vi.spyOn(window, 'confirm')`, stub de `URL.createObjectURL` / `revokeObjectURL`. `vi.restoreAllMocks()` en `afterEach`.
- Backend : tester le contrat et la sécurité rejetés **avant** la base (401 sans / avec mauvais JWT, 400 upload sans fichier ou MIME refusé).
- Contrôle de pertinence : casser volontairement le code (ex. renommer le champ `title`) et constater l'échec du test.
  Un test sans assertion utile ne compte pas.

### Tests minimaux attendus par fonctionnalité

| Fonctionnalité | Test service | Test composant |
|---|---|---|
| Liste paginée | `GET` avec `page` et `limit` | requête à chaque changement de page, erreur affichée |
| Upload | multipart `audio` + `title`, traduction des événements de progression | validation locale sans appel HTTP, progression, succès, erreur, double soumission |
| Lecture | `responseType: 'blob'` | ObjectURL créée, révoquée à la destruction, erreur 404 |
| Suppression | `DELETE /api/tracks/:id` | confirmation, annulation, double clic, 404, page vide |
| Auth | `POST /api/auth/login` et corps, stockage du token | intercepteur (header, 401), guard (redirection) |

## 8. Définition de « terminé »

- [ ] Toutes les exigences du sujet couvertes, sans modifier le backend ni le contrat (sauf mission explicite).
- [ ] Aucun composant n'injecte `HttpClient`.
- [ ] États chargement / succès / erreur / vide visibles, double soumission impossible.
- [ ] `npm test` vert (frontend) et `npm test` vert (backend) ; nouveaux tests pertinents ajoutés.
- [ ] `npm run build` sans erreur.
- [ ] Vérification Network faite, preuves dans `preuves/tpN/` sans JWT ni mot de passe visibles.
- [ ] Console du navigateur sans erreur inattendue ni donnée sensible.
- [ ] `RAPPORT_IA_MODELE.md` complété (fichiers, tests, preuves, réponses aux questions, limites).
- [ ] Chaque membre du binôme sait expliquer le code et les tests.

## 9. Commandes

```bash
export PATH="/opt/homebrew/bin:$PATH"   # Node >= 22 requis par Angular CLI 22 (poste actuel : v26)
cd backend && npm start                  # API sur http://localhost:3000 (nécessite backend/.env)
cd backend && npm test                   # tests node:test, sans MongoDB
cd frontend-starter && npm start         # http://localhost:4200, proxy /api -> :3000
cd frontend-starter && npm test          # Vitest, sans backend
cd frontend-starter && npm run build
```

## 10. Pièges déjà rencontrés

- Progression d'upload toujours à 0 : `withXhr()` manquant dans `provideHttpClient` (Angular ≥ 21 utilise `fetch`).
- Specs compilées par `ng build` : elles doivent être exclues de `tsconfig.app.json` et incluses dans `tsconfig.spec.json`.
- `localStorage` indisponible sous jsdom : installer le mock avant la création d'`AuthService`.
- `<input type="file">` garde son fichier après succès : le vider via `viewChild()` et `input.value = ''`.
- Une URL placée directement dans `<audio src>` ne reçoit pas le header `Authorization` : passer par un `Blob` + `ObjectURL`.
- Backend qui s'arrête au démarrage : IP non autorisée dans MongoDB Atlas (Network Access).
- Preuves : une capture qui laisse voir le JWT doit être refaite ou masquée avant rendu.
