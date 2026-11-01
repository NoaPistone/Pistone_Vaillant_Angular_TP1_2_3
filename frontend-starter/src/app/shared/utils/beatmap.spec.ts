import { ChartNote, DIFFICULTIES, INSTRUMENTS, findHittable, GameNote, generateChart, grade, judge, maxScore, multiplierFor, starProgress } from './beatmap';

const RATE = 44100;

/**
 * Signal synthétique : bruit de fond faible + coups secs (bruit fort pendant 30 ms)
 * à des instants connus. Le détecteur doit les retrouver à ±20 ms près.
 */
function clicks(timesMs: number[], durationMs: number): Float32Array {
  const samples = new Float32Array(Math.round((durationMs / 1000) * RATE));
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < samples.length; i++) samples[i] = 0.01 * noise();
  for (const t of timesMs) {
    const start = Math.round((t / 1000) * RATE);
    for (let i = start; i < start + 0.03 * RATE && i < samples.length; i++) samples[i] = 0.8 * noise();
  }
  return samples;
}

/**
 * Notes synthétiques « de guitare » : fondamentale + harmoniques 2 et 3, attaque rapide,
 * sur un léger bruit de fond. La hauteur de chaque note est donc connue exactement.
 */
function tones(notes: { startMs: number; durMs: number; hz: number }[], durationMs: number): Float32Array {
  const out = new Float32Array(Math.round((durationMs / 1000) * RATE));
  let seed = 3;
  for (let i = 0; i < out.length; i++) out[i] = 0.002 * (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1);
  for (const { startMs, durMs, hz } of notes) {
    const start = Math.round((startMs / 1000) * RATE);
    const length = Math.round((durMs / 1000) * RATE);
    for (let i = 0; i < length && start + i < out.length; i++) {
      const t = i / RATE;
      // Attaque et relâchement de 5 ms, comme un vrai instrument : un départ brutal ferait un « clic »
      // contenant toutes les fréquences, que même un filtre passe-bas laisserait passer.
      const envelope = Math.min(1, i / (0.005 * RATE), (length - i) / (0.005 * RATE));
      out[start + i] += envelope * (0.5 * Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t) + 0.15 * Math.sin(6 * Math.PI * hz * t));
    }
  }
  return out;
}

