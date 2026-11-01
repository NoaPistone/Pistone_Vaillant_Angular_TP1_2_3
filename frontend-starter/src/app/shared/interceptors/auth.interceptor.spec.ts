import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { installLocalStorageMock } from '../testing/local-storage.mock';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    installLocalStorageMock();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it('ajoute Authorization lorsqu’un token existe', () => {
    auth.token.set('test-token');
    httpClient.get('/api/users/me').subscribe();

    const request = http.expectOne('/api/users/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({ id: 'user-1' });
  });

  it('n’ajoute pas Authorization sans token', () => {
    httpClient.post('/api/auth/login', {}).subscribe();

    const request = http.expectOne('/api/auth/login');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('déconnecte et redirige vers /login sur un 401 d’une route protégée', () => {
    auth.token.set('expired-token');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    httpClient.get('/api/tracks').subscribe({ error: () => undefined });
    http
      .expectOne('/api/tracks')
      .flush({ message: 'Jeton invalide ou expiré' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('ne redirige pas sur un 401 de /api/auth/login (mauvais identifiants)', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    httpClient.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    http
      .expectOne('/api/auth/login')
      .flush({ message: 'Identifiants incorrects' }, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).not.toHaveBeenCalled();
  });
});
