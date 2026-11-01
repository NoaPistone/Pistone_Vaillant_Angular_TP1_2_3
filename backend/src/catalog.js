/**
 * Catalogue de la boutique : avatars et fonds de scène. Il vit uniquement côté serveur :
 * c'est lui qui fixe les prix. Les réponses de l'API contiennent l'article résolu
 * (emoji, couleurs), le frontend n'a donc pas de seconde copie de ces listes à maintenir.
 */
export const AVATARS = [
  { id: "rocker", name: "Rockeur", emoji: "🎸", color: "#8f5bff", price: 0 },
  { id: "drummer", name: "Batteuse", emoji: "🥁", color: "#ff4f7b", price: 150 },
  { id: "singer", name: "Chanteur", emoji: "🎤", color: "#4dc3ff", price: 250 },
  { id: "keys", name: "Claviériste", emoji: "🎹", color: "#4dffa6", price: 400 },
  { id: "fox", name: "Renard", emoji: "🦊", color: "#ff9a3d", price: 600 },
  { id: "alien", name: "Alien", emoji: "👽", color: "#7dff6a", price: 800 },
  { id: "robot", name: "Robot", emoji: "🤖", color: "#9bb7e8", price: 1000 },
  { id: "dragon", name: "Dragon", emoji: "🐉", color: "#ff3b2f", price: 1500 },
  { id: "unicorn", name: "Licorne", emoji: "🦄", color: "#ff7ad9", price: 2000 },
  { id: "skull", name: "Métal", emoji: "💀", color: "#ffd34d", price: 3000 },
];

export const STARTER_AVATAR = "rocker";

/** Avatar du catalogue, ou celui de départ si l'identifiant n'existe plus. */
export function avatarById(id) {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}

/**
 * Fonds de scène affichés derrière la piste pendant une partie.
 * Le fond de départ est un simple dégradé CSS ; les fonds payants sont des shaders WebGL
 * animés (`shader`), qui réagissent aux basses de la musique et au combo du joueur.
 * Les couleurs (`stage`, `deep`, `spotA`, `spotB`) servent de décor de secours quand le
 * navigateur n'a pas WebGL, et d'arrière-plan pendant le chargement du shader.
 */
export const BACKGROUNDS = [
  { id: "stage", name: "Scène néon", shader: null, stage: "#2b1468", deep: "#140a33", spotA: "#ff3fb4", spotB: "#2ee6ff", price: 0 },
  { id: "caustics", name: "Caustiques océan", shader: "caustics", stage: "#0c3a5c", deep: "#04121f", spotA: "#2ee6ff", spotB: "#4d7cff", price: 400 },
  { id: "aurora", name: "Aurore boréale", shader: "aurora", stage: "#0b2a3a", deep: "#020814", spotA: "#4dffa6", spotB: "#b48cff", price: 800 },
  { id: "lasers", name: "Lasers de concert", shader: "lasers", stage: "#1b0a2e", deep: "#05020a", spotA: "#ff3fb4", spotB: "#2ee6ff", price: 1500 },
  { id: "flux", name: "Flux néon", shader: "flux", stage: "#06203a", deep: "#01060f", spotA: "#2ee6ff", spotB: "#4d7cff", price: 1000 },
  { id: "dots", name: "Vagues de points", shader: "dots", stage: "#1a0626", deep: "#05010a", spotA: "#ff3fb4", spotB: "#2ee6ff", price: 1800 },
  { id: "sparks", name: "Étincelles", shader: "sparks", stage: "#3a1204", deep: "#0a0301", spotA: "#ff8a1f", spotB: "#ffd34d", price: 2500 },
  { id: "ascii", name: "Tunnel ASCII", shader: "ascii", stage: "#04142a", deep: "#010409", spotA: "#4d7cff", spotB: "#4dffe0", price: 3000 },
];

export const STARTER_BACKGROUND = "stage";

export function backgroundById(id) {
  return BACKGROUNDS.find((background) => background.id === id) ?? BACKGROUNDS[0];
}

/**
 * Rayons de la boutique. Chaque rayon décrit son catalogue et les deux champs de
 * l'utilisateur concernés : la liste des articles possédés et l'article utilisé.
 * Les routes d'achat et d'équipement sont écrites une seule fois pour tous les rayons.
 */
export const SHOP = {
  avatars: { catalog: AVATARS, owned: "avatars", equipped: "avatar", starter: STARTER_AVATAR, label: "Avatar" },
  backgrounds: { catalog: BACKGROUNDS, owned: "backgrounds", equipped: "background", starter: STARTER_BACKGROUND, label: "Fond" },
};

/**
 * Points gagnés à la fin d'une partie : un point pour 100 de score, plus 10 par étoile.
 * Une partie moyenne (≈ 20 000 points, 3 étoiles) rapporte donc ≈ 230 points.
 */
export function coinsFor(score, stars) {
  return Math.floor(score / 100) + 10 * stars;
}
