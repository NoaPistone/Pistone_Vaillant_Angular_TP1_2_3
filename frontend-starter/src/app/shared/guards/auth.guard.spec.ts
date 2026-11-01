import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { installLocalStorageMock } from '../testing/local-storage.mock';

describe('authGuard', () => {
  // Un guard fonctionnel utilise inject() : il doit s'exécuter dans un contexte d'injection.
  const runGuard = () =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  beforeEach(() => {
    installLocalStorageMock();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });

  it('redirige vers /login un utilisateur sans token', () => {
    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/login');
  });

  it('laisse passer un utilisateur possédant un token', () => {
    TestBed.inject(AuthService).token.set('test-token');

    expect(runGuard()).toBe(true);
  });
});
