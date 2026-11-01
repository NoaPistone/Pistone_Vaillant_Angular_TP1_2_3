/**
 * Fonds de scène animés (shaders WebGL), achetés dans la boutique et dessinés derrière la piste.
 *
 * Chaque shader reçoit les mêmes uniformes :
 * - `resolution` (pixels) et `time` (secondes) ;
 * - `bass` (0 à 1) : énergie des basses de la musique, pour pulser au rythme ;
 * - `combo` (0 à 1) : le combo en cours (plein à 30 notes d'affilée), pour s'intensifier ;
 * - `miss` (0 à 1) : vaut 1 juste après un raté puis retombe, pour ternir brièvement la scène.
 * Ils restent sombres au centre : la piste et ses notes doivent rester lisibles par-dessus.
 */
export type StageShader = 'caustics' | 'aurora' | 'lasers' | 'sparks' | 'flux' | 'dots' | 'ascii';

/** Partie commune : uniformes, bruit pseudo-aléatoire et fin de rendu (effet du raté). */
const HEADER = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float bass;
uniform float combo;
uniform float miss;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}
/* Raté : la scène se ternit vers un gris sombre, le temps que miss retombe à 0. */
vec3 finish(vec3 col) {
  col = 1.0 - exp(-col * 1.4); /* compression douce : les pics de lumière ne saturent jamais en blanc */
  float grey = dot(col, vec3(0.3, 0.5, 0.2));
  return mix(col, vec3(grey * 0.45), miss * 0.75);
}
`;

const BODIES: Record<StageShader, string> = {
  /*
   * Caustiques : les reflets de lumière au fond d'une piscine. Motif classique obtenu en
   * déformant plusieurs fois les coordonnées par des sinus ; les fines lignes claires
   * apparaissent là où la déformation se resserre.
   */
  caustics: `
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = mod(vec2(uv.x * aspect, uv.y) * 6.28318 * 1.2, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float t = time * 0.35;
  for (int n = 0; n < 4; n++) {
    float tn = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tn) / 0.005), p.y / (cos(i.y + tn) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  float light = pow(abs(c), 14.0) * 2.2; // exposant élevé : lignes de lumière fines et nettes
  vec3 deep = mix(vec3(0.0, 0.03, 0.08), vec3(0.0, 0.12, 0.22), uv.y);
  float glow = 0.35 + bass * 0.55 + combo * 0.35;
  // Rais de lumière venus de la surface, qui se balancent lentement.
  float rays = pow(max(0.0, sin(uv.x * aspect * 5.0 + sin(time * 0.3) * 1.5 + uv.y * 2.0)), 6.0) * uv.y * 0.12;
  vec3 col = deep + vec3(0.25, 0.85, 1.0) * (light + rays) * glow;
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.8, uv.y);
  gl_FragColor = vec4(finish(col), 1.0);
}`,

  /*
   * Aurore boréale : trois rideaux de lumière dont la hauteur ondule (bruit fractal),
   * striés verticalement comme les vraies aurores, sur un ciel étoilé.
   */
  aurora: `
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec3 col = mix(vec3(0.0, 0.015, 0.04), vec3(0.01, 0.03, 0.09), uv.y);
  vec2 star = floor(vec2(uv.x * aspect, uv.y) * 180.0);
  col += vec3(0.7) * step(0.997, hash(star)) * (0.5 + 0.5 * sin(time * 2.0 + hash(star + 1.0) * 6.28)) * uv.y;
  float power = 0.9 + bass * 0.6 + combo * 0.5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * aspect;
    // Bord inférieur du rideau : une ligne qui serpente lentement (deux bruits superposés).
    float edge = 0.5 + fi * 0.1 + 0.18 * (noise(vec2(x * 1.3 + time * 0.07 * (fi + 1.0), fi * 5.0)) - 0.5)
               + 0.07 * sin(x * 2.5 + time * 0.25 + fi * 2.0);
    float d = uv.y - edge;
    // Bord net en bas, la lumière s'éteint progressivement en montant.
    float curtain = smoothstep(-0.05, 0.02, d) * exp(-max(d, 0.0) * (3.5 + fi * 1.5));
    // Le rideau n'est pas continu : il s'allume par endroits, et il est strié verticalement.
    float presence = 0.35 + 0.65 * smoothstep(0.3, 0.7, fbm(vec2(x * 0.9 - time * 0.05, fi * 7.0)));
    float streaks = 0.45 + 0.55 * noise(vec2(x * 30.0 + fi * 10.0, time * 0.3));
    vec3 low = vec3(0.1, 1.0, 0.5);
    vec3 high = mix(vec3(0.55, 0.3, 1.0), vec3(1.0, 0.3, 0.6), fi / 2.0);
    vec3 tint = mix(low, high, smoothstep(0.0, 0.25, d)); // vert à la base, violet en haut
    col += tint * curtain * presence * streaks * power;
  }
  gl_FragColor = vec4(finish(col), 1.0);
}`,

  /*
   * Lasers de concert : des faisceaux partent du haut de la scène et balayent de gauche à droite.
   * Plus le combo monte, plus il y a de faisceaux allumés ; les basses les rendent plus vifs.
   * Une brume (bruit fractal) rend les rayons visibles, comme la fumée d'une vraie salle.
   */
  lasers: `
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec3 col = mix(vec3(0.01, 0.0, 0.03), vec3(0.05, 0.01, 0.08), uv.y);
  float haze = 0.35 + 0.65 * fbm(p * 3.0 + vec2(time * 0.05, -time * 0.03));
  float active = 2.0 + combo * 6.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float on = clamp(active - fi, 0.0, 1.0);
    vec2 origin = vec2(aspect * (0.1 + 0.8 * fract(fi * 0.618)), 1.05);
    float angle = sin(time * (0.35 + 0.08 * fi) + fi * 1.7) * 0.75;
    vec2 dir = vec2(sin(angle), -cos(angle));
    vec2 v = p - origin;
    float along = dot(v, dir);
    float across = length(v - dir * along);
    float width = 0.004 + bass * 0.006;
    float beam = step(0.0, along) * exp(-across * across / (width * width)) * exp(-along * 0.6);
    vec3 tint = mod(fi, 3.0) < 1.0 ? vec3(1.0, 0.2, 0.75) : (mod(fi, 3.0) < 2.0 ? vec3(0.2, 0.9, 1.0) : vec3(0.4, 1.0, 0.4));
    col += tint * beam * on * haze * (0.55 + bass * 0.9);
  }
  col += vec3(0.3, 0.1, 0.4) * pow(1.0 - uv.y, 6.0) * (0.15 + bass * 0.3);
  gl_FragColor = vec4(finish(col), 1.0);
}`,

  /*
   * Étincelles : des braises montent depuis le bas en scintillant. Trois couches à des
   * vitesses différentes donnent de la profondeur ; le combo en ajoute et les rend plus chaudes.
   */
  sparks: `
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec3 col = mix(vec3(0.09, 0.02, 0.0), vec3(0.01, 0.0, 0.02), uv.y);
  col += vec3(0.5, 0.15, 0.0) * pow(1.0 - uv.y, 4.0) * (0.25 + bass * 0.5 + combo * 0.3);
  float density = 0.55 + combo * 0.4;
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 7.0 + fl * 5.0;
    vec2 p = vec2(uv.x * aspect, uv.y) * scale;
    p.y -= time * (1.2 + fl * 0.6);
    p.x += sin(p.y * 0.35 + fl * 2.0 + time * 0.5) * 0.6;
    vec2 cell = floor(p);
    vec2 inCell = fract(p) - 0.5;
    float seed = hash(cell + fl * 17.0);
    if (seed > density) continue;
    vec2 offset = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
    vec2 q = inCell - offset * 0.6;
    // Étirée vers le bas : la braise laisse une courte traînée derrière elle en montant.
    q.x *= 1.6;
    q.y = q.y < 0.0 ? q.y * 0.3 : q.y;
    float d = length(q);
    float twinkle = 0.6 + 0.4 * sin(time * 6.0 + seed * 40.0);
    float size = (0.06 + bass * 0.04) / (1.0 + fl * 0.5);
    float core = smoothstep(size, 0.0, d);
    float halo = 0.006 / (d * d + 0.008) * size; // halo lumineux autour du cœur
    float spark = (core + halo) * twinkle * (1.0 - uv.y * 0.55);
    vec3 tint = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.85, 0.4), combo * seed * 2.0);
    col += tint * spark * (0.8 + bass * 0.8);
  }
  gl_FragColor = vec4(finish(col), 1.0);
}`,

  /*
   * Flux néon : des faisceaux de lumière courbes filent vers la droite, sur une grille de
   * repères de visée (« + » et coins de cadre). Les couleurs sont légèrement décalées
   * (rouge et bleu à côté du vert), comme une image d'écran qui tremble.
   * Le combo ajoute des faisceaux, les basses les épaississent.
   */
  flux: `
