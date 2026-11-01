import { afterNextRender, Component, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { Judgement } from '../../shared/utils/beatmap';
import { bassLevel, fragmentSource, StageShader, VERTEX_SOURCE } from '../../shared/utils/stage-shaders';

/** Rapproche `value` de `target` d'une fraction de l'écart, image après image (lissage). */
const approach = (value: number, target: number, rate: number) => value + (target - value) * rate;

/**
 * Fond de scène animé (shader WebGL), posé derrière le contenu de son parent.
 * Composant de présentation : il reçoit le shader et l'état utile du jeu (analyseur audio,
 * combo, dernière frappe). Sans analyseur (aperçu de la boutique), il simule une pulsation.
 * Sans WebGL, rien n'est dessiné : le dégradé CSS du parent reste visible.
 */
@Component({
  selector: 'app-stage-shader',
  templateUrl: './stage-shader.html',
  styleUrl: './stage-shader.css',
})
export class StageShaderComponent implements OnDestroy {
  readonly shader = input.required<StageShader>();
  readonly analyser = input<AnalyserNode | null>(null);
  /** Combo de 0 (aucun) à 1 (plein) : le fond s'intensifie. */
  readonly combo = input(0);
  /** Dernière frappe jugée ; `at` change à chaque frappe. Un raté ternit brièvement le fond. */
  readonly judgement = input<{ text: Judgement; at: number } | null>(null);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private gl: WebGLRenderingContext | null = null;
  private frame = 0;

  constructor() {
    // Le canvas n'existe dans le DOM qu'après le premier rendu.
    afterNextRender(() => this.init());
  }

  private init(): void {
    const canvas = this.canvas().nativeElement;
    const gl = (this.gl = canvas.getContext('webgl'));
    if (!gl) return;

    const program = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX_SOURCE],
      [gl.FRAGMENT_SHADER, fragmentSource(this.shader())],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error('[fond de scène]', gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    gl.useProgram(program);

    // Deux triangles (TRIANGLE_STRIP) couvrent toute la surface, de -1 à 1.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const [resolution, time, bass, combo, miss] = ['resolution', 'time', 'bass', 'combo', 'miss'].map((name) =>
      gl.getUniformLocation(program, name),
    );

    // Mouvement réduit demandé par le système : image fixe.
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let bins = new Uint8Array(0);
    let bassValue = 0;
    let comboValue = 0;
    let missValue = 0;
    let lastJudgement = 0;

    const draw = (now: number) => {
      const seconds = still ? 3 : now / 1000;
      const analyser = this.analyser();
      let level: number;
      if (analyser) {
        if (bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(bins);
        level = bassLevel(bins, analyser.context.sampleRate);
      } else {
        // Aperçu sans musique : une pulsation régulière (≈ 120 battements par minute) montre la réaction.
        level = still ? 0.3 : 0.25 + 0.35 * Math.max(0, Math.sin(seconds * Math.PI * 2));
      }
      // Les basses frappent vite et retombent doucement ; combo et raté sont lissés.
      bassValue = Math.max(level, bassValue * 0.9);
      comboValue = approach(comboValue, this.combo(), 0.05);
      const judgement = this.judgement();
      if (judgement && judgement.at !== lastJudgement) {
        lastJudgement = judgement.at;
        if (judgement.text === 'miss') missValue = 1;
      }
      missValue *= 0.93;

      // ponytail: plein écran rendu à demi-résolution (le fond est flou par nature) ; pleine
      // résolution pour les petits aperçus. Passer à devicePixelRatio si un écran le réclame.
      const scale = canvas.clientWidth > 600 ? 0.5 : 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(resolution, width, height);
      gl.uniform1f(time, seconds);
      gl.uniform1f(bass, bassValue);
      gl.uniform1f(combo, comboValue);
      gl.uniform1f(miss, missValue);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.frame = requestAnimationFrame(draw);
    };
    this.frame = requestAnimationFrame(draw);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    // Les navigateurs limitent le nombre de contextes WebGL : on libère celui-ci tout de suite.
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
