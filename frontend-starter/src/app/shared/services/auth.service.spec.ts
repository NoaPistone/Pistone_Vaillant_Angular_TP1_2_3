import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { installLocalStorageMock } from '../testing/local-storage.mock';

const user = { id: 'user-1', name: 'Demo', email: 'demo@example.com', createdAt: '2026-09-01' };

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installLocalStorageMock();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login() envoie POST /api/auth/login avec email et mot de passe', () => {
    service.login('demo@example.com', 'secret-de-test').subscribe();

    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'demo@example.com', password: 'secret-de-test' });
    request.flush({ token: 'fake-jwt', user });
  });

  it('login() mémorise le token et met à jour les Signals', () => {
    service.login('demo@example.com', 'secret-de-test').subscribe();
    http.expectOne('/api/auth/login').flush({ token: 'fake-jwt', user });

    expect(storage.get('gpc_token')).toBe('fake-jwt');
    expect(service.token()).toBe('fake-jwt');
    expect(service.currentUser()).toEqual(user);
  });

  it('un échec de connexion ne stocke aucun token', () => {
    let status = 0;
    service.login('demo@example.com', 'mauvais').subscribe({ error: (e) => (status = e.status) });
    http
      .expectOne('/api/auth/login')
      .flush({ message: 'Identifiants incorrects' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(storage.has('gpc_token')).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('logout() nettoie localStorage et les Signals', () => {
    service.login('demo@example.com', 'secret-de-test').subscribe();
    http.expectOne('/api/auth/login').flush({ token: 'fake-jwt', user });

    service.logout();

    expect(storage.has('gpc_token')).toBe(false);
    expect(service.token()).toBeNull();
    expect(service.currentUser()).toBeNull();
  });
});
