import { Component, inject, OnDestroy, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { LeaderboardEntry } from '../../shared/models/score.model';
import { ScoreService } from '../../shared/services/score.service';
import { Difficulty, DIFFICULTIES } from '../../shared/utils/beatmap';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';

/**
 * Classement général : chaque joueur cumule ses meilleurs scores (un par morceau et difficulté).
 * Le filtre recharge le classement côté serveur, qui fait le calcul (agrégation MongoDB).
 */
@Component({
  imports: [DecimalPipe, AvatarBadgeComponent],
  templateUrl: './leaderboard-page.html',
  styleUrl: './leaderboard-page.css',
})
export class LeaderboardPageComponent implements OnDestroy {
  private readonly service = inject(ScoreService);
  private subscription?: Subscription;

  /** `null` = toutes difficultés confondues. */
  readonly filters: { value: Difficulty | null; label: string }[] = [
    { value: null, label: 'Toutes' },
    ...(Object.keys(DIFFICULTIES) as Difficulty[]).map((value) => ({ value, label: DIFFICULTIES[value].label })),
  ];
  readonly difficulty = signal<Difficulty | null>(null);
  readonly entries = signal<LeaderboardEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  select(difficulty: Difficulty | null): void {
    this.difficulty.set(difficulty);
    this.load();
  }

  /** Changement rapide de filtre : seule la dernière réponse est affichée. */
  load(): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.subscription = this.service.leaderboard(this.difficulty() ?? undefined).subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Classement impossible à charger'));
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