describe('generateChart', () => {
  const expected = [1000, 1500, 2000, 2500, 3000, 3500, 4000];
  const samples = clicks(expected, 5000);

  it('place une note sur chaque attaque, à ±20 ms près', () => {
    // En Difficile, un accord ajoute une seconde note au même instant : on compare les instants distincts.
    const times = [...new Set(generateChart(samples, RATE, 'hard').map((n) => n.timeMs))];

    expect(times.length).toBe(expected.length);
    times.forEach((t, i) => expect(Math.abs(t - expected[i])).toBeLessThanOrEqual(20));
  });

  it('respecte l’écart minimal de la difficulté facile (450 ms)', () => {
    const dense = clicks([1000, 1200, 1400, 1600, 1800, 2000], 3000);
    const chart = generateChart(dense, RATE, 'easy');

    chart.slice(1).forEach((note, i) => expect(note.timeMs - chart[i].timeMs).toBeGreaterThanOrEqual(450));
  });

  it('attribue des couloirs valides', () => {
    for (const note of generateChart(samples, RATE, 'medium')) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThan(DIFFICULTIES.medium.lanes);
    }
  });

  it('ne produit aucune note sur un silence', () => {
    expect(generateChart(new Float32Array(RATE * 2), RATE, 'hard')).toEqual([]);
  });

  it('utilise 5 voies et des accords en Expert, 4 voies sans accord en Facile', () => {
    const expert = generateChart(samples, RATE, 'expert');
    const chords = expert.filter((n, i) => i > 0 && n.timeMs === expert[i - 1].timeMs);

    expect(expert.every((n) => n.lane >= 0 && n.lane < 5)).toBe(true);
    expect(chords.length).toBeGreaterThan(0);
    for (const second of chords) {
      const first = expert[expert.indexOf(second) - 1];
      expect(Math.abs(second.lane - first.lane)).toBe(2); // deux couloirs d'écart : jouable à deux doigts
    }
    const easy = generateChart(samples, RATE, 'easy');
    expect(new Set(easy.map((n) => n.timeMs)).size).toBe(easy.length);
  });

  it('transforme une note tenue en note longue, et pas les coups secs', () => {
    // La 220 Hz tenue 1,5 s, puis Mi 330 Hz bref.
    const chart = generateChart(tones([{ startMs: 500, durMs: 1500, hz: 220 }, { startMs: 2300, durMs: 250, hz: 330 }], 3200), RATE, 'medium');

    expect(chart).toHaveLength(2);
    expect(chart[0].durationMs).toBeGreaterThanOrEqual(1000);
    expect(chart[1].durationMs).toBe(0);
    expect(generateChart(samples, RATE, 'medium').every((n) => n.durationMs === 0)).toBe(true);
  });

  it('retire les attaques qui tombent pendant une note longue', () => {
    // Même note réattaquée à 1,2 s (le son baisse puis remonte) : le joueur tient déjà la touche.
    const held = tones([{ startMs: 500, durMs: 1500, hz: 220 }], 2600);
    for (let i = Math.round(1.15 * RATE); i < 1.2 * RATE; i++) held[i] *= 0.5;

    const chart = generateChart(held, RATE, 'expert');

    expect(chart[0].durationMs).toBeGreaterThanOrEqual(1000);
    expect(chart.filter((n) => n.timeMs > 600 && n.timeMs < chart[0].timeMs + chart[0].durationMs)).toEqual([]);
  });

  it('place une mélodie montante de gauche à droite', () => {
    const scale = [196, 247, 294, 392, 494, 587].map((hz, i) => ({ startMs: 300 + i * 500, durMs: 250, hz }));
    const lanes = generateChart(tones(scale, 3600), RATE, 'medium').map((n) => n.lane);

    expect(lanes).toHaveLength(6);
    expect(lanes).toEqual([...lanes].sort((a, b) => a - b));
    expect(lanes[0]).toBe(0);
    expect(lanes.at(-1)).toBe(3);
  });

  it('remet une même note sur la même touche', () => {
    const riff = [330, 440, 330, 440, 330, 440].map((hz, i) => ({ startMs: 300 + i * 500, durMs: 250, hz }));
    const chart = generateChart(tones(riff, 3600), RATE, 'medium');
    const low = chart.filter((_, i) => i % 2 === 0).map((n) => n.lane);
    const high = chart.filter((_, i) => i % 2 === 1).map((n) => n.lane);

    expect(new Set(low).size).toBe(1);
    expect(new Set(high).size).toBe(1);
    expect(high[0]).toBeGreaterThan(low[0]);
  });

  it('marque en HOPO les notes rapprochées sur un autre couloir, jamais en Facile', () => {
    const fast = clicks(Array.from({ length: 30 }, (_, i) => 500 + i * 160), 6000);
    const expert = generateChart(fast, RATE, 'expert');
    const hopos = expert.filter((n) => n.hopo);

    expect(hopos.length).toBeGreaterThan(0);
    for (const note of hopos) {
      const previous = expert[expert.indexOf(note) - 1];
      expect(note.timeMs - previous.timeMs).toBeLessThanOrEqual(DIFFICULTIES.expert.hopoGapMs);
      expect(note.lane).not.toBe(previous.lane);
    }
    expect(generateChart(fast, RATE, 'easy').some((n) => n.hopo)).toBe(false);
  });

  it('répartit des phrases Overdrive de 6 notes', () => {
    const long = clicks(Array.from({ length: 60 }, (_, i) => 500 + i * 300), 19000);
    const chart = generateChart(long, RATE, 'medium');

    expect(chart.filter((n) => n.phrase === 0)).toHaveLength(6);
    expect(chart.slice(0, 16).every((n) => n.phrase === -1)).toBe(true);
  });
});

describe('jugement des frappes', () => {
  it('applique les fenêtres 50 / 100 ms', () => {
    expect(judge(-40)).toBe('perfect');
    expect(judge(80)).toBe('good');
    expect(judge(140)).toBe('miss');
  });

  it('calcule la note finale', () => {
    expect(grade(96)).toBe('S');
    expect(grade(60)).toBe('C');
    expect(grade(10)).toBe('D');
  });

  it('trouve la note la plus proche du couloir, dans la fenêtre de 160 ms', () => {
    const notes: GameNote[] = [
      { timeMs: 1000, lane: 0, result: null },
      { timeMs: 1100, lane: 0, result: null },
      { timeMs: 1050, lane: 1, result: null },
      { timeMs: 900, lane: 0, result: 'perfect' as const },
    ].map((n) => ({ ...n, durationMs: 0, hopo: false, phrase: -1, sustaining: false }));

    expect(findHittable(notes, 0, 1070)).toBe(notes[1]);
    expect(findHittable(notes, 0, 2000)).toBeNull();
    expect(findHittable(notes, 0, 905)?.timeMs).toBe(1000); // la note déjà touchée est ignorée
  });
});

