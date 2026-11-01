import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { TAG_PATTERN, User } from "./models/User.js";
import { Track } from "./models/Track.js";
import mongoose from "mongoose";
import { DIFFICULTIES, INSTRUMENTS, Score } from "./models/Score.js";
import { avatarById, coinsFor, SHOP } from "./catalog.js";
import { Group, MAX_MEMBERS } from "./models/Group.js";
import * as live from "./live.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    // Seuls les types MIME audio demandés dans le sujet sont acceptés.
    if (allowed.has(file.mimetype)) {
      console.log(`[multer] Type accepté : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error("Format audio non accepté");
    console.error(`[multer] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
/**
 * Un joueur peut jouer un morceau s'il en est le propriétaire, ou s'il partage un groupe
 * avec lui : c'est ce qui permet de jouer ensemble sur le morceau d'un membre.
 */
async function canPlay(userId, ownerId) {
  if (String(ownerId) === userId) return true;
  return Boolean(await Group.exists({ members: { $all: [userId, ownerId] } }));
}

export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      const filter = { ownerId: req.auth.sub };

      console.log(`[tracks] Lecture page=${page}, limit=${limit}, user=${req.auth.sub}`);

      // La lecture des pistes et le comptage total sont parallélisés pour réduire la latence.
      // on utilise Promise.all pour exécuter les deux opérations en parallèle. 
      // Track.find() récupère les pistes de l'utilisateur avec pagination, 
      // tandis que Track.countDocuments() compte le nombre total de pistes pour cet utilisateur.
      // Promise.all attend que les deux opérations soient terminées avant de continuer et les résultats
        // sont stockés dans les variables items et total.
      const [items, total] = await Promise.all([
        Track.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select("-storedName")
          .lean(),
        Track.countDocuments(filter),
      ]);

      // items.map(track) crée un nouveau tableau publicItems en transformant chaque piste pour inclure 
      // uniquement les champs nécessaires à l'API.
      // L'identifiant MongoDB (_id) est converti en chaîne de caractères (id) pour être plus lisible 
      // côté frontend.
      // Le champ _id (généré par MongoDB) est supprimé pour éviter de l'exposer dans la réponse JSON.
      const publicItems = items.map((track) => ({
        ...track,
        id: String(track._id),
        _id: undefined,
      }));

      console.log(`[tracks] ${publicItems.length} piste(s) envoyée(s) sur ${total}`);

      // envoi de la réponse JSON avec les pistes publiques, la page actuelle, la limite par page, 
      // le nombre total de pistes et le nombre total de pages.
      res.json({
        items: publicItems,
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio et le champ texte title.
   * upload.single("audio") traite un seul fichier et le place dans req.file,
   * tandis que req.body.title contient le champ texte associé.
   * C'est ici qu'est fait l'upload de fichiers sur le serveur. 
   * Le middleware auth vérifie le JWT avant d'accepter l'upload.
   * Le middleware upload.single("audio") traite le fichier audio envoyé dans le champ "audio" du formulaire
   * ou de l'appel depuis le frontend avec un objet FormData.
   * Si le fichier est accepté, il est stocké sur le disque et ses métadonnées sont enregistrées 
   * dans MongoDB.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.single("audio"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: req.body.title || req.file.originalname,
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });

        console.log(`[tracks] Upload enregistré : ${track.id}`);
        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);

        // Si MongoDB échoue après l'écriture sur disque, on tente de nettoyer
        // le fichier orphelin. L'erreur de nettoyage est elle aussi loguée.
        if (req.file) {
          const uploadedPath = path.join(UPLOADS, req.file.filename);
          try {
            await fsPromises.unlink(uploadedPath);
            console.log(`[tracks] Fichier temporaire supprimé : ${uploadedPath}`);
          } catch (cleanupError) {
            console.error(
              `[tracks] Impossible de supprimer le fichier temporaire ${uploadedPath}`,
              cleanupError,
            );
          }
        }
        next(error);
      }
    },
  );

  /** Envoie le contenu binaire d'une piste à son propriétaire ou à un membre d'un de ses groupes. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findById(req.params.id).select("+storedName");

      // Morceau inexistant ou non partagé : même réponse, pour ne pas révéler qu'il existe.
      if (!track || !(await canPlay(req.auth.sub, track.ownerId))) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /**
   * Modifie le titre et/ou la description d'une piste après son import.
   * Seuls ces deux champs sont recopiés depuis le corps : un client ne peut pas
   * changer ownerId, storedName ou size en les glissant dans la requête.
   * Les types sont vérifiés AVANT la base ; les longueurs maximales sont
   * contrôlées par les validateurs Mongoose (runValidators) et donnent un 400.
   */
  app.patch("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const { title, description } = req.body ?? {};
      const changes = {};
      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({ message: "Titre invalide" });
        }
        changes.title = title;
      }
      if (description !== undefined) {
        if (typeof description !== "string") {
          return res.status(400).json({ message: "Description invalide" });
        }
        changes.description = description;
      }
      if (Object.keys(changes).length === 0) {
        return res.status(400).json({ message: "Aucune modification fournie" });
      }

      // Le filtre ownerId garantit qu'on ne modifie que ses propres pistes (sinon 404).
      const track = await Track.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.sub },
        { $set: changes },
        { new: true, runValidators: true },
      );

      if (!track) {
        console.warn(`[tracks] Modification impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      console.log(`[tracks] Piste modifiée : ${track.id}`);
      res.json(track.toPublic());
    } catch (error) {
      console.error("[tracks] Erreur de modification", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier physique correspondant. */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      // Les records de ce morceau disparaissent avec lui : le classement ne compte que des morceaux existants.
      await Score.deleteMany({ trackId: track._id });

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /**
   * Enregistre le résultat d'une partie. Seul le meilleur score par (joueur, morceau,
   * difficulté, instrument) est conservé : `best` indique si cette partie bat le record.
   * Les types et bornes sont vérifiés AVANT la base. Limite assumée : la partition
   * étant générée dans le navigateur, le serveur ne peut pas recalculer le score ;
   * il refuse seulement les valeurs impossibles (négatives, hors bornes, non entières).
   */
  app.post("/api/scores", auth, async (req, res, next) => {
    try {
      const { trackId, difficulty, instrument = "lead", score, stars, accuracy, maxCombo } = req.body ?? {};
      const isCount = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
      if (!mongoose.isValidObjectId(trackId)) {
        return res.status(400).json({ message: "Morceau invalide" });
      }
      if (!DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({ message: "Difficulté invalide" });
      }
      if (!INSTRUMENTS.includes(instrument)) {
        return res.status(400).json({ message: "Instrument invalide" });
      }
      if (!isCount(score, 10_000_000) || !isCount(stars, 5) || !isCount(accuracy, 100) || !isCount(maxCombo, 100_000)) {
        return res.status(400).json({ message: "Résultat de partie invalide" });
      }

      // On note ses propres morceaux, ou ceux d'un membre de ses groupes (parties à plusieurs).
      const track = await Track.findById(trackId).select("ownerId");
      if (!track || !(await canPlay(req.auth.sub, track.ownerId))) {
        return res.status(404).json({ message: "Piste inconnue" });
      }

      // Chaque partie terminée rapporte des points, record battu ou non.
      const coinsEarned = coinsFor(score, stars);
      const player = await User.findByIdAndUpdate(req.auth.sub, { $inc: { coins: coinsEarned } }, { new: true });
      const coins = player?.coins ?? 0;

      const key = { userId: req.auth.sub, trackId, difficulty, instrument };
      const previous = await Score.findOne(key);
      if (previous && previous.score >= score) {
        return res.json({ best: false, record: previous.toPublic(), coinsEarned, coins });
      }
      const record = await Score.findOneAndUpdate(
        key,
        { $set: { score, stars, accuracy, maxCombo } },
        { new: true, upsert: true, runValidators: true },
      );
      console.log(`[scores] Nouveau record ${score} sur ${trackId} (${difficulty}) par ${req.auth.sub}`);
      res.status(201).json({ best: true, record: record.toPublic(), coinsEarned, coins });
    } catch (error) {
      console.error("[scores] Erreur d'enregistrement", error);
      next(error);
    }
  });

  /** Records du joueur connecté : un par morceau et difficulté joués. */
  app.get("/api/scores/me", auth, async (req, res, next) => {
    try {
      const records = await Score.find({ userId: req.auth.sub }).sort({ score: -1 });
      res.json(records.map((record) => record.toPublic()));
    } catch (error) {
      console.error("[scores] Erreur de lecture des records", error);
      next(error);
    }
  });

  /**
   * Classement général : pour chaque joueur, somme de ses records (optionnellement
   * d'une seule difficulté), triée du plus grand au plus petit. Le calcul est fait
   * par MongoDB (pipeline d'agrégation) : seules les 50 premières lignes voyagent.
   */
  app.get("/api/scores/leaderboard", auth, async (req, res, next) => {
    try {
      const { difficulty } = req.query;
      if (difficulty !== undefined && !DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({ message: "Difficulté invalide" });
      }
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

      const rows = await Score.aggregate([
        { $match: difficulty ? { difficulty } : {} },
        {
          $group: {
            _id: "$userId",
            total: { $sum: "$score" },
            stars: { $sum: "$stars" },
            played: { $sum: 1 },
          },
        },
        { $sort: { total: -1, _id: 1 } },
        { $limit: limit },
        // Jointure avec les utilisateurs pour afficher le nom (jamais l'email).
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
      ]);

      res.json(
        rows.map((row, index) => ({
          rank: index + 1,
          name: row.user.name,
          avatar: avatarById(row.user.avatar),
          total: row.total,
          stars: row.stars,
          played: row.played,
          isMe: String(row._id) === req.auth.sub,
        })),
      );
    } catch (error) {
      console.error("[scores] Erreur de calcul du classement", error);
      next(error);
    }
  });

  /** Rayon de la boutique demandé dans l'URL (`avatars` ou `backgrounds`), ou 404. */
  const shelfOf = (req, res) => {
    const shelf = Object.hasOwn(SHOP, req.params.shelf) ? SHOP[req.params.shelf] : null;
    if (!shelf) res.status(404).json({ message: "Rayon inconnu" });
    return shelf;
  };

  /** Catalogue d'un rayon, du moins cher au plus cher. */
  app.get("/api/shop/:shelf", auth, (req, res) => {
    const shelf = shelfOf(req, res);
    if (shelf) res.json(shelf.catalog);
  });

  /**
   * Achat d'un article. La vérification du solde et le débit se font en UNE requête MongoDB
   * (filtre coins >= prix et article pas encore possédé) : deux clics simultanés ne peuvent
   * ni acheter deux fois ni rendre le solde négatif.
   */
  app.post("/api/shop/:shelf/:id/buy", auth, async (req, res, next) => {
    try {
      const shelf = shelfOf(req, res);
      if (!shelf) return;
      const item = shelf.catalog.find((i) => i.id === req.params.id);
      if (!item) return res.status(404).json({ message: `${shelf.label} inconnu` });

      const user = await User.findOneAndUpdate(
        { _id: req.auth.sub, coins: { $gte: item.price }, [shelf.owned]: { $ne: item.id } },
        { $inc: { coins: -item.price }, $push: { [shelf.owned]: item.id } },
        { new: true },
      );
      if (!user) {
        // L'achat a échoué : on relit le compte pour donner la vraie raison.
        const current = await User.findById(req.auth.sub);
        if (!current) return res.status(404).json({ message: "Utilisateur inconnu" });
        const owned = current[shelf.owned]?.length ? current[shelf.owned] : [shelf.starter];
        return owned.includes(item.id)
          ? res.status(409).json({ message: `${shelf.label} déjà possédé` })
          : res.status(400).json({ message: "Points insuffisants" });
      }
      console.log(`[shop] ${req.auth.sub} achète ${req.params.shelf}/${item.id} (${item.price} points)`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[shop] Erreur d'achat", error);
      next(error);
    }
  });

  /** Change l'article utilisé (`avatar` ou `background`) : uniquement parmi ceux possédés. */
  app.put("/api/users/me/:slot", auth, async (req, res, next) => {
    try {
      const shelf = Object.values(SHOP).find((s) => s.equipped === req.params.slot);
      if (!shelf) return res.status(404).json({ message: "Réglage inconnu" });
      const id = req.body?.[shelf.equipped];
      if (!shelf.catalog.some((i) => i.id === id)) {
        return res.status(400).json({ message: `${shelf.label} inconnu` });
      }
      const ownsIt = id === shelf.starter ? {} : { [shelf.owned]: id };
      const user = await User.findOneAndUpdate(
        { _id: req.auth.sub, ...ownsIt },
        { $set: { [shelf.equipped]: id } },
        { new: true },
      );
      if (!user) return res.status(403).json({ message: `${shelf.label} non possédé` });
      res.json(user.toPublic());
    } catch (error) {
      console.error("[shop] Erreur de changement d'article", error);
      next(error);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Amis                                                               */
  /* ------------------------------------------------------------------ */

  const publicFriend = (friend) => ({ id: friend.id, name: friend.name, tag: friend.tag, avatar: avatarById(friend.avatar) });

  /** Amis de l'utilisateur, par ordre alphabétique. */
  app.get("/api/friends", auth, async (req, res, next) => {
    try {
      const user = await User.findById(req.auth.sub).populate({ path: "friends", options: { sort: { name: 1 } } });
      if (!user) return res.status(404).json({ message: "Utilisateur inconnu" });
      res.json(user.friends.map(publicFriend));
    } catch (error) {
      console.error("[friends] Erreur de lecture", error);
      next(error);
    }
  });

  /** Ajoute un ami par son identifiant #xxxx. L'amitié est réciproque. */
  app.post("/api/friends", auth, async (req, res, next) => {
    try {
      const tag = String(req.body?.tag ?? "").trim().replace(/^#/, "").toUpperCase();
      if (!TAG_PATTERN.test(tag)) return res.status(400).json({ message: "Identifiant invalide (ex. #K7P2)" });
      const friend = await User.findOne({ tag });
      if (!friend) return res.status(404).json({ message: `Aucun joueur #${tag}` });
      if (friend.id === req.auth.sub) return res.status(400).json({ message: "C'est votre propre identifiant" });
      const added = await User.updateOne({ _id: req.auth.sub }, { $addToSet: { friends: friend._id } });
      if (added.matchedCount === 0) return res.status(404).json({ message: "Utilisateur inconnu" });
      if (added.modifiedCount === 0) return res.status(409).json({ message: `${friend.name} est déjà votre ami` });
      await User.updateOne({ _id: friend._id }, { $addToSet: { friends: req.auth.sub } });
      console.log(`[friends] ${req.auth.sub} et ${friend.id} sont amis`);
      res.status(201).json(publicFriend(friend));
    } catch (error) {
      console.error("[friends] Erreur d'ajout", error);
      next(error);
    }
  });

  /** Retire un ami, des deux côtés. */
  app.delete("/api/friends/:id", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Ami inconnu" });
      const removed = await User.updateOne({ _id: req.auth.sub }, { $pull: { friends: req.params.id } });
      if (removed.modifiedCount === 0) return res.status(404).json({ message: "Ami inconnu" });
      await User.updateOne({ _id: req.params.id }, { $pull: { friends: req.auth.sub } });
      res.status(204).end();
    } catch (error) {
      console.error("[friends] Erreur de suppression", error);
      next(error);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Groupes                                                            */
  /* ------------------------------------------------------------------ */

  const publicGroup = async (group, viewerId) => {
    await group.populate("members", "name avatar");
    return group.toPublic(avatarById, viewerId);
  };
  // Code d'invitation : 6 caractères sans 0/O ni 1/I, faciles à dicter.
  const inviteCode = () =>
    Array.from(crypto.randomBytes(6), (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");

  /**
   * Crée un groupe dont le créateur est le premier membre et l'hôte du salon. Un seul par joueur.
   * ponytail: vérification puis création, deux clics simultanés peuvent passer ; index unique sur
   * ownerId si cela compte (les groupes en double déjà en base devront d'abord être supprimés).
   */
  app.post("/api/groups", auth, async (req, res, next) => {
    try {
      const name = req.body?.name;
      if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 40) {
        return res.status(400).json({ message: "Nom de groupe de 2 à 40 caractères requis" });
      }
      if (await Group.exists({ ownerId: req.auth.sub })) {
        return res.status(409).json({ message: "Vous avez déjà créé un groupe" });
      }
      const group = await Group.create({ name, ownerId: req.auth.sub, members: [req.auth.sub], code: inviteCode() });
      console.log(`[groups] Groupe créé : ${group.id}`);
      res.status(201).json(await publicGroup(group, req.auth.sub));
    } catch (error) {
      console.error("[groups] Erreur de création", error);
      next(error);
    }
  });

  /** Groupes dont l'utilisateur est membre. */
  app.get("/api/groups", auth, async (req, res, next) => {
    try {
      const groups = await Group.find({ members: req.auth.sub }).sort({ createdAt: -1 }).populate("members", "name avatar");
      res.json(groups.map((group) => group.toPublic(avatarById, req.auth.sub)));
    } catch (error) {
      console.error("[groups] Erreur de lecture", error);
      next(error);
    }
  });

  /**
   * Rejoint un groupe par son code. Ajout atomique : pas de doublon et jamais plus de
   * MAX_MEMBERS membres, même si plusieurs joueurs utilisent le code au même instant.
   */
  app.post("/api/groups/join", auth, async (req, res, next) => {
    try {
      const code = String(req.body?.code ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ message: "Code d'invitation invalide" });

      const group = await Group.findOneAndUpdate(
        { code, members: { $ne: req.auth.sub }, [`members.${MAX_MEMBERS - 1}`]: { $exists: false } },
        { $push: { members: req.auth.sub } },
        { new: true },
      );
      if (!group) {
        const existing = await Group.findOne({ code });
        if (!existing) return res.status(404).json({ message: "Aucun groupe avec ce code" });
        return existing.members.some((m) => String(m) === req.auth.sub)
          ? res.status(409).json({ message: "Vous êtes déjà dans ce groupe" })
          : res.status(400).json({ message: `Groupe complet (${MAX_MEMBERS} membres)` });
      }
      console.log(`[groups] ${req.auth.sub} rejoint ${group.id}`);
      res.json(await publicGroup(group, req.auth.sub));
    } catch (error) {
      console.error("[groups] Erreur pour rejoindre", error);
      next(error);
    }
  });

  /** Quitte un groupe. Le créateur (l'hôte) qui part supprime le groupe pour tout le monde. */
  app.post("/api/groups/:id/leave", auth, async (req, res, next) => {
    try {
      const group = await Group.findOneAndUpdate(
        { _id: req.params.id, members: req.auth.sub },
        { $pull: { members: req.auth.sub } },
        { new: true },
      );
      if (!group) return res.status(404).json({ message: "Groupe inconnu" });
      if (group.members.length === 0 || String(group.ownerId) === req.auth.sub) {
        await group.deleteOne();
        sessions.delete(group.id);
      }
      res.status(204).end();
    } catch (error) {
      console.error("[groups] Erreur pour quitter", error);
      next(error);
    }
  });

  /** Morceaux de tous les membres : ce que le groupe peut jouer ensemble. */
  app.get("/api/groups/:id/tracks", auth, async (req, res, next) => {
    try {
      const group = await Group.findOne({ _id: req.params.id, members: req.auth.sub }).populate("members", "name");
      if (!group) return res.status(404).json({ message: "Groupe inconnu" });
      const owners = new Map(group.members.map((m) => [String(m._id), m.name]));
      const tracks = await Track.find({ ownerId: { $in: [...owners.keys()] } }).sort({ createdAt: -1 }).limit(100);
      res.json(tracks.map((t) => ({ ...t.toPublic(), ownerName: owners.get(String(t.ownerId)) })));
    } catch (error) {
      console.error("[groups] Erreur de lecture des morceaux", error);
      next(error);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Parties en direct (Server-Sent Events + actions POST)              */
  /* ------------------------------------------------------------------ */

  const sessions = new Map(); // groupId -> salon (voir live.js)
  const streams = new Map(); // groupId -> Set des réponses SSE ouvertes

  /** Pousse l'état du salon à tous les navigateurs connectés au groupe. */
  const broadcast = (groupId) => {
    const session = sessions.get(groupId);
    if (!session) return;
    const message = `data: ${JSON.stringify(live.snapshot(session, Date.now()))}\n\n`;
    for (const stream of streams.get(groupId) ?? []) stream.write(message);
  };

  /** Vérifie que l'utilisateur est membre ; renvoie le groupe ou envoie 404. */
  const memberOf = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(404).json({ message: "Groupe inconnu" });
      return null;
    }
    const group = await Group.findOne({ _id: req.params.id, members: req.auth.sub });
    if (!group) res.status(404).json({ message: "Groupe inconnu" });
    return group;
  };

  /**
   * Flux temps réel du salon. La réponse reste ouverte : chaque changement d'état est écrit
   * sous la forme « data: {json} » suivie d'une ligne vide (format text/event-stream).
   */
  app.get("/api/groups/:id/live", auth, async (req, res, next) => {
    try {
      const group = await memberOf(req, res);
      if (!group) return;
      const user = await User.findById(req.auth.sub);
      if (!user) return res.status(404).json({ message: "Utilisateur inconnu" });

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const groupId = group.id;
      if (!sessions.has(groupId)) sessions.set(groupId, live.createSession(groupId, String(group.ownerId)));
      if (!streams.has(groupId)) streams.set(groupId, new Set());
      streams.get(groupId).add(res);
      live.join(sessions.get(groupId), { id: req.auth.sub, name: user.name, avatar: avatarById(user.avatar) });
      broadcast(groupId);

      // Un commentaire SSE toutes les 20 s empêche proxys et navigateurs de couper un flux silencieux.
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 20_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        streams.get(groupId)?.delete(res);
        const session = sessions.get(groupId);
        if (!session) return;
        live.leave(session, req.auth.sub);
        broadcast(groupId);
        // Plus personne : le salon disparaît, après un délai pour laisser les joueurs passer
        // du salon à la page de jeu (ils se déconnectent tous au même moment).
        const empty = () => ![...session.players.values()].some((p) => p.connections > 0);
        if (empty()) {
          setTimeout(() => {
            if (sessions.get(groupId) === session && empty()) sessions.delete(groupId);
          }, 30_000).unref();
        }
      });
    } catch (error) {
      console.error("[live] Erreur d'ouverture du flux", error);
      next(error);
    }
  });

  /** Actions du salon : chacune vérifie l'appartenance au groupe et l'existence du salon. */
  const liveAction = (handler) => async (req, res, next) => {
    try {
      const group = await memberOf(req, res);
      if (!group) return;
      const session = sessions.get(group.id);
      if (!session?.players.has(req.auth.sub)) {
        return res.status(409).json({ message: "Ouvrez d'abord le salon du groupe" });
      }
      const error = await handler(session, req);
      if (error) return res.status(error.status).json({ message: error.message });
      broadcast(group.id);
      res.status(204).end();
    } catch (error) {
      console.error("[live] Erreur d'action", error);
      next(error);
    }
  };
  const hostOnly = (session, req) =>
    session.hostId === req.auth.sub ? null : { status: 403, message: "Seul l'hôte du salon peut faire cela" };

  /** L'hôte choisit le morceau parmi ceux des membres. */
  app.post("/api/groups/:id/live/track", auth, liveAction(async (session, req) => {
    const denied = hostOnly(session, req);
    if (denied) return denied;
    if (session.state !== "lobby") return { status: 409, message: "Partie déjà lancée" };
    if (!mongoose.isValidObjectId(req.body?.trackId)) return { status: 400, message: "Morceau invalide" };
    const track = await Track.findById(req.body.trackId);
    if (!track || !(await canPlay(req.auth.sub, track.ownerId))) return { status: 404, message: "Piste inconnue" };
    session.track = { id: track.id, title: track.title };
    return null;
  }));

  /** Chaque joueur règle son instrument, sa difficulté et se déclare prêt. */
  app.post("/api/groups/:id/live/player", auth, liveAction((session, req) => {
    const { instrument, difficulty, ready } = req.body ?? {};
    if (!INSTRUMENTS.includes(instrument) || !DIFFICULTIES.includes(difficulty) || typeof ready !== "boolean") {
      return { status: 400, message: "Réglages de joueur invalides" };
    }
    return live.setPlayer(session, req.auth.sub, { instrument, difficulty, ready })
      ? null
      : { status: 409, message: "Partie déjà lancée" };
  }));

  /** L'hôte lance la partie : départ commun dans START_DELAY_MS. */
  app.post("/api/groups/:id/live/start", auth, liveAction((session, req) => {
    const denied = hostOnly(session, req);
    if (denied) return denied;
    return live.start(session, Date.now())
      ? null
      : { status: 409, message: "Choisissez un morceau et attendez que tout le monde soit prêt" };
  }));

  /** Score en direct d'un joueur (environ une fois par seconde), puis `done` à la fin. */
  app.post("/api/groups/:id/live/score", auth, liveAction((session, req) => {
    const { score, combo, done } = req.body ?? {};
    if (!Number.isInteger(score) || score < 0 || !Number.isInteger(combo) || combo < 0 || typeof done !== "boolean") {
      return { status: 400, message: "Score invalide" };
    }
    return live.report(session, req.auth.sub, { score, combo, done }) ? null : { status: 409, message: "Aucune partie en cours" };
  }));

  /** L'hôte ramène tout le monde au salon pour une nouvelle partie. */
  app.post("/api/groups/:id/live/reset", auth, liveAction((session, req) => {
    const denied = hostOnly(session, req);
    if (denied) return denied;
    return live.reset(session) ? null : { status: 409, message: "Le salon est déjà ouvert" };
  }));

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
