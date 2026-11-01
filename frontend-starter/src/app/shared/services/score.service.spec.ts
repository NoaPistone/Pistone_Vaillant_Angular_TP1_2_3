import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ScoreService } from './score.service';
import { GameResult } from '../models/score.model';

describe('ScoreService', () => {
  let service: ScoreService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ScoreService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envoie le résultat de la partie avec POST /api/scores', () => {
    const result: GameResult = { trackId: 't1', difficulty: 'hard', instrument: 'bass', score: 1200, stars: 3, accuracy: 88, maxCombo: 40 };
    let best: boolean | undefined;
    service.submit(result).subscribe((response) => (best = response.best));

    const request = http.expectOne('/api/scores');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(result);
    request.flush({ best: true, record: { ...result, id: 's1', updatedAt: '2026-10-08' } }, { status: 201, statusText: 'Created' });
    expect(best).toBe(true);
  });

  it('lit les records du joueur', () => {
    service.mine().subscribe();
    const request = http.expectOne('/api/scores/me');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('demande le classement, filtré ou non par difficulté', () => {
    service.leaderboard().subscribe();
    expect(http.expectOne('/api/scores/leaderboard').request.params.keys()).toEqual([]);

    service.leaderboard('expert').subscribe();
    const filtered = http.expectOne((r) => r.url === '/api/scores/leaderboard' && r.params.get('difficulty') === 'expert');
    expect(filtered.request.method).toBe('GET');
    filtered.flush([]);
  });
});
