import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});

/*
 * Tests de contrat et de sécurité (TP3, extension backend).
 * Ils n'ouvrent aucune connexion MongoDB : chaque requête est rejetée par le
 * middleware `auth` ou par Multer AVANT le premier accès à la base.
 * Le JWT de test est signé avec le même secret que l'application ; il n'est
 * jamais affiché dans les logs du test.
 */
const TEST_SECRET = process.env.JWT_SECRET || "tp1-development-secret";
const validToken = () =>
  jwt.sign(
    { sub: new mongoose.Types.ObjectId().toString(), email: "test@example.com" },
    TEST_SECRET,
    { expiresIn: "5m" },
  );

test("401 sans JWT sur une route protégée", async () => {
  const r = await fetch(base + "/api/tracks?page=1&limit=5");
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Authentification requise");
});

test("401 avec un JWT invalide", async () => {
  const r = await fetch(base + "/api/users/me", {
    headers: { Authorization: "Bearer ceci-nest-pas-un-jwt" },
  });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Jeton invalide ou expiré");
});

test("401 avec un JWT signé par un autre secret", async () => {
  const forged = jwt.sign({ sub: "attaquant" }, "mauvais-secret");
  const r = await fetch(base + "/api/tracks/123", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(r.status, 401);
});

test("400 pour un upload sans fichier audio", async () => {
  const body = new FormData();
  body.append("title", "Sans fichier");
  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Fichier audio requis");
});

test("400 pour un type MIME refusé", async () => {
  const body = new FormData();
  body.append("audio", new Blob(["pas du son"], { type: "text/plain" }), "notes.txt");
  body.append("title", "Mauvais format");
  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Format audio non accepté");
});

/*
 * PATCH /api/tracks/:id : les corps invalides sont rejetés AVANT MongoDB.
 */
const patchTrack = (body, token = validToken()) =>
  fetch(base + "/api/tracks/" + new mongoose.Types.ObjectId(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("PATCH piste : 401 sans JWT", async () => {
  const r = await fetch(base + "/api/tracks/123", { method: "PATCH" });
  assert.equal(r.status, 401);
});

test("PATCH piste : 400 si le titre est vide", async () => {
  const r = await patchTrack({ title: "   " });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Titre invalide");
});

test("PATCH piste : 400 si la description n'est pas une chaîne", async () => {
  const r = await patchTrack({ description: 42 });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Description invalide");
});

test("PATCH piste : 400 sans champ modifiable (ownerId ignoré)", async () => {
  const r = await patchTrack({ ownerId: "autre-utilisateur" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Aucune modification fournie");
});

test("schéma : description vide par défaut et longueurs maximales", async () => {
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "x".repeat(121),
    description: "y".repeat(501),
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 1,
  });
  const { errors } = await t.validate().catch((e) => e);
  assert.ok(errors.title);
  assert.ok(errors.description);
  assert.equal(new Track({}).description, "");
});
