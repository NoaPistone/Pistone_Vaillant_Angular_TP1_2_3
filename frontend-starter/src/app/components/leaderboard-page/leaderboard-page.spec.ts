import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { LeaderboardPageComponent } from './leaderboard-page';
import { ScoreService } from '../../shared/services/score.service';
import { LeaderboardEntry } from '../../shared/models/score.model';

const entries: LeaderboardEntry[] = [
  { rank: 1, name: 'Alice', avatar: { id: 'fox', name: 'Renard', emoji: '🦊', color: '#ff9a3d', price: 600 }, total: 12000, stars: 14, played: 3, isMe: false },
  { rank: 2, name: 'Bob', avatar: { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 }, total: 8000, stars: 9, played: 2, isMe: true },
];

describe('LeaderboardPageComponent', () => {
  let fixture: ComponentFixture<LeaderboardPageComponent>;
  let scores: { leaderboard: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [LeaderboardPageComponent],
      providers: [{ provide: ScoreService, useValue: scores }],
    });
    fixture = TestBed.createComponent(LeaderboardPageComponent);
    await fixture.whenStable();
  }

  beforeEach(() => {
    scores = { leaderboard: vi.fn(() => of(entries)) };
  });

  it('charge le classement toutes difficultés et signale le joueur connecté', async () => {
    await create();

    expect(scores.leaderboard).toHaveBeenCalledWith(undefined);
    const rows = host().querySelectorAll('.ranking li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[1].classList).toContain('me');
    expect(rows[1].textContent).toContain('(vous)');
  });

  it('recharge le classement filtré quand on choisit une difficulté', async () => {
    await create();
    const expert = [...host().querySelectorAll('label')].find((l) => l.textContent?.includes('Expert'))!;

    expert.querySelector('input')!.click();
    await fixture.whenStable();

    expect(scores.leaderboard).toHaveBeenLastCalledWith('expert');
  });

  it('invite à jouer quand le classement est vide', async () => {
    scores.leaderboard.mockReturnValue(of([]));
    await create();

    expect(host().textContent).toContain('Terminez une partie pour entrer au classement');
  });

  it('affiche une erreur et permet de réessayer', async () => {
    scores.leaderboard.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await create();
    expect(host().querySelector('[role="alert"]')).not.toBeNull();

    [...host().querySelectorAll('button')].find((b) => b.textContent?.includes('Réessayer'))!.click();
    await fixture.whenStable();

    expect(host().querySelectorAll('.ranking li').length).toBe(2);
  });
});
