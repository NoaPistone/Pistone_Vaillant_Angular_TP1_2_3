import { TestBed } from '@angular/core/testing';
import { StageShaderComponent } from './stage-shader';
import { bassLevel, fragmentSource } from '../../shared/utils/stage-shaders';

describe('bassLevel', () => {
  it('mesure l’énergie entre 40 et 160 Hz seulement', () => {
    const bins = new Uint8Array(512); // fftSize 1024 à 44,1 kHz : ≈ 43 Hz par case
    expect(bassLevel(bins, 44100)).toBe(0);

    bins[2] = 255; // ≈ 86 Hz : une basse
    bins[3] = 255; // ≈ 129 Hz
    expect(bassLevel(bins, 44100)).toBeCloseTo(2 / 3);

    bins.fill(0);
    bins[100] = 255; // ≈ 4,3 kHz : une cymbale ne compte pas
    expect(bassLevel(bins, 44100)).toBe(0);
  });
});

describe('fragmentSource', () => {
  it('assemble l’en-tête commun et le corps de chaque fond', () => {
    for (const shader of ['caustics', 'aurora', 'lasers', 'sparks', 'flux', 'dots', 'ascii'] as const) {
      const source = fragmentSource(shader);
      expect(source).toContain('uniform float bass;');
      expect(source).toContain('void main()');
      expect(source).toContain('finish(col)'); // l'effet du raté s'applique à tous les fonds
    }
  });
});

describe('StageShaderComponent', () => {
  it('demande un contexte WebGL et reste inerte sans lui, sans erreur', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fixture = TestBed.createComponent(StageShaderComponent);
    fixture.componentRef.setInput('shader', 'lasers');
    await fixture.whenStable();

    expect(getContext).toHaveBeenCalledWith('webgl');
    expect(fixture.nativeElement.querySelector('canvas').getAttribute('aria-hidden')).toBe('true');
    fixture.destroy();
    vi.restoreAllMocks();
  });
});
