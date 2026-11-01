import { Difficulty, Instrument } from '../utils/beatmap';
import { Avatar } from './user.model';

/** Meilleur score d'un joueur sur un morceau, pour une difficulté (voir API_CONTRACT.md). */
export interface ScoreRecord {
  id: string;
  trackId: string;
  difficulty: Difficulty;
  instrument: Instrument;
  score: number;
  stars: number;
  accuracy: number;
  maxCombo: number;
  updatedAt: string;
}

/** Résultat d'une partie envoyé au serveur : des entiers, le serveur refuse le reste. */
export type GameResult = Omit<ScoreRecord, 'id' | 'updatedAt'>;

/** Réponse de `POST /api/scores` : `best` vaut vrai si la partie bat le record. */
export interface ScoreSubmission {
  best: boolean;
  record: ScoreRecord;
  /** Points gagnés par cette partie, et nouveau solde du joueur. */
  coinsEarned: number;
  coins: number;
}

/** Ligne du classement général : somme des records d'un joueur. */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: Avatar;
  total: number;
  stars: number;
  played: number;
  isMe: boolean;
}
