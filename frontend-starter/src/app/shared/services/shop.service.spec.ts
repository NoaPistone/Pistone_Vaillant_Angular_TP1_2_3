import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ShopService } from './shop.service';
import { AuthService } from './auth.service';
import { installLocalStorageMock } from '../testing/local-storage.mock';
import { User } from '../models/user.model';

const user: User = {
  id: 'u1', name: 'Léa', email: 'l@x.fr', tag: 'LEA2', createdAt: '', coins: 50, avatars: ['rocker', 'fox'], backgrounds: ['stage', 'lava'],
  avatar: { id: 'fox', name: 'Renard', emoji: '🦊', color: '#ff9a3d', price: 600 },
  background: { id: 'lava', name: 'Coulée de lave', shader: 'lasers', stage: '#5c1408', deep: '#190402', spotA: '#ff3b2f', spotB: '#ff9a3d', price: 800 },
};

describe('ShopService', () => {
  let service: ShopService;
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    installLocalStorageMock();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ShopService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lit les deux rayons', () => {
    service.avatars().subscribe();
    service.backgrounds().subscribe();
    expect(http.expectOne('/api/shop/avatars').request.method).toBe('GET');
    expect(http.expectOne('/api/shop/backgrounds').request.method).toBe('GET');
  });

  it('achète un fond et range l’utilisateur à jour dans AuthService', () => {
    service.buy('backgrounds', 'lava').subscribe();

    const request = http.expectOne('/api/shop/backgrounds/lava/buy');
    expect(request.request.method).toBe('POST');
    request.flush(user);
    expect(auth.currentUser()).toEqual(user);
  });

  it('choisit l’article sur le bon réglage de l’utilisateur', () => {
    service.equip('avatars', 'fox').subscribe();
    const avatar = http.expectOne('/api/users/me/avatar');
    expect(avatar.request.method).toBe('PUT');
    expect(avatar.request.body).toEqual({ avatar: 'fox' });
    avatar.flush(user);

    service.equip('backgrounds', 'lava').subscribe();
    const background = http.expectOne('/api/users/me/background');
    expect(background.request.body).toEqual({ background: 'lava' });
    background.flush(user);
    expect(auth.currentUser()?.background.id).toBe('lava');
  });
});
