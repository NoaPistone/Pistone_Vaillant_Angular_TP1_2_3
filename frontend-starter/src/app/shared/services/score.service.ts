import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GameResult, LeaderboardEntry, ScoreRecord, ScoreSubmission } from '../models/score.model';
import { Difficulty } from '../utils/beatmap';

/** Scores en ligne : enregistrement des parties, records personnels et classement général. */
@Injectable({ providedIn: 'root' })
export class ScoreService {
  private readonly http = inject(HttpClient);

  /** `201` si nouveau record, `200` sinon ; dans les deux cas le record en vigueur est renvoyé. */
  submit(result: GameResult) {
    return this.http.post<ScoreSubmission>('/api/scores', result);
  }

  mine() {
    return this.http.get<ScoreRecord[]>('/api/scores/me');
  }

  /** Sans difficulté : classement toutes difficultés confondues. */
  leaderboard(difficulty?: Difficulty) {
    return this.http.get<LeaderboardEntry[]>('/api/scores/leaderboard', {
      params: difficulty ? { difficulty } : {},
    });
  }
}
