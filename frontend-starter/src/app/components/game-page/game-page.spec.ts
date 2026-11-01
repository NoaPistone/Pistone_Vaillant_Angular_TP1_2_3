import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GamePageComponent } from './game-page';
import { TrackService } from '../../shared/services/track.service';
import { ScoreService } from '../../shared/services/score.service';
import { AuthService } from '../../shared/services/auth.service';
import { GroupService } from '../../shared/services/group.service';
import { Subject } from 'rxjs';
import { LiveState } from '../../shared/models/group.model';
import { signal } from '@angular/core';
import { Background, User } from '../../shared/models/user.model';
import { GameNote } from '../../shared/utils/beatmap';

const RATE = 44100;
const lava: Background = { id: 'lava', name: 'Coulée de lave', shader: 'lasers', stage: '#5c1408', deep: '#190402', spotA: '#ff3b2f', spotB: '#ff9a3d', price: 800 };

/** Morceau synthétique de 3 s : un seul coup sec à 1 s, donc une seule note attendue. */
function samplesWithClickAt1s(): Float32Array {
  const samples = new Float32Array(RATE * 3);
  for (let i = RATE; i < RATE * 1.03; i++) samples[i] = i % 2 ? 0.8 : -0.8;
  return samples;
}

/** Double d'AudioContext : l'horloge `currentTime` est pilotée par le test. */
class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  destination = {};
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  decodeAudioData = vi.fn(async () => ({
    sampleRate: RATE,
    numberOfChannels: 1,
    length: RATE * 3,
    getChannelData: () => samplesWithClickAt1s(),
  }));
  createBufferSource = vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null }));
  createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
}