float strand(vec2 p, float fi) {
  float y = 0.5 + 0.22 * sin(p.x * (1.1 + fi * 0.13) + fi * 1.9 + time * 0.35)
          + 0.08 * sin(p.x * 3.1 - time * 0.9 + fi * 4.0) + (fi - 4.0) * 0.025;
  float d = abs(p.y - y);
  float width = 0.0025 + bass * 0.003;
  return width / (d + width * 0.6) * 0.25 + exp(-d * d / (width * width)) * 0.9;
}
float beams(vec2 p) {
  float total = 0.0;
  float count = 3.0 + combo * 6.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float pulse = 0.6 + 0.4 * sin(p.x * 2.0 - time * 3.0 + fi * 2.3); // la lumière court le long du faisceau
    total += strand(p, fi) * pulse * clamp(count - fi, 0.0, 1.0);
  }
  return total;
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float shift = 0.004 + bass * 0.004;
  vec3 col = vec3(beams(p + vec2(shift, 0.0)), beams(p), beams(p - vec2(shift, 0.0)));
  col *= vec3(0.25, 0.75, 1.0) * (0.45 + bass * 0.5);
  // Repères de visée : un « + » au centre de chaque case, et des coins de cadre en « L »
  // autour de quelques cases tirées au hasard.
  vec2 cell = p * 8.0;
  vec2 f = abs(fract(cell) - 0.5);
  float line = 0.018;
  float plus = max(step(f.x, line) * step(f.y, 0.12), step(f.y, line) * step(f.x, 0.12));
  float inCorner = step(0.36, f.x) * step(0.36, f.y);
  float bracket = inCorner * max(step(0.5 - line * 1.5, f.x), step(0.5 - line * 1.5, f.y));
  float framed = step(0.8, hash(floor(cell)));
  float near = smoothstep(0.35, 0.0, abs(p.y - 0.5 - 0.15 * sin(p.x + time * 0.35)));
  col += vec3(0.6, 0.85, 1.0) * (plus * 0.5 + bracket * framed * 0.7) * (0.12 + near * 0.9);
  col += vec3(0.0, 0.02, 0.06);
  gl_FragColor = vec4(finish(col), 1.0);
}`,

  /*
   * Vagues de points : un relief vu en perspective, dessiné en lignes de points (magenta en
   * haut des crêtes, cyan dans les creux). On parcourt 40 rangées de la plus lointaine à la
   * plus proche ; chaque rangée est une courbe de hauteur, pointillée. Les basses font gonfler le relief.
   */
  dots: `
