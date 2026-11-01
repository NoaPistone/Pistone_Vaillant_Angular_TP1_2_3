import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { GroupTrack, LiveLaunch, LiveState } from '../../shared/models/group.model';
import { AuthService } from '../../shared/services/auth.service';
import { GroupService } from '../../shared/services/group.service';
import { Difficulty, DIFFICULTIES, Instrument, INSTRUMENTS } from '../../shared/utils/beatmap';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';

/**
 * Salon d'un groupe : chacun choisit son instrument et sa difficulté, se déclare prêt,
 * l'hôte choisit le morceau et lance. Au lancement, tout le monde part vers la page de jeu
 * avec une heure de départ commune (corrigée du décalage d'horloge avec le serveur).
 */
@Component({
  imports: [DecimalPipe, RouterLink, AvatarBadgeComponent],
  templateUrl: './live-page.html',
  styleUrl: './live-page.css',
})
export class LivePageComponent implements OnDestroy {
  private readonly service = inject(GroupService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  readonly groupId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private stream?: Subscription;

  readonly instruments = (Object.keys(INSTRUMENTS) as Instrument[]).map((value) => ({ value, label: INSTRUMENTS[value].label }));
  readonly difficulties = (Object.keys(DIFFICULTIES) as Difficulty[]).map((value) => ({ value, label: DIFFICULTIES[value].label }));

  /** Libellés lisibles pour la liste des joueurs (« Basse », « Difficile »). */
  readonly instrumentLabel = Object.fromEntries(this.instruments.map((i) => [i.value, i.label])) as Record<Instrument, string>;
  readonly difficultyLabel = Object.fromEntries(this.difficulties.map((d) => [d.value, d.label])) as Record<Difficulty, string>;

  readonly live = signal<LiveState | null>(null);
  readonly connection = signal<'connecting' | 'open' | 'lost'>('connecting');
  readonly tracks = signal<GroupTrack[]>([]);
  readonly sending = signal(false);

  readonly myId = computed(() => this.auth.currentUser()?.id ?? null);
  readonly me = computed(() => this.live()?.players.find((p) => p.id === this.myId()) ?? null);
  readonly isHost = computed(() => this.live()?.hostId === this.myId());

  constructor() {
    if (!this.auth.currentUser()) this.auth.profile().subscribe({ error: () => undefined });
    this.connect();
    this.service.tracks(this.groupId).subscribe({ next: (tracks) => this.tracks.set(tracks), error: () => undefined });
  }

  connect(): void {
    this.stream?.unsubscribe();
    this.connection.set('connecting');
    this.stream = this.service.live(this.groupId).subscribe({
      next: (state) => {
        this.connection.set('open');
        this.live.set(state);
        this.launchIfStarted(state);
      },
      error: (error: unknown) => {
        this.connection.set('lost');
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.snackBar.open('Groupe introuvable ou vous n’en faites plus partie.', 'Fermer', { duration: 5000 });
          void this.router.navigateByUrl('/groups');
        }
      },
      complete: () => this.connection.set('lost'),
    });
  }

  /** La partie est lancée : direction la page de jeu, avec le départ dans l'horloge locale. */
  private launchIfStarted(state: LiveState): void {
    const me = state.players.find((p) => p.id === this.myId());
    if (state.state !== 'playing' || !state.track || !state.startAt || !me || me.done) return;
    const offset = state.serverNow - Date.now(); // ponytail: ignore la latence réseau (≈ quelques dizaines de ms)
    const live: LiveLaunch = { groupId: this.groupId, startAt: state.startAt - offset, instrument: me.instrument, difficulty: me.difficulty };
    void this.router.navigate(['/game', state.track.id], { state: { title: state.track.title, live } });
  }

  setMine(change: Partial<{ instrument: Instrument; difficulty: Difficulty; ready: boolean }>): void {
    const me = this.me();
    if (!me) return;
    this.send(this.service.setPlayer(this.groupId, { instrument: me.instrument, difficulty: me.difficulty, ready: me.ready, ...change }));
  }

  chooseTrack(trackId: string): void {
    if (trackId) this.send(this.service.chooseTrack(this.groupId, trackId));
  }

  start(): void {
    this.send(this.service.start(this.groupId));
  }

  reset(): void {
    this.send(this.service.reset(this.groupId));
  }

  /** Les actions ne renvoient rien : le nouvel état arrive par le flux. */
  private send(request: ReturnType<GroupService['start']>): void {
    if (this.sending()) return;
    this.sending.set(true);
    request.subscribe({
      next: () => this.sending.set(false),
      error: (error: unknown) => {
        this.sending.set(false);
        this.snackBar.open(httpErrorMessage(error, 'Action impossible'), 'Fermer', { duration: 5000 });
      },
    });
  }

  ngOnDestroy(): void {
    this.stream?.unsubscribe(); // ferme le flux : le serveur sait qu'on a quitté le salon
  }
}
