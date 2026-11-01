import { Component, computed, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TrackService } from '../../shared/services/track.service';
import { ScoreService } from '../../shared/services/score.service';
import { AuthService } from '../../shared/services/auth.service';
import { GroupService } from '../../shared/services/group.service';
import { LiveLaunch, LiveState } from '../../shared/models/group.model';
import { Subscription } from 'rxjs';
import { ScoreRecord } from '../../shared/models/score.model';
import {
  Difficulty,
  DIFFICULTIES,
  findHittable,
  GameNote,
  generateChart,
  GOOD_WINDOW_MS,
  Instrument,
  INSTRUMENTS,
  grade,
  judge,
  Judgement,
  maxScore,
  MISS_WINDOW_MS,
  multiplierFor,
  PERFECT_POINTS,
  starProgress,
  SUSTAIN_POINTS_PER_S,
  toMono,
} from '../../shared/utils/beatmap';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { StageShaderComponent } from '../stage-shader/stage-shader';

/** Touches par couloir : AZERTY d'abord (comme Guithar Hero), QWERTY en alternative. */
const LANE_KEYS = [['a', 'q'], ['z', 'w'], ['e'], ['r'], ['t']];
/** Couleurs Guitar Hero (vert, rouge, jaune, bleu, orange), saturées pour briller sur la scène violette. */
const LANE_COLORS = ['#4dffa6', '#ff4f7b', '#ffd84d', '#4dc3ff', '#ff9a3d'];
const GOLD = '#ffd34d'; // notes des phrases Overdrive et piste pendant l'Overdrive
const LEAD_IN_S = 3; // décompte avant la première mesure : laisse les premières notes descendre

/*
 * Géométrie de la piste en perspective (pixels du canvas).
 * Une note à la profondeur z (0 = ligne de frappe, 1 = bout de la piste) est dessinée à l'échelle
 * s = 1 / (1 + PERSPECTIVE × z) : sa largeur et sa distance au point de fuite sont multipliées par s.
 * C'est la projection d'une caméra placée au-dessus de la piste, comme dans Guitar Hero ou Festival.
 */
const WIDTH = 640;
const HEIGHT = 560;
const CENTER_X = WIDTH / 2;
const HIT_Y = 470;
const VANISH_Y = -40; // point de fuite, au-dessus du canvas
const ROAD_WIDTH = 500; // largeur de la piste au niveau de la ligne de frappe
const PERSPECTIVE = 3;
const BEAT_MS = 500; // lignes transversales qui défilent : elles rendent la vitesse lisible

/*
 * Overdrive : chaque phrase dorée réussie sans raté remplit un quart de la jauge.
 * On peut le déclencher dès la moitié (Espace) ; il double le multiplicateur pendant
 * que la jauge se vide (16 s pour une jauge pleine, 8 s pour une demi-jauge).
 */
const OVERDRIVE_PER_PHRASE = 0.25;
const OVERDRIVE_MIN = 0.5;
const OVERDRIVE_DRAIN_PER_S = 1 / 16;

type Phase = 'loading' | 'ready' | 'playing' | 'finished' | 'error';

/** Enregistrement du score en fin de partie : un état à la fois, comme pour l'upload. */
export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; best: boolean; record: ScoreRecord; coinsEarned: number }
  | { status: 'error'; message: string };

/**
 * Jeu de rythme façon Guitar Hero / Fortnite Festival sur un morceau de la bibliothèque.
 * Flux : TrackService.audio() → Blob → decodeAudioData → generateChart() → partie.
 * L'horloge du jeu est celle de l'AudioContext : les notes restent calées sur la musique.
 */