float height(float x, float z) {
  return 0.55 * sin(x * 1.3 + z * 0.8 + time * 0.5) * sin(z * 0.9 - time * 0.3)
       + 0.35 * sin(x * 2.7 - z * 1.7 + time * 0.8) + 0.25 * noise(vec2(x * 1.5, z * 1.5 - time * 0.4));
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec3 col = vec3(0.01, 0.0, 0.025);
  float amp = 0.16 + bass * 0.12 + combo * 0.05;
  float scroll = fract(time * 0.5) * 0.1; // les rangées avancent vers le joueur
  for (int i = 0; i < 48; i++) {
    float z = 1.0 + float(i) * 0.1 - scroll;   // profondeur de la rangée
    float s = 1.0 / z;                          // perspective : plus loin = plus petit
    float x = (uv.x - 0.5) * aspect / s;        // abscisse dans le relief
    float h = height(x, z + floor(time * 5.0) * 0.1);
    // Rangée la plus proche en bas de l'écran, horizon aux deux tiers de la hauteur.
    float y = 0.66 * (1.0 - s) + h * amp * s;
    float dyPx = (uv.y - y) * resolution.y;
    // Points espacés régulièrement dans le relief, donc plus serrés au loin.
    float spacing = 0.045;
    float dxPx = (fract(x / spacing) - 0.5) * spacing * s * resolution.y;
    float radius = 0.7 + 1.8 * s;
    float spot = smoothstep(radius + 0.8, radius - 0.4, length(vec2(dxPx, dyPx)));
    vec3 tint = mix(vec3(0.1, 0.85, 1.0), vec3(1.0, 0.2, 0.85), smoothstep(-0.5, 0.5, h));
    col += tint * spot * (0.35 + 0.65 * s) * (0.6 + bass * 0.5);
  }
  gl_FragColor = vec4(finish(col), 1.0);
}`,

  /*
   * Tunnel ASCII : un tunnel qui fonce vers le joueur, affiché avec des caractères de texte.
   * L'écran est découpé en cases de la taille d'un caractère ; la luminosité du tunnel au
   * centre de la case choisit le caractère (de « . » à « # »), dessiné à partir d'une petite
   * police de 4 × 5 pixels codée en nombres (un bit par pixel).
   */
  ascii: `
