import mongoose from "mongoose";
import { createApp } from "./app.js";
import { User } from "./models/User.js";
import { Score } from "./models/Score.js";

// Le port et l'URI viennent de l'environnement du backend, jamais d'Angular.
const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  const error = new Error("MONGODB_URI manque dans backend/.env");
  console.error("[startup] Configuration MongoDB absente", error);
  throw error;
}

try {
  // `await` suspend le démarrage jusqu'à la connexion effective à MongoDB.
  // Le `then` rend le succès visible dans les logs.
  await mongoose.connect(uri).then(() => {
    console.log("[startup] Connecté à MongoDB Atlas");
    console.log(
      "[startup] La base guitar-practice-cloud est prête à recevoir des données",
    );
    console.log(`[startup] Vérification : http://localhost:${port}/api/health`);
  });
} catch (error) {
  // Ne pas démarrer une API qui ne peut pas accéder à sa base de données.
  console.error("[startup] Échec de connexion à MongoDB", error);
  throw error;
}

try {
  // Le compte de démonstration facilite les premiers tests des étudiants.
  const demoEmail = "demo@example.com";
  const demoExists = await User.exists({ email: demoEmail });

  if (!demoExists) {
    const demoUser = await User.create({
      name: "Demo",
      email: demoEmail,
      password: "Demo1234!",
    });
    console.log(`[startup] Compte de démonstration créé : ${demoUser.id}`);
  } else {
    console.log("[startup] Compte de démonstration déjà présent");
  }
} catch (error) {
  console.error("[startup] Impossible de préparer le compte de démonstration", error);
  throw error;
}

try {
  // Migration des records d'avant les instruments : ils comptaient pour la partition « lead ».
  // syncIndexes() remplace ensuite l'ancien index unique (sans instrument) par le nouveau.
  const { modifiedCount } = await Score.updateMany({ instrument: { $exists: false } }, { $set: { instrument: "lead" } });
  if (modifiedCount) console.log(`[startup] ${modifiedCount} record(s) rattaché(s) à l'instrument lead`);
  await Score.syncIndexes();
  // Comptes d'avant les amis : la validation leur attribue un identifiant #xxxx.
  const untagged = await User.find({ tag: { $exists: false } });
  for (const user of untagged) await user.save({ validateModifiedOnly: true });
  if (untagged.length) console.log(`[startup] ${untagged.length} identifiant(s) d'ami attribué(s)`);
} catch (error) {
  console.error("[startup] Impossible de mettre à jour les index des scores", error);
  throw error;
}

const server = createApp().listen(port, () => {
  console.log(`Guitar Practice Cloud API: http://localhost:${port}/api/health`);
});

// Le callback `error` couvre notamment un port déjà utilisé.
server.on("error", (error) => {
  console.error(`[startup] Impossible d'écouter sur le port ${port}`, error);
});
