/** Avatar du catalogue de la boutique (le serveur fixe le prix et l'apparence). */
export interface Avatar {
  id: string;
  name: string;
  emoji: string;
  color: string;
  price: number;
}

import { StageShader } from '../utils/stage-shaders';

/**
 * Fond de scène affiché derrière la piste : un shader animé (`shader`), ou `null` pour le
 * dégradé de départ. Les couleurs servent de décor de secours sans WebGL.
 */
export interface Background {
  id: string;
  name: string;
  shader: StageShader | null;
  stage: string;
  deep: string;
  spotA: string;
  spotB: string;
  price: number;
}

/** Rayons de la boutique. */
export type Shelf = 'avatars' | 'backgrounds';

/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  /** Identifiant à partager pour être ajouté en ami (4 caractères, affiché « #K7P2 »). */
  tag: string;
  createdAt: string;
  /** Points gagnés en jouant, à dépenser dans la boutique. */
  coins: number;
  /** Avatar affiché. */
  avatar: Avatar;
  /** Identifiants des avatars possédés. */
  avatars: string[];
  /** Fond de scène affiché pendant les parties. */
  background: Background;
  /** Identifiants des fonds possédés. */
  backgrounds: string[];
}