describe('multiplicateur, score maximal et étoiles', () => {
  it('monte d’un palier toutes les 10 notes et plafonne à x4', () => {
    expect([0, 9, 10, 29, 30, 500].map((combo) => multiplierFor(combo))).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it('calcule le score maximal en tenant compte des paliers et des maintiens', () => {
    const notes = (count: number, durationMs = 0): ChartNote[] =>
      Array.from({ length: count }, (_, i) => ({ timeMs: i * 500, lane: 0, durationMs, hopo: false, phrase: -1 }));
    expect(maxScore([])).toBe(0);
    expect(maxScore(notes(10))).toBe(1000); // 10 notes en x1
    expect(maxScore(notes(12))).toBe(1400); // + 2 notes en x2
    expect(maxScore(notes(45))).toBe(1000 + 2000 + 3000 + 15 * 400);
    expect(maxScore(notes(1, 2000))).toBe(100 + 2 * 50); // 2 s de maintien à 50 points/s
  });

  it('remplit les étoiles une à une selon la part du score maximal', () => {
    expect(starProgress(0, 1000)).toBe(0);
    expect(starProgress(50, 1000)).toBeCloseTo(0.5); // moitié du chemin vers 10 %
    expect(starProgress(250, 1000)).toBe(2);
    expect(starProgress(550, 1000)).toBeCloseTo(3.5); // entre 45 % et 65 %
    expect(starProgress(1000, 1000)).toBe(5);
    expect(starProgress(0, 0)).toBe(0);
  });
});

describe('partitions par instrument', () => {
  const near = (times: number[], expected: number[]) =>
    expected.every((t) => times.some((x) => Math.abs(x - t) <= 30)) && times.length === expected.length;

  it('la basse n’entend que les graves du mix', () => {
    const bassAt = [500, 1500, 2500];
    const leadAt = [1000, 2000, 3000];
    const mix = tones(
      [
        ...bassAt.map((startMs, i) => ({ startMs, durMs: 250, hz: [82, 110, 98][i] })),
        ...leadAt.map((startMs, i) => ({ startMs, durMs: 250, hz: [1320, 1480, 1760][i] })),
      ],
      3600,
    );

    expect(near(generateChart(mix, RATE, 'medium', 'bass').map((n) => n.timeMs), bassAt)).toBe(true);
    // Le lead joue sur tout le mix : il garde les deux séries d'attaques.
    expect(generateChart(mix, RATE, 'medium', 'lead').length).toBe(6);
  });

  it('batterie : grosse caisse à gauche, charleston à droite, sans note longue ni HOPO', () => {
    const drums = new Float32Array(RATE * 4);
    let seed = 11;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const kicks = [400, 1400, 2400];
    const hats = [900, 1900, 2900];
    for (const t of kicks) {
      const start = Math.round((t / 1000) * RATE);
      for (let i = 0; i < 0.15 * RATE; i++) {
        drums[start + i] = 0.9 * Math.min(1, i / (0.002 * RATE)) * Math.exp(-i / (0.04 * RATE)) * Math.sin((2 * Math.PI * 60 * i) / RATE);
      }
    }
    for (const t of hats) {
      const start = Math.round((t / 1000) * RATE);
      for (let i = 0; i < 0.03 * RATE; i++) drums[start + i] = 0.6 * noise();
    }

    const chart = generateChart(drums, RATE, 'medium', 'drums');
    const laneAt = (t: number) => chart.find((n) => Math.abs(n.timeMs - t) <= 30)!.lane;

    expect(kicks.map(laneAt)).toEqual([0, 0, 0]); // même fût = même touche, tout le morceau
    expect(hats.map(laneAt)).toEqual([3, 3, 3]);
    expect(chart.every((n) => n.durationMs === 0 && !n.hopo)).toBe(true);
  });

  it('le chant transforme en note longue une note plus courte que le lead', () => {
    const phrase = tones([{ startMs: 500, durMs: 420, hz: 440 }, { startMs: 1300, durMs: 200, hz: 523 }], 2000);

    expect(generateChart(phrase, RATE, 'medium', 'vocals')[0].durationMs).toBeGreaterThanOrEqual(INSTRUMENTS.vocals.sustainMinMs);
    expect(generateChart(phrase, RATE, 'medium', 'lead')[0].durationMs).toBe(0);
  });

  it('le multiplicateur de la basse monte jusqu’à x6', () => {
    expect(multiplierFor(55, INSTRUMENTS.bass.maxMultiplier)).toBe(6);
    expect(multiplierFor(55)).toBe(4);
  });
});