float glyph(float level, vec2 p) {
  // Caractères du plus clair au plus dense : espace . : - = + * #. Chaque nombre code un dessin
  // de 4 × 5 pixels (bit x + 4y, y = 0 en bas). highp : ces nombres dépassent la précision mediump.
  highp float bits = level < 0.5 ? 0.0 : level < 1.5 ? 2.0 : level < 2.5 ? 8224.0 : level < 3.5 ? 3840.0
                   : level < 4.5 ? 61680.0 : level < 5.5 ? 10016.0 : level < 6.5 ? 337701.0 : 390645.0;
  vec2 px = floor(p * vec2(4.0, 5.0));
  if (px.x < 0.0 || px.x > 3.0 || px.y < 0.0 || px.y > 4.0) return 0.0;
  highp float bit = exp2(px.x + px.y * 4.0);
  return mod(floor(bits / bit), 2.0);
}
void main() {
  vec2 cellSize = vec2(8.0, 13.0) * max(1.0, resolution.y / 700.0);
  vec2 cell = floor(gl_FragCoord.xy / cellSize);
  vec2 inCell = fract(gl_FragCoord.xy / cellSize) * vec2(1.25, 1.2) - vec2(0.1, 0.1);
  vec2 c = (cell * cellSize + cellSize * 0.5 - resolution * 0.5) / resolution.y;
  float r = length(c);
  float a = atan(c.y, c.x) / 6.28318 + 0.5;
  // Coordonnées du tunnel : l'angle autour du centre et la profondeur (1 / distance), qui
  // défile avec le temps. Un bruit étiré le long de la profondeur trace de longues traînées.
  float depth = 0.3 / max(r, 0.02) + time * (1.0 + combo * 1.5);
  float streak = smoothstep(0.42, 0.78, noise(vec2(a * 22.0, depth * 0.45)));
  float light = streak * smoothstep(0.03, 0.4, r) * (0.65 + bass * 0.6);
  float level = floor(clamp(light, 0.0, 0.999) * 8.0);
  float ink = glyph(level, inCell);
  vec3 tint = mix(vec3(0.15, 0.35, 1.0), vec3(0.2, 1.0, 0.85), smoothstep(0.1, 0.6, r));
  // × 0,75 : les caractères restent en retrait derrière le texte de la page et les notes.
  vec3 col = tint * ink * (0.35 + light) * 0.75 + vec3(0.0, 0.01, 0.03);
  gl_FragColor = vec4(finish(col), 1.0);
}`,
};

/** Source complète du fragment shader d'un fond. */
export function fragmentSource(shader: StageShader): string {
  return HEADER + BODIES[shader];
}

/** Rectangle plein écran : chaque pixel est ensuite calculé par le fragment shader. */
export const VERTEX_SOURCE = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

/**
 * Énergie des basses (≈ 40 à 160 Hz : grosse caisse, basse) dans le spectre d'un AnalyserNode,
 * de 0 à 1. `bins` vient de getByteFrequencyData : chaque case couvre sampleRate / fftSize Hz.
 */
export function bassLevel(bins: Uint8Array, sampleRate: number): number {
  const binHz = sampleRate / (bins.length * 2);
  const from = Math.max(1, Math.floor(40 / binHz));
  const to = Math.max(from + 1, Math.ceil(160 / binHz));
  let sum = 0;
  for (let i = from; i < to; i++) sum += bins[i] ?? 0;
  return sum / ((to - from) * 255);
}
