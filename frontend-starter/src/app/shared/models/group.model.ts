import { Difficulty, Instrument } from '../utils/beatmap';
import { Track } from './track.model';
import { Avatar } from './user.model';

/** Ami : l'amitié est réciproque (voir API_CONTRACT.md). */
export interface Friend {
  id: string;
  name: string;
  /** Identifiant à 4 caractères, affiché « #K7P2 ». */
  tag: string;
  avatar: Avatar;
}

/** Groupe de joueurs (voir API_CONTRACT.md). */
export interface Group {
  id: string;
  name: string;
  /** Code d'invitation à partager pour faire entrer quelqu'un. */
  code: string;
  isOwner: boolean;
  members: { id: string; name: string; avatar: Avatar; isOwner: boolean }[];
}

/** Morceau jouable par le groupe : celui d'un des membres. */
export type GroupTrack = Track & { ownerName: string };

export interface LivePlayer {
  id: string;
  name: string;
  avatar: Avatar;
  instrument: Instrument;
  difficulty: Difficulty;
  ready: boolean;
  score: number;
  combo: number;
  done: boolean;
  connected: boolean;
}

/** État du salon poussé par le serveur à chaque changement. */
export interface LiveState {
  state: 'lobby' | 'playing' | 'finished';
  hostId: string | null;
  track: { id: string; title: string } | null;
  /** Heure de départ commune et heure du serveur à l'envoi (millisecondes). */
  startAt: number | null;
  serverNow: number;
  canStart: boolean;
  bandScore: number;
  players: LivePlayer[];
}

/** Ce que le salon transmet à la page de jeu pour une partie à plusieurs. */
export interface LiveLaunch {
  groupId: string;
  /** Heure de départ convertie dans l'horloge de ce navigateur (Date.now()). */
  startAt: number;
  instrument: Instrument;
  difficulty: Difficulty;
}
