import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
import { LivePageComponent } from './live-page';
import { GroupService } from '../../shared/services/group.service';
import { AuthService } from '../../shared/services/auth.service';
import { LivePlayer, LiveState } from '../../shared/models/group.model';

const avatar = { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 };
const player = (id: string, extra: Partial<LivePlayer> = {}): LivePlayer => ({
  id, name: id === 'me' ? 'Léa' : 'Bob', avatar, instrument: 'lead', difficulty: 'medium', ready: false,
  score: 0, combo: 0, done: false, connected: true, ...extra,
});
const state = (extra: Partial<LiveState> = {}): LiveState => ({
  state: 'lobby', hostId: 'me', track: null, startAt: null, serverNow: Date.now(), canStart: false, bandScore: 0,
  players: [player('me'), player('bob')], ...extra,
});

describe('LivePageComponent', () => {
  let fixture: ComponentFixture<LivePageComponent>;
  let component: LivePageComponent;
  let stream: Subject<LiveState>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    stream = new Subject<LiveState>();
    service = {
      live: vi.fn(() => stream),
      tracks: vi.fn(() => of([{ id: 't1', title: 'Blues', ownerName: 'Bob' }])),
      setPlayer: vi.fn(() => of(undefined)),
      chooseTrack: vi.fn(() => of(undefined)),
      start: vi.fn(() => of(undefined)),
      reset: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [LivePageComponent],
      providers: [
        provideRouter([]),
        { provide: GroupService, useValue: service },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'me' }), profile: vi.fn(() => of(null)) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'g1' }) } } },
      ],
    });
    fixture = TestBed.createComponent(LivePageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('affiche les joueurs du flux et le rôle d’hôte', async () => {
    stream.next(state());
    await fixture.whenStable();

    expect(service['live']).toHaveBeenCalledWith('g1');
    expect(host().querySelectorAll('.players li')).toHaveLength(2);
    expect(component.isHost()).toBe(true);
    expect(host().textContent).toContain('Hôte');
  });

  it('envoie mes réglages en gardant les autres valeurs', async () => {
    stream.next(state());
    await fixture.whenStable();

    component.setMine({ instrument: 'drums' });
    expect(service['setPlayer']).toHaveBeenCalledWith('g1', { instrument: 'drums', difficulty: 'medium', ready: false });
  });

  it('n’active « Lancer » que lorsque le serveur l’autorise', async () => {
    stream.next(state());
    await fixture.whenStable();
    const launch = () => [...host().querySelectorAll('button')].find((b) => b.textContent?.includes('Lancer'))!;
    expect(launch().disabled).toBe(true);

    stream.next(state({ canStart: true, track: { id: 't1', title: 'Blues' } }));
    await fixture.whenStable();
    launch().click();
    expect(service['start']).toHaveBeenCalledWith('g1');
  });

  it('part jouer au lancement avec l’heure de départ convertie dans l’horloge locale', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    // Horloge du serveur en avance de 2 s sur celle du navigateur.
    const serverNow = Date.now() + 2000;
    stream.next(state({
      state: 'playing', track: { id: 't1', title: 'Blues' }, serverNow, startAt: serverNow + 10_000,
      players: [player('me', { instrument: 'bass', difficulty: 'hard', ready: true })],
    }));

    const [commands, extras] = navigate.mock.calls[0];
    expect(commands).toEqual(['/game', 't1']);
    const live = (extras as { state: { live: { startAt: number; instrument: string } } }).state.live;
    expect(live.instrument).toBe('bass');
    expect(Math.abs(live.startAt - (Date.now() + 10_000))).toBeLessThan(100);
  });
});