@Component({
  imports: [RouterLink, DecimalPipe, StageShaderComponent],
  templateUrl: './game-page.html',
  styleUrl: './game-page.css',
  host: { '(document:keydown)': 'onKey($event)', '(document:keyup)': 'onKeyUp($event)' },
})
export class GamePageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly scores = inject(ScoreService);
  private readonly auth = inject(AuthService);
  private readonly groups = inject(GroupService);
  private readonly trackId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('stage');

  readonly title: string = history.state?.title ?? 'Morceau';
  /** Fond de scène acheté et choisi dans la boutique, affiché derrière la piste. */
  readonly backdrop = computed(() => this.auth.currentUser()?.background ?? null);
  /** Analyseur de la musique en cours : le fond animé y lit l'énergie des basses. */
  readonly analyser = signal<AnalyserNode | null>(null);
  /** Combo de 0 à 1 (plein à 30 notes d'affilée) : le fond animé s'intensifie avec lui. */
  readonly comboHeat = computed(() => Math.min(this.combo(), 30) / 30);
  /** Partie à plusieurs lancée depuis le salon d'un groupe, sinon `null` (partie solo). */
  readonly live: LiveLaunch | null = history.state?.live ?? null;
  /** État du groupe pendant la partie : scores des autres joueurs, en direct. */
  readonly band = signal<LiveState | null>(null);
  readonly bandPlayers = computed(() => [...(this.band()?.players ?? [])].sort((a, b) => b.score - a.score));
  private bandStream?: Subscription;
  private lastReport = 0;
  readonly difficulties = (Object.keys(DIFFICULTIES) as Difficulty[]).map((value) => ({ value, ...DIFFICULTIES[value] }));

  readonly phase = signal<Phase>('loading');
  /** À plusieurs : le navigateur refuse le son sans clic récent (Safari) ; un clic rejoint la partie. */
  readonly audioBlocked = signal(false);
  readonly error = signal('');
  readonly difficulty = signal<Difficulty>('medium');
  readonly instruments = (Object.keys(INSTRUMENTS) as Instrument[]).map((value) => ({ value, ...INSTRUMENTS[value] }));
  readonly instrument = signal<Instrument>('lead');
  /** Instrument de la partie en cours : il fixe le plafond du multiplicateur (x6 à la basse). */
  private readonly playedInstrument = signal<Instrument>('lead');
  readonly instrumentDescription = computed(() => INSTRUMENTS[this.instrument()].description);
  private readonly maxMultiplier = computed(() => INSTRUMENTS[this.playedInstrument()].maxMultiplier);
  /** Couloirs de la difficulté choisie : 4 ou 5 touches. */
  readonly lanes = computed(() =>
    LANE_KEYS.slice(0, DIFFICULTIES[this.difficulty()].lanes).map((keys, i) => ({ key: keys[0].toUpperCase(), color: LANE_COLORS[i] })),
  );
  /** Calibration : retard du son sur l'image (casque Bluetooth ≈ 150 à 250 ms). */
  readonly offsetMs = signal(0);
  /** Vitesse de défilement (1x à 2x) : espace les notes à l'écran sans changer le tempo de la musique. */
  readonly trackSpeed = signal(1);

  readonly score = signal(0);
  readonly combo = signal(0);
  readonly maxCombo = signal(0);
  readonly counts = signal<Record<Judgement, number>>({ perfect: 0, good: 0, miss: 0 });
  readonly feedback = signal<{ text: Judgement; at: number } | null>(null);
  /** Jauge d'Overdrive de 0 à 1, et Overdrive en cours. */
  readonly overdrive = signal(0);
  readonly overdriveActive = signal(false);
  readonly overdriveReady = computed(() => !this.overdriveActive() && this.overdrive() >= OVERDRIVE_MIN);

  readonly judged = computed(() => {
    const c = this.counts();
    return c.perfect + c.good + c.miss;
  });
  readonly accuracy = computed(() => {
    const c = this.counts();
    return this.judged() ? Math.round(((c.perfect + c.good) / this.judged()) * 100) : 100;
  });
  readonly finalGrade = computed(() => grade(this.accuracy()));
  /** Le score avance en continu pendant les maintiens : on n'affiche que des points entiers. */
  readonly displayScore = computed(() => Math.round(this.score()));
  /** Multiplicateur du combo : x1 de 0 à 9 notes d'affilée, x2 de 10 à 19… plafonné à x4. */
  readonly baseMultiplier = computed(() => multiplierFor(this.combo(), this.maxMultiplier()));
  /** Multiplicateur appliqué : doublé pendant l'Overdrive (x8 au maximum). */
  readonly multiplier = computed(() => this.baseMultiplier() * (this.overdriveActive() ? 2 : 1));
  /** Palier affiché par la barre et le badge : 0 bleu, 1 orange, 2 rouge. */
  readonly tier = computed(() => Math.min(2, this.baseMultiplier() - 1));
  /**
   * Barre de combo : un segment de 10 notes par palier à gagner (3 jusqu'à x4, 5 jusqu'à x6 à la basse).
   * Chaque valeur est le remplissage du segment, de 0 à 1.
   */
  readonly comboBarMax = computed(() => (this.maxMultiplier() - 1) * 10);
  readonly comboSegments = computed(() =>
    Array.from({ length: this.maxMultiplier() - 1 }, (_, i) => Math.min(1, Math.max(0, (this.combo() - i * 10) / 10))),
  );
  readonly comboMeter = computed(() => Math.min(this.combo(), this.comboBarMax()));

  /** Score d'une partie parfaite sur la partition en cours : référence des étoiles. */
  private readonly perfectScore = signal(0);
  /** Étoiles de 0 à 5 ; la partie décimale remplit l'étoile suivante pendant la partie. */
  readonly stars = computed(() => starProgress(this.score(), this.perfectScore()));
  readonly starFills = computed(() => [0, 1, 2, 3, 4].map((i) => Math.min(1, Math.max(0, this.stars() - i))));
  readonly starsLabel = computed(() => `${Math.floor(this.stars())} étoile(s) sur 5`);

  readonly save = signal<SaveState>({ status: 'idle' });
  /** Vues simples de l'état d'enregistrement pour le template. */
  readonly saved = computed(() => {
    const state = this.save();
    return state.status === 'saved' ? state : null;
  });
  readonly saveError = computed(() => {
    const state = this.save();
    return state.status === 'error' ? state.message : '';
  });
  /** Difficulté de la partie jouée : le joueur peut changer le choix pendant l'écran de résultats. */
  private playedDifficulty: Difficulty = 'medium';

  private audio?: AudioContext;
  private samples?: Float32Array;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private notes: GameNote[] = [];
  private laneCount = 4;
  private visibleMs = 1500;
  private startAt = 0;
  private frame = 0;
  private lastNow = 0;
  /** Touches actuellement enfoncées, par couloir : nécessaires pour les maintiens et les HOPO. */
  private readonly held = new Array<boolean>(LANE_KEYS.length).fill(false);
  /** Phrases Overdrive dont une note a été ratée : elles ne rempliront pas la jauge. */
  private readonly brokenPhrases = new Set<number>();

  constructor() {
    if (this.live) {
      // Réglages choisis dans le salon ; le flux du groupe donne les scores des autres en direct.
      this.difficulty.set(this.live.difficulty);
      this.instrument.set(this.live.instrument);
      this.bandStream = this.groups.live(this.live.groupId).subscribe({
        next: (state) => this.band.set(state),
        error: () => undefined, // la partie continue en solo si le flux tombe
      });
    }
    this.service.audio(this.trackId).subscribe({
      next: (blob) => void this.decode(blob),
      error: (error: unknown) => {
        this.phase.set('error');
        this.error.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'Morceau introuvable : il a peut-être été supprimé.'
            : httpErrorMessage(error, 'Morceau impossible à charger.'),
        );
      },
    });
  }

  private async decode(blob: Blob): Promise<void> {
    try {
      this.audio = new AudioContext();
      this.buffer = await this.audio.decodeAudioData(await blob.arrayBuffer());
      this.samples = toMono(this.buffer);
      this.phase.set('ready');
      // À plusieurs : départ automatique à l'heure commune.
      if (this.live) void this.start();
    } catch {
      this.phase.set('error');
      this.error.set('Le navigateur ne sait pas décoder ce fichier audio.');
    }
  }

  /** `leadInS` : secondes avant la première note (décompte affiché sur la piste). */
  async start(leadInS = LEAD_IN_S): Promise<void> {
    const audio = this.audio;
    if (!audio || !this.buffer || !this.samples) return;
    this.stopMusic();
    // L'audio n'est autorisé qu'après un geste de l'utilisateur. Au départ automatique d'une partie
    // à plusieurs, certains navigateurs laissent resume() en attente : on demande alors un clic.
    const resumed = audio.resume();
    if (this.live) await Promise.race([resumed, new Promise((done) => setTimeout(done, 1500))]);
    else await resumed;
    if (audio.state !== 'running') {
      this.audioBlocked.set(true);
      return;
    }
    this.audioBlocked.set(false);

    this.playedDifficulty = this.difficulty();
    this.playedInstrument.set(this.instrument());
    this.save.set({ status: 'idle' });
    const settings = DIFFICULTIES[this.playedDifficulty];
    this.laneCount = settings.lanes;
    this.visibleMs = settings.visibleMs / this.trackSpeed();
    this.notes = generateChart(this.samples, this.buffer.sampleRate, this.difficulty(), this.instrument()).map((n) => ({
      ...n,
      result: null,
      sustaining: false,
    }));
    this.perfectScore.set(maxScore(this.notes, this.maxMultiplier()));
    this.score.set(0);
    this.combo.set(0);
    this.maxCombo.set(0);
    this.counts.set({ perfect: 0, good: 0, miss: 0 });
    this.feedback.set(null);
    this.overdrive.set(0);
    this.overdriveActive.set(false);
    this.brokenPhrases.clear();
    this.held.fill(false);

    this.source = audio.createBufferSource();
    this.source.buffer = this.buffer;
    // source → analyseur → haut-parleurs : l'analyseur écoute la musique sans la modifier.
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    this.source.connect(analyser);
    analyser.connect(audio.destination);
    this.analyser.set(analyser);
    // À plusieurs, le délai est calculé ici, juste avant de programmer la musique : la génération
    // de la partition ci-dessus prend un temps différent sur chaque machine.
    if (this.live) leadInS = (this.live.startAt - Date.now()) / 1000;
    this.startAt = audio.currentTime + leadInS;
    // En retard sur l'heure commune : la musique part tout de suite, à la position des autres.
    this.source.start(Math.max(audio.currentTime, this.startAt), Math.max(0, -leadInS));
    this.source.onended = () => this.finish();

    this.lastNow = this.now();
    this.phase.set('playing');
    this.frame = requestAnimationFrame(() => this.loop());
  }

  stop(): void {
    // À plusieurs, arrêter = abandonner : on termine pour que le groupe ne nous attende pas.
    if (this.live) {
      this.stopMusic();
      this.finish();
      return;
    }
    this.stopMusic();
    this.phase.set('ready');
  }

  /** Temps du morceau en ms (négatif pendant le décompte), corrigé de la calibration. */
  private now(): number {
    return ((this.audio?.currentTime ?? 0) - this.startAt) * 1000 - this.offsetMs();
  }

  onKey(event: KeyboardEvent): void {
    if (this.phase() !== 'playing' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      this.stop();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault(); // pas de défilement de page ni de clic sur un bouton ayant le focus
      this.activateOverdrive();
      return;
    }
    const lane = this.laneOf(event.key);
    if (lane === -1) return;
    event.preventDefault();
    this.press(lane);
  }

  onKeyUp(event: KeyboardEvent): void {
    const lane = this.laneOf(event.key);
    if (lane !== -1) this.release(lane);
  }

  private laneOf(key: string): number {
    const lane = LANE_KEYS.findIndex((keys) => keys.includes(key.toLowerCase()));
    return lane < this.laneCount ? lane : -1;
  }

  /** Touche enfoncée (clavier ou bouton tactile) : on la mémorise puis on cherche une note à frapper. */
  press(lane: number): void {
    if (this.phase() !== 'playing') return;
    this.held[lane] = true;
    const now = this.now();
    // Frappe dans le vide : pas de pénalité, comme dans Guithar Hero.
    const note = findHittable(this.notes, lane, now);
    if (note) this.record(note, judge(now - note.timeMs));
  }

  release(lane: number): void {
    this.held[lane] = false;
  }

  activateOverdrive(): void {
    if (this.phase() === 'playing' && this.overdriveReady()) this.overdriveActive.set(true);
  }

  private record(note: GameNote, result: Judgement): void {
    note.result = result;
    this.counts.update((c) => ({ ...c, [result]: c[result] + 1 }));
    this.feedback.set({ text: result, at: performance.now() });
    if (result === 'miss') {
      this.combo.set(0);
      if (note.phrase >= 0) this.brokenPhrases.add(note.phrase);
      return;
    }
    this.score.update((s) => s + (result === 'perfect' ? PERFECT_POINTS * this.multiplier() : 50));
    this.combo.update((c) => c + 1);
    this.maxCombo.update((m) => Math.max(m, this.combo()));
    note.sustaining = note.durationMs > 0;
    // Dernière note d'une phrase dorée sans raté : un quart de jauge d'Overdrive.
    if (note.phrase >= 0 && !this.brokenPhrases.has(note.phrase) && this.notes.every((n) => n.phrase !== note.phrase || n.result)) {
      this.overdrive.update((o) => Math.min(1, o + OVERDRIVE_PER_PHRASE));
    }
  }

  private loop(): void {
    const now = this.now();
    const elapsedS = Math.max(0, now - this.lastNow) / 1000;
    this.lastNow = now;

    for (const note of this.notes) {
      if (note.result) {
        // Maintien : des points tant que la touche reste enfoncée, jusqu'à la fin de la traînée.
        if (note.sustaining) {
          const end = note.timeMs + note.durationMs;
          if (!this.held[note.lane] || now >= end) note.sustaining = false;
          else this.score.update((s) => s + elapsedS * SUSTAIN_POINTS_PER_S * this.multiplier());
        }
        continue;
      }
      // HOPO : la touche déjà tenue suffit, si la note précédente a été réussie (combo en cours).
      if (note.hopo && this.held[note.lane] && this.combo() > 0 && now >= note.timeMs && now - note.timeMs <= GOOD_WINDOW_MS) {
        this.record(note, judge(now - note.timeMs));
      } else if (now - note.timeMs > MISS_WINDOW_MS) {
        this.record(note, 'miss');
      }
    }

    if (this.overdriveActive()) {
      const left = this.overdrive() - elapsedS * OVERDRIVE_DRAIN_PER_S;
      this.overdrive.set(Math.max(0, left));
      if (left <= 0) this.overdriveActive.set(false);
    }

    this.reportLive(false);
    this.draw(now);
    this.frame = requestAnimationFrame(() => this.loop());
  }

  /** Projette un point de la piste : `lane` va de 0 (bord gauche) à laneCount (bord droit), `z` est la profondeur. */
  private project(lane: number, z: number): { x: number; y: number; s: number } {
    const s = 1 / (1 + PERSPECTIVE * z);
    return { x: CENTER_X + (lane / this.laneCount - 0.5) * ROAD_WIDTH * s, y: VANISH_Y + (HIT_Y - VANISH_Y) * s, s };
  }

  private draw(now: number): void {
    const canvas = this.canvas()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== WIDTH * ratio) {
      canvas.width = WIDTH * ratio;
      canvas.height = HEIGHT * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const lanes = this.laneCount;
    const near = -0.2; // un peu de piste sous la ligne de frappe, jusqu'au bas du canvas
    const overdrive = this.overdriveActive();
    const edgeColor = overdrive ? GOLD : '#b48cff';

    // Chaussée : trapèze sombre qui s'éclaircit vers le joueur et s'efface au loin (dorée pendant l'Overdrive).
    const [farLeft, farRight, nearRight, nearLeft] = [
      this.project(0, 1), this.project(lanes, 1), this.project(lanes, near), this.project(0, near),
    ];
    const road = ctx.createLinearGradient(0, farLeft.y, 0, HEIGHT);
    road.addColorStop(0, 'rgba(40, 18, 96, 0)');
    road.addColorStop(0.25, overdrive ? 'rgba(96, 64, 20, 0.85)' : 'rgba(40, 18, 96, 0.85)');
    road.addColorStop(1, overdrive ? 'rgba(170, 120, 30, 0.95)' : 'rgba(78, 40, 170, 0.95)');
    ctx.fillStyle = road;
    ctx.beginPath();
    ctx.moveTo(farLeft.x, farLeft.y);
    ctx.lineTo(farRight.x, farRight.y);
    ctx.lineTo(nearRight.x, nearRight.y);
    ctx.lineTo(nearLeft.x, nearLeft.y);
    ctx.closePath();
    ctx.fill();

    // Lignes de temps qui défilent vers le joueur.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    for (let t = Math.ceil(now / BEAT_MS) * BEAT_MS; t < now + this.visibleMs; t += BEAT_MS) {
      const z = (t - now) / this.visibleMs;
      const left = this.project(0, z);
      const right = this.project(lanes, z);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }

    // Séparations des couloirs, puis bords néon de la piste.
    for (let lane = 0; lane <= lanes; lane++) {
      const edge = lane === 0 || lane === lanes;
      const far = this.project(lane, 1);
      const close = this.project(lane, near);
      ctx.strokeStyle = edge ? edgeColor : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = edge ? 3 : 1.5;
      ctx.shadowColor = edgeColor;
      ctx.shadowBlur = edge ? 14 : 0;
      ctx.beginPath();
      ctx.moveTo(far.x, far.y);
      ctx.lineTo(close.x, close.y);
      ctx.stroke();
    }

    // Ligne de frappe : une capsule par couloir, pleine quand la touche est enfoncée.
    const laneWidth = ROAD_WIDTH / lanes;
    for (let lane = 0; lane < lanes; lane++) {
      const { x } = this.project(lane + 0.5, 0);
      const pressed = this.held[lane];
      ctx.shadowColor = LANE_COLORS[lane];
      ctx.shadowBlur = pressed ? 24 : 10;
      ctx.lineWidth = 3;
      ctx.strokeStyle = LANE_COLORS[lane];
      ctx.fillStyle = pressed ? LANE_COLORS[lane] : 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.roundRect(x - laneWidth * 0.39, HIT_Y - 9, laneWidth * 0.78, 18, 9);
      ctx.fill();
      ctx.stroke();
    }

    // Traînées des notes maintenues, sous les gemmes : de la tête (ou de la ligne de frappe) jusqu'à la fin.
    for (const note of this.notes) {
      if (note.durationMs === 0 || (note.result && !note.sustaining)) continue;
      const fromZ = Math.max(note.result ? 0 : near, (note.timeMs - now) / this.visibleMs);
      const toZ = Math.min(1, (note.timeMs + note.durationMs - now) / this.visibleMs);
      if (fromZ > 1) break;
      if (toZ <= fromZ) continue;
      const half = 0.12;
      const [a, b, c, d] = [
        this.project(note.lane + 0.5 - half, fromZ), this.project(note.lane + 0.5 + half, fromZ),
        this.project(note.lane + 0.5 + half, toZ), this.project(note.lane + 0.5 - half, toZ),
      ];
      ctx.globalAlpha = note.sustaining ? 0.95 : 0.55;
      ctx.shadowColor = LANE_COLORS[note.lane];
      ctx.shadowBlur = note.sustaining ? 18 : 0;
      ctx.fillStyle = note.phrase >= 0 ? GOLD : LANE_COLORS[note.lane];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Notes : des gemmes arrondies qui grossissent en approchant, avec un halo de leur couleur.
    // HOPO : gemme plus étroite cerclée de blanc. Phrase Overdrive : gemme dorée.
    for (const note of this.notes) {
      if (note.result) continue;
      const z = (note.timeMs - now) / this.visibleMs;
      if (z > 1) break; // notes triées : les suivantes sont encore plus loin
      const { x, y, s } = this.project(note.lane + 0.5, z);
      if (y > HEIGHT + 20) continue;
      const width = laneWidth * (note.hopo ? 0.48 : 0.7) * s;
      const height = 20 * s;
      const color = note.phrase >= 0 && !this.brokenPhrases.has(note.phrase) ? GOLD : LANE_COLORS[note.lane];
      const gem = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2);
      gem.addColorStop(0, '#ffffff');
      gem.addColorStop(0.35, color);
      gem.addColorStop(1, color);
      ctx.globalAlpha = Math.min(1, (1 - z) * 6); // apparition en fondu au bout de la piste
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * s;
      ctx.fillStyle = gem;
      ctx.beginPath();
      ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
      ctx.fill();
      if (note.hopo) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 * s;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (now < 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = "italic 120px 'Russo One', system-ui, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(-now / 1000)), CENTER_X, HEIGHT / 2);
    }
  }

  private finish(): void {
    if (this.phase() !== 'playing') return;
    cancelAnimationFrame(this.frame);
    this.phase.set('finished');
    this.reportLive(true);
    this.saveScore();
  }

  /** Envoie son score au groupe environ une fois par seconde, et toujours à la fin. */
  private reportLive(done: boolean): void {
    if (!this.live || (!done && performance.now() - this.lastReport < 1000)) return;
    this.lastReport = performance.now();
    this.groups
      .reportScore(this.live.groupId, { score: this.displayScore(), combo: this.combo(), done })
      .subscribe({ error: () => undefined }); // un envoi perdu sera remplacé par le suivant
  }

  /**
   * Envoie le résultat au serveur (entiers uniquement, comme l'exige l'API).
   * Public : le bouton « Réessayer » le rappelle si l'enregistrement a échoué.
   */
  saveScore(): void {
    if (this.save().status === 'saving') return;
    this.save.set({ status: 'saving' });
    this.scores
      .submit({
        trackId: this.trackId,
        difficulty: this.playedDifficulty,
        instrument: this.playedInstrument(),
        score: this.displayScore(),
        stars: Math.floor(this.stars()),
        accuracy: this.accuracy(),
        maxCombo: this.maxCombo(),
      })
      .subscribe({
        next: ({ best, record, coinsEarned, coins }) => {
          this.save.set({ status: 'saved', best, record, coinsEarned });
          // Le solde de la barre du haut suit sans recharger le profil.
          this.auth.currentUser.update((user) => user && { ...user, coins });
        },
        error: (error: unknown) =>
          this.save.set({ status: 'error', message: httpErrorMessage(error, 'Score non enregistré.') }),
      });
  }

  private stopMusic(): void {
    cancelAnimationFrame(this.frame);
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source = undefined;
    }
  }

  ngOnDestroy(): void {
    this.bandStream?.unsubscribe();
    this.stopMusic();
    void this.audio?.close();
  }
}
