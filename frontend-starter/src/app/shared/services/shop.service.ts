import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { Avatar, Background, Shelf, User } from '../models/user.model';
import { AuthService } from './auth.service';

/** Champ de l'utilisateur qui reçoit l'article choisi dans chaque rayon. */
const SLOT: Record<Shelf, 'avatar' | 'background'> = { avatars: 'avatar', backgrounds: 'background' };

/**
 * Boutique : avatars et fonds de scène. Après un achat ou un changement, le serveur renvoie
 * l'utilisateur à jour : on le range dans AuthService pour que toute l'application suive
 * (avatar et solde dans la barre du haut, fond derrière la piste).
 */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  avatars() {
    return this.http.get<Avatar[]>('/api/shop/avatars');
  }

  backgrounds() {
    return this.http.get<Background[]>('/api/shop/backgrounds');
  }

  buy(shelf: Shelf, id: string) {
    return this.http.post<User>(`/api/shop/${shelf}/${id}/buy`, null).pipe(tap((user) => this.auth.currentUser.set(user)));
  }

  equip(shelf: Shelf, id: string) {
    const slot = SLOT[shelf];
    return this.http.put<User>(`/api/users/me/${slot}`, { [slot]: id }).pipe(tap((user) => this.auth.currentUser.set(user)));
  }
}
