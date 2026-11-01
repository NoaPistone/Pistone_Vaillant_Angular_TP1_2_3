/**
 * Parties en direct d'un groupe (« salon » puis partie synchronisée).
 *
 * Le serveur garde l'état en mémoire et le pousse à chaque changement aux navigateurs
 * connectés, par Server-Sent Events (une réponse HTTP qui ne se termine pas). Les joueurs
 * agissent par de simples POST. Ce fichier ne contient que la logique d'état : des fonctions
 * pures testables sans réseau ; les routes Express sont dans app.js.
 *
 * ponytail: état en mémoire d'un seul processus Node. Avec plusieurs serveurs, il faudrait
 * un état partagé (Redis, publication/abonnement) ; un redémarrage efface les salons ouverts.
 */

/** Délai entre le clic « Lancer » et la première note : le temps de charger et décoder le morceau. */
export const START_DELAY_MS = 10_000;

/** Salon d'un groupe : un seul à la fois par groupe. L'hôte est le créateur du groupe. */
export function createSession(groupId, hostId) {
  return { groupId, state: "lobby", hostId, track: null, startAt: null, players: new Map() };
}

/** Un joueur ouvre le salon (ou y revient pendant la partie, après le changement de page). */
export function join(session, user) {
  const existing = session.players.get(user.id);
  if (existing) {
    existing.connections += 1;
    return;
  }
  // Pendant une partie, on ne rejoint pas en cours de route.
  if (session.state !== "lobby") return;
  session.players.set(user.id, {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    instrument: "lead",
    difficulty: "medium",
    ready: false,
    score: 0,
    combo: 0,
    done: false,
    connections: 1,
  });
}

/**
 * Un joueur ferme sa connexion. Dans le salon, il le quitte. Pendant la partie, il reste
 * (il change simplement de page pour jouer) ; s'il ne revient pas, il ne bloque pas la fin.
 */
export function leave(session, userId) {
  const player = session.players.get(userId);
  if (!player) return;
  player.connections -= 1;
  if (player.connections > 0) return;
  if (session.state === "lobby") {
    session.players.delete(userId);
  }
  finishIfOver(session);
}

/** Choix d'instrument, de difficulté et « prêt » du joueur, uniquement dans le salon. */
export function setPlayer(session, userId, { instrument, difficulty, ready }) {
  const player = session.players.get(userId);
  if (!player || session.state !== "lobby") return false;
  Object.assign(player, { instrument, difficulty, ready });
  return true;
}

/** On peut lancer quand un morceau est choisi et que tous les joueurs sont prêts. */
export function canStart(session) {
  return session.state === "lobby" && session.track !== null && session.players.size > 0 &&
    [...session.players.values()].every((p) => p.ready);
}

export function start(session, now) {
  if (!canStart(session)) return false;
  session.state = "playing";
  session.startAt = now + START_DELAY_MS;
  for (const player of session.players.values()) Object.assign(player, { score: 0, combo: 0, done: false });
  return true;
}

/** Score en direct d'un joueur ; `done` à la fin de son morceau. */
export function report(session, userId, { score, combo, done }) {
  const player = session.players.get(userId);
  if (!player || session.state !== "playing") return false;
  Object.assign(player, { score, combo, done: player.done || done });
  finishIfOver(session);
  return true;
}

/**
 * La partie se termine quand chaque joueur a fini ou s'est déconnecté, et qu'au moins un a fini :
 * au lancement, tous les joueurs quittent le salon en même temps pour ouvrir la page de jeu.
 */
function finishIfOver(session) {
  if (session.state !== "playing") return;
  const players = [...session.players.values()];
  if (players.some((p) => p.done) && players.every((p) => p.done || p.connections === 0)) session.state = "finished";
}

/** Retour au salon après une partie : chacun redevient « pas prêt ». Les absents sont retirés. */
export function reset(session) {
  if (session.state === "lobby") return false;
  session.state = "lobby";
  session.startAt = null;
  for (const [id, player] of session.players) {
    if (player.connections === 0) session.players.delete(id);
    else Object.assign(player, { ready: false, score: 0, combo: 0, done: false });
  }
  return true;
}

/**
 * État envoyé aux navigateurs. `serverNow` permet à chacun de corriger le décalage
 * de son horloge pour démarrer la musique au même instant (`startAt`).
 */
export function snapshot(session, now) {
  const players = [...session.players.values()].map(({ connections, ...player }) => ({
    ...player,
    connected: connections > 0,
  }));
  return {
    state: session.state,
    hostId: session.hostId,
    track: session.track,
    startAt: session.startAt,
    serverNow: now,
    canStart: canStart(session),
    bandScore: players.reduce((total, p) => total + p.score, 0),
    players,
  };
}
