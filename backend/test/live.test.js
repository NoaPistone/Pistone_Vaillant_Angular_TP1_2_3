import test from "node:test";
import assert from "node:assert/strict";
import * as live from "../src/live.js";

const alice = { id: "a", name: "Alice", avatar: {} };
const bob = { id: "b", name: "Bob", avatar: {} };

/** Salon avec Alice (hôte) et Bob, morceau choisi. */
function lobby() {
  const session = live.createSession("g1", "a"); // Alice a créé le groupe
  live.join(session, alice);
  live.join(session, bob);
  session.track = { id: "t1", title: "Blues" };
  return session;
}

test("salon : le créateur du groupe est l'hôte, chacun démarre non prêt", () => {
  const session = lobby();
  assert.equal(session.hostId, "a");
  assert.equal(live.snapshot(session, 0).players.every((p) => !p.ready && p.connected), true);
});

test("lancement : impossible tant que tout le monde n'est pas prêt", () => {
  const session = lobby();
  live.setPlayer(session, "a", { instrument: "lead", difficulty: "hard", ready: true });
  assert.equal(live.canStart(session), false);
  assert.equal(live.start(session, 1000), false);

  live.setPlayer(session, "b", { instrument: "bass", difficulty: "easy", ready: true });
  assert.equal(live.start(session, 1000), true);
  assert.equal(session.state, "playing");
  assert.equal(session.startAt, 1000 + live.START_DELAY_MS);
});

test("lancement : impossible sans morceau", () => {
  const session = lobby();
  session.track = null;
  for (const id of ["a", "b"]) live.setPlayer(session, id, { instrument: "lead", difficulty: "easy", ready: true });
  assert.equal(live.canStart(session), false);
});

/** Partie lancée entre Alice et Bob. */
function playing() {
  const session = lobby();
  for (const id of ["a", "b"]) live.setPlayer(session, id, { instrument: "lead", difficulty: "easy", ready: true });
  live.start(session, 0);
  return session;
}

test("partie : scores en direct, score du groupe = somme, fin quand tous ont fini", () => {
  const session = playing();
  live.report(session, "a", { score: 1200, combo: 8, done: false });
  live.report(session, "b", { score: 800, combo: 3, done: true });
  assert.equal(live.snapshot(session, 0).bandScore, 2000);
  assert.equal(session.state, "playing");

  live.report(session, "a", { score: 1500, combo: 0, done: true });
  assert.equal(session.state, "finished");
});

test("partie : changer de page (déconnexion puis retour) ne fait pas quitter la partie", () => {
  const session = playing();
  live.leave(session, "a"); // le salon se ferme pour ouvrir la page de jeu
  assert.equal(session.players.has("a"), true);
  live.join(session, alice); // la page de jeu rouvre le flux
  assert.equal(live.snapshot(session, 0).players.find((p) => p.id === "a").connected, true);
});

test("partie : tous les joueurs changent de page en même temps, la partie continue", () => {
  const session = playing();
  live.leave(session, "a");
  live.leave(session, "b");
  assert.equal(session.state, "playing");
  live.join(session, alice);
  live.join(session, bob);
  assert.equal(live.report(session, "a", { score: 10, combo: 1, done: false }), true);
});

test("partie : un joueur parti pour de bon ne bloque pas la fin", () => {
  const session = playing();
  live.leave(session, "b");
  live.report(session, "a", { score: 10, combo: 1, done: true });
  assert.equal(session.state, "finished");
});

test("salon : quitter avant le lancement retire le joueur, l'hôte reste le créateur", () => {
  const session = lobby();
  live.leave(session, "a");
  assert.equal(session.players.has("a"), false);
  assert.equal(session.hostId, "a");
});

test("nouvelle partie : retour au salon, tout le monde non prêt, absents retirés", () => {
  const session = playing();
  live.leave(session, "b");
  live.report(session, "a", { score: 10, combo: 1, done: true });
  assert.equal(live.reset(session), true);
  assert.equal(session.state, "lobby");
  assert.deepEqual([...session.players.keys()], ["a"]);
  assert.equal(session.players.get("a").ready, false);
});

test("on ne rejoint pas une partie déjà lancée", () => {
  const session = playing();
  live.join(session, { id: "c", name: "Chloé", avatar: {} });
  assert.equal(session.players.has("c"), false);
});
