import mongoose from "mongoose";

/** Difficultés et instruments du jeu, identiques à ceux du frontend (beatmap.ts). */
export const DIFFICULTIES = ["easy", "medium", "hard", "expert"];
export const INSTRUMENTS = ["lead", "bass", "drums", "vocals"];

/*
 * Meilleur score d'un joueur sur un morceau, pour une difficulté et un instrument.
 * On ne garde qu'un document par combinaison (joueur, morceau, difficulté, instrument) : le classement
 * additionne ces records, et une partie moins bonne ne remplace rien.
 */
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: "Track", required: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    instrument: { type: String, enum: INSTRUMENTS, default: "lead" },
    score: { type: Number, required: true, min: 0 },
    stars: { type: Number, required: true, min: 0, max: 5 },
    accuracy: { type: Number, required: true, min: 0, max: 100 },
    maxCombo: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

// Un seul record par combinaison, garanti par la base elle-même (et accès rapide pour la mise à jour).
schema.index({ userId: 1, trackId: 1, difficulty: 1, instrument: 1 }, { unique: true });

schema.methods.toPublic = function () {
  return {
    id: this.id,
    trackId: String(this.trackId),
    difficulty: this.difficulty,
    instrument: this.instrument ?? "lead",
    score: this.score,
    stars: this.stars,
    accuracy: this.accuracy,
    maxCombo: this.maxCombo,
    updatedAt: this.updatedAt,
  };
};

export const Score = mongoose.model("Score", schema);