describe('GamePageComponent', () => {
  let fixture: ComponentFixture<GamePageComponent>;
  let component: GamePageComponent;
  let audio: FakeAudioContext;
  let service: { audio: ReturnType<typeof vi.fn> };
  let scores: { submit: ReturnType<typeof vi.fn> };
  let auth: { currentUser: ReturnType<typeof signal<User | null>> };
  let groups: { live: ReturnType<typeof vi.fn>; reportScore: ReturnType<typeof vi.fn> };

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [GamePageComponent],
      providers: [
        provideRouter([]),
        { provide: TrackService, useValue: service },
        { provide: ScoreService, useValue: scores },
        { provide: AuthService, useValue: auth },
        { provide: GroupService, useValue: groups },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'track-1' }) } } },
      ],
    });
    fixture = TestBed.createComponent(GamePageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve)); // laisse finir le décodage asynchrone
  }

  beforeEach(() => {
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super();
        audio = this;
      }
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    service = { audio: vi.fn(() => of(new Blob(['x'], { type: 'audio/mpeg' }))) };
    scores = { submit: vi.fn() };
    auth = { currentUser: signal<User | null>(null) };
    groups = { live: vi.fn(() => new Subject()), reportScore: vi.fn(() => of(undefined)) };
  });

  afterEach(() => vi.unstubAllGlobals());

  it('télécharge le morceau de la route, le décode et propose les difficultés', async () => {
    await create();
    await fixture.whenStable();

    expect(service.audio).toHaveBeenCalledWith('track-1');
    expect(component.phase()).toBe('ready');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Difficile');
  });

  it('affiche une erreur claire si le morceau n’existe plus (404)', async () => {
    service.audio.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    await create();
    await fixture.whenStable();

    expect(component.phase()).toBe('error');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Morceau introuvable');
  });

  it('compte un Perfect quand la touche est frappée au moment de la note', async () => {
    await create();
    await component.start(); // décompte de 3 s : la musique commence à currentTime = 3

    audio.currentTime = 3 + 1.005; // 5 ms après la note placée à ~1 s du morceau
    component.onKey(new KeyboardEvent('keydown', { key: 'a' }));

    expect(component.counts().perfect).toBe(1);
    expect(component.score()).toBe(100);
    expect(component.combo()).toBe(1);
  });

  it('ignore une frappe dans un couloir vide, sans pénalité', async () => {
    await create();
    await component.start();

    audio.currentTime = 3 + 1;
    component.onKey(new KeyboardEvent('keydown', { key: 'r' }));

    expect(component.judged()).toBe(0);
  });

  it('arrête la musique et ferme l’AudioContext en quittant la page', async () => {
    await create();
    await component.start();

    fixture.destroy();

    expect(audio.close).toHaveBeenCalled();
  });

  it('remplit la barre de combo par paliers de 10 et affiche le multiplicateur', async () => {
    await create();
    await component.start();

    component.combo.set(14);
    await fixture.whenStable();

    expect(component.comboSegments()).toEqual([1, 0.4, 0]);
    expect(component.tier()).toBe(1);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.multiplier')?.textContent).toBe('x2');
    expect(host.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('14');

    component.combo.set(45);
    expect(component.comboSegments()).toEqual([1, 1, 1]);
    expect(component.tier()).toBe(2);
    expect(component.multiplier()).toBe(4); // plafond, comme dans Festival
  });

  it('remplit les étoiles selon la part du score maximal de la partition', async () => {
    await create();
    await component.start(); // partition d'une seule note : score maximal 100

    expect(component.stars()).toBe(0);
    component.score.set(50); // 50 % → entre la 3e (45 %) et la 4e étoile (65 %)
    await fixture.whenStable();

    expect(component.starFills().slice(0, 4)).toEqual([1, 1, 1, expect.closeTo(0.25)]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.stars')?.getAttribute('aria-label')).toBe('3 étoile(s) sur 5');
  });

  describe('mécaniques avancées', () => {
    /** Note de test : par défaut simple, couloir 0, sans phrase. */
    const note = (timeMs: number, extra: Partial<GameNote> = {}): GameNote => ({
      timeMs, lane: 0, durationMs: 0, hopo: false, phrase: -1, result: null, sustaining: false, ...extra,
    });
    /** Place l'horloge audio à `ms` millisecondes du morceau (après le décompte de 3 s). */
    const at = (ms: number) => (audio.currentTime = 3 + ms / 1000);
    const key = (type: 'keydown' | 'keyup', k: string) =>
      type === 'keydown' ? component.onKey(new KeyboardEvent(type, { key: k })) : component.onKeyUp(new KeyboardEvent(type, { key: k }));
    const tick = () => (component as unknown as { loop(): void }).loop();

    async function play(notes: GameNote[]): Promise<void> {
      await create();
      await component.start();
      (component as unknown as { notes: GameNote[] }).notes = notes;
    }

    it('note maintenue : des points en continu tant que la touche est tenue', async () => {
      await play([note(1000, { durationMs: 1000 })]);
      at(1000);
      tick();
      key('keydown', 'a');
      expect(component.score()).toBe(100);

      at(1500);
      tick(); // 0,5 s tenue à 50 points/s
      expect(component.score()).toBeCloseTo(125);

      key('keyup', 'a');
      at(1800);
      tick(); // touche relâchée : plus de points
      expect(component.score()).toBeCloseTo(125);
    });

    it('HOPO : la touche déjà tenue suffit si la note précédente est réussie', async () => {
      await play([note(1000), note(1150, { lane: 1, hopo: true })]);
      at(850);
      key('keydown', 'z'); // trop tôt pour être une frappe : simple appui maintenu, sans pénalité
      at(1000);
      key('keydown', 'a');
      at(1150);
      tick();

      expect(component.counts().perfect).toBe(2);
      expect(component.combo()).toBe(2);
    });

    it('HOPO : sans note précédente réussie, il faut frapper la touche', async () => {
      await play([note(1150, { lane: 1, hopo: true })]);
      at(850);
      key('keydown', 'z');
      at(1150);
      tick();

      expect(component.judged()).toBe(0);
    });

    it('Overdrive : une phrase dorée réussie remplit un quart de jauge', async () => {
      await play([note(1000, { phrase: 0 }), note(1500, { lane: 1, phrase: 0 })]);
      at(1000);
      key('keydown', 'a');
      expect(component.overdrive()).toBe(0); // phrase pas encore terminée
      at(1500);
      key('keydown', 'z');

      expect(component.overdrive()).toBe(0.25);
    });

    it('Overdrive : une phrase avec un raté ne remplit rien', async () => {
      await play([note(1000, { phrase: 0 }), note(1500, { lane: 1, phrase: 0 })]);
      at(1200);
      tick(); // la première note est ratée
      at(1500);
      key('keydown', 'z');

      expect(component.overdrive()).toBe(0);
    });

    it('Overdrive : Espace l’active dès la moitié, double le multiplicateur puis se vide', async () => {
      await play([note(5000)]);
      at(0);
      tick();
      component.overdrive.set(0.25);
      key('keydown', ' ');
      expect(component.overdriveActive()).toBe(false); // moins de la moitié : refusé

      component.overdrive.set(0.5);
      key('keydown', ' ');
      expect(component.overdriveActive()).toBe(true);
      expect(component.multiplier()).toBe(2);

      at(4000);
      tick(); // 4 s à 1/16 par seconde : il reste 0,25
      expect(component.overdrive()).toBeCloseTo(0.25);
      at(8100);
      tick();
      expect(component.overdriveActive()).toBe(false);
      expect(component.multiplier()).toBe(1);
    });

    it('passe à 5 couloirs en Expert : la touche T devient jouable', async () => {
      await create();
      component.difficulty.set('expert');
      expect(component.lanes().map((l) => l.key)).toEqual(['A', 'Z', 'E', 'R', 'T']);
      await component.start();
      (component as unknown as { notes: GameNote[] }).notes = [note(1000, { lane: 4 })];

      at(1000);
      key('keydown', 't');
      expect(component.counts().perfect).toBe(1);
    });
  });

  describe('enregistrement du score', () => {
    const record = { id: 's1', trackId: 'track-1', difficulty: 'hard' as const, instrument: 'lead' as const, score: 250, stars: 3, accuracy: 100, maxCombo: 1, updatedAt: '' };
    /** Fin du morceau : le navigateur appelle `onended` sur la source audio. */
    const endSong = () => audio.createBufferSource.mock.results.at(-1)!.value.onended();

    it('envoie un résultat entier à la fin du morceau et annonce un nouveau record', async () => {
      scores.submit.mockReturnValue(of({ best: true, record, coinsEarned: 32, coins: 532 }));
      await create();
      component.difficulty.set('hard');
      await component.start();
      component.score.set(250.6); // les maintiens donnent des points décimaux
      component.maxCombo.set(1);

      endSong();
      await fixture.whenStable();

      expect(scores.submit).toHaveBeenCalledWith({
        trackId: 'track-1', difficulty: 'hard', instrument: 'lead', score: 251, stars: expect.any(Number), accuracy: 100, maxCombo: 1,
      });
      expect(Number.isInteger(scores.submit.mock.calls[0][0].stars)).toBe(true);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nouveau record !');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('+32 points pour la boutique');
    });

    it('met à jour le solde de la barre du haut avec la réponse du serveur', async () => {
      scores.submit.mockReturnValue(of({ best: true, record, coinsEarned: 32, coins: 532 }));
      auth.currentUser.set({ id: 'u1', name: 'Léa', email: 'l@x.fr', tag: 'LEA2', createdAt: '', coins: 500, avatars: ['rocker'],
        avatar: { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 }, backgrounds: ['stage'], background: lava });
      await create();
      await component.start();

      endSong();

      expect(auth.currentUser()?.coins).toBe(532);
    });

    it('affiche derrière la piste le fond de scène choisi dans la boutique', async () => {
      auth.currentUser.set({ id: 'u1', name: 'Léa', email: '', tag: 'LEA2', createdAt: '', coins: 0, avatars: [], backgrounds: ['lava'],
        avatar: { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 }, background: lava });
      await create();

      const scene = (fixture.nativeElement as HTMLElement).querySelector('.game') as HTMLElement;
      expect(scene.classList).toContain('stage-backdrop');
      expect(scene.style.getPropertyValue('--stage')).toBe('#5c1408');
      expect(scene.style.getPropertyValue('--spot-a')).toBe('#ff3b2f');
      // Fond animé : le shader est posé dans la scène (il reste inerte sous jsdom, sans WebGL).
      expect(scene.querySelector('app-stage-shader')).not.toBeNull();
    });

    it('affiche le record à battre quand la partie ne le bat pas', async () => {
      scores.submit.mockReturnValue(of({ best: false, record: { ...record, score: 9000 }, coinsEarned: 5, coins: 505 }));
      await create();
      await component.start();

      endSong();
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Record à battre : 9000');
    });

    it('propose de réessayer si l’enregistrement échoue', async () => {
      scores.submit.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      scores.submit.mockReturnValueOnce(of({ best: true, record, coinsEarned: 32, coins: 532 }));
      await create();
      await component.start();

      endSong();
      await fixture.whenStable();
      const retry = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Réessayer'),
      )!;
      expect(component.saveError()).not.toBe('');

      retry.click();
      await fixture.whenStable();
      expect(scores.submit).toHaveBeenCalledTimes(2);
      expect(component.saved()?.best).toBe(true);
    });
  });

  describe('instruments', () => {
    it('basse : multiplicateur jusqu’à x6 et barre de combo en 5 segments', async () => {
      await create();
      component.instrument.set('bass');
      await component.start();

      component.combo.set(55);
      await fixture.whenStable();

      expect(component.multiplier()).toBe(6);
      expect(component.comboSegments()).toHaveLength(5);
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.segment')).toHaveLength(5);
    });

    it('enregistre le score avec l’instrument joué', async () => {
      scores.submit.mockReturnValue(of({ best: true, record: { id: 's', trackId: 'track-1', difficulty: 'medium', instrument: 'drums',
        score: 0, stars: 0, accuracy: 100, maxCombo: 0, updatedAt: '' }, coinsEarned: 0, coins: 0 }));
      await create();
      component.instrument.set('drums');
      await component.start();
      component.instrument.set('vocals'); // changer le choix après coup ne change pas la partie jouée

      audio.createBufferSource.mock.results.at(-1)!.value.onended();

      expect(scores.submit.mock.calls[0][0].instrument).toBe('drums');
    });
  });

  describe('partie à plusieurs', () => {
    const launch = { groupId: 'g1', instrument: 'bass' as const, difficulty: 'hard' as const };
    afterEach(() => history.replaceState(null, ''));

    it('reprend les réglages du salon et démarre seul à l’heure commune', async () => {
      history.replaceState({ title: 'Blues', live: { ...launch, startAt: Date.now() + 5000 } }, '');
      await create();

      expect(component.instrument()).toBe('bass');
      expect(component.difficulty()).toBe('hard');
      expect(component.phase()).toBe('playing'); // aucun clic sur « Jouer »
      const [when] = audio.createBufferSource.mock.results[0].value.start.mock.calls[0];
      expect(when).toBeGreaterThan(4); // ≈ 5 s de décompte jusqu'au départ commun
      expect(when).toBeLessThanOrEqual(5);
    });

    it('son bloqué par le navigateur : un clic sur « Rejoindre la partie » lance la musique', async () => {
      vi.stubGlobal('AudioContext', class extends FakeAudioContext {
        constructor() {
          super();
          this.state = 'suspended';
          this.resume = vi.fn(() => new Promise<undefined>(() => undefined)); // Safari : attend un geste
          audio = this;
        }
      });
      history.replaceState({ title: 'Blues', live: { ...launch, startAt: Date.now() + 1000 } }, '');
      await create();
      await new Promise((resolve) => setTimeout(resolve, 1700));
      fixture.detectChanges();
      expect(component.audioBlocked()).toBe(true);
      expect(component.phase()).toBe('ready');
      const join = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Rejoindre la partie'));
      expect(join).toBeDefined();

      audio.state = 'running'; // le clic autorise le son
      audio.resume = vi.fn(async () => undefined);
      await component.start();
      expect(component.audioBlocked()).toBe(false);
      expect(component.phase()).toBe('playing');
    });

    it('en retard sur l’heure commune : la musique part tout de suite, à la position des autres', async () => {
      history.replaceState({ title: 'Blues', live: { ...launch, startAt: Date.now() - 2000 } }, '');
      await create();

      const [when, offset] = audio.createBufferSource.mock.results[0].value.start.mock.calls[0];
      expect(when).toBe(audio.currentTime);
      expect(offset).toBeGreaterThanOrEqual(2);
      expect(offset).toBeLessThan(3);
    });

    it('affiche les scores du groupe en direct et prévient le groupe à la fin', async () => {
      const stream = new Subject<LiveState>();
      groups.live.mockReturnValue(stream);
      scores.submit.mockReturnValue(of({ best: false, record: {}, coinsEarned: 0, coins: 0 }));
      history.replaceState({ title: 'Blues', live: { ...launch, startAt: Date.now() + 1000 } }, '');
      await create();

      stream.next({
        state: 'playing', hostId: 'u1', track: null, startAt: 0, serverNow: 0, canStart: false, bandScore: 3000,
        players: [
          { id: 'u2', name: 'Bob', avatar: { id: 'fox', name: 'Renard', emoji: '🦊', color: '#f90', price: 0 }, instrument: 'lead',
            difficulty: 'easy', ready: true, score: 3000, combo: 4, done: false, connected: true },
        ],
      });
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.band-live')?.textContent).toContain('Bob');

      audio.createBufferSource.mock.results.at(-1)!.value.onended();
      expect(groups.reportScore).toHaveBeenLastCalledWith('g1', expect.objectContaining({ done: true }));
    });

    it('Arrêter abandonne la partie au lieu de revenir aux réglages', async () => {
      scores.submit.mockReturnValue(of({ best: false, record: {}, coinsEarned: 0, coins: 0 }));
      history.replaceState({ title: 'Blues', live: { ...launch, startAt: Date.now() + 1000 } }, '');
      await create();

      component.stop();

      expect(component.phase()).toBe('finished');
      expect(groups.reportScore).toHaveBeenLastCalledWith('g1', expect.objectContaining({ done: true }));
    });
  });
});
