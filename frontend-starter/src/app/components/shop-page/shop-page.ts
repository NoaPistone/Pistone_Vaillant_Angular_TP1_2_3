import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { forkJoin } from 'rxjs';
import { Avatar, Background, Shelf } from '../../shared/models/user.model';
import { AuthService } from '../../shared/services/auth.service';
import { ShopService } from '../../shared/services/shop.service';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';
import { StageShaderComponent } from '../stage-shader/stage-shader';

/** État d'un article pour le joueur : il décide du bouton affiché sur sa carte. */
export type ItemStatus = 'equipped' | 'owned' | 'affordable' | 'locked';

/** Rareté d'un article, déduite de son prix : elle colore sa carte et hiérarchise le catalogue. */
export interface Rarity {
  key: 'common' | 'rare' | 'epic' | 'legendary';
  label: string;
}
export function rarityOf(price: number): Rarity {
  if (price >= 2000) return { key: 'legendary', label: 'Légendaire' };
  if (price >= 800) return { key: 'epic', label: 'Épique' };
  if (price >= 300) return { key: 'rare', label: 'Rare' };
  return { key: 'common', label: 'Commun' };
}

/** Article d'un rayon, prêt à afficher. `avatar` ou `background` selon le rayon. */
interface ShopItem {
  shelf: Shelf;
  id: string;
  name: string;
  price: number;
  status: ItemStatus;
  rarity: Rarity;
  /** Part du prix déjà gagnée (0 à 1), pour la barre de progression d'un article verrouillé. */
  progress: number;
  avatar?: Avatar;
  background?: Background;
}

/**
 * Boutique : les points gagnés en jouant achètent des avatars et des fonds de scène,
 * puis on choisit ceux utilisés. Le serveur reste seul juge du solde et de la possession.
 */
@Component({
  imports: [DecimalPipe, AvatarBadgeComponent, MatTabsModule, StageShaderComponent],
  templateUrl: './shop-page.html',
  styleUrl: './shop-page.css',
})
export class ShopPageComponent {
  private readonly shop = inject(ShopService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  private readonly avatars = signal<Avatar[]>([]);
  private readonly backgrounds = signal<Background[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Article en cours d'achat ou d'équipement (`rayon/id`) : un seul à la fois. */
  readonly busyId = signal<string | null>(null);

  /** Onglet affiché : 0 = avatars, 1 = fonds de scène. */
  readonly tab = signal(0);

  readonly coins = computed(() => this.auth.currentUser()?.coins ?? 0);

  /** Les deux rayons, chaque article avec son état pour le joueur connecté. */
  readonly shelves = computed(() => {
    const user = this.auth.currentUser();
    const status = (shelf: Shelf, id: string, price: number): ItemStatus => {
      const equipped = shelf === 'avatars' ? user?.avatar.id : user?.background.id;
      const owned = shelf === 'avatars' ? user?.avatars : user?.backgrounds;
      return equipped === id ? 'equipped' : owned?.includes(id) ? 'owned' : this.coins() >= price ? 'affordable' : 'locked';
    };
    const item = (shelf: Shelf, base: Avatar | Background) => ({
      shelf,
      id: base.id,
      name: base.name,
      price: base.price,
      status: status(shelf, base.id, base.price),
      rarity: rarityOf(base.price),
      progress: base.price ? Math.min(1, this.coins() / base.price) : 1,
    });
    return [
      { key: 'avatars' as const, title: 'Avatars', items: this.avatars().map((a): ShopItem => ({ ...item('avatars', a), avatar: a })) },
      {
        key: 'backgrounds' as const,
        title: 'Fonds de scène',
        items: this.backgrounds().map((b): ShopItem => ({ ...item('backgrounds', b), background: b })),
      },
    ];
  });

  constructor() {
    // Le solde affiché doit être frais : un autre onglet a pu jouer ou acheter.
    this.auth.profile().subscribe({ error: () => undefined });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin([this.shop.avatars(), this.shop.backgrounds()]).subscribe({
      next: ([avatars, backgrounds]) => {
        this.avatars.set(avatars);
        this.backgrounds.set(backgrounds);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Boutique impossible à charger'));
      },
    });
  }

  buy(item: ShopItem): void {
    this.run(item, () => this.shop.buy(item.shelf, item.id), `${item.name} : acheté. Il est dans votre collection.`);
  }

  equip(item: ShopItem): void {
    const where = item.shelf === 'avatars' ? 'votre avatar' : 'votre fond de scène';
    this.run(item, () => this.shop.equip(item.shelf, item.id), `${item.name} est maintenant ${where}.`);
  }

  /** La requête n'est créée qu'après la vérification « une action à la fois ». */
  private run(item: ShopItem, request: () => ReturnType<ShopService['buy']>, success: string): void {
    if (this.busyId()) return;
    this.busyId.set(`${item.shelf}/${item.id}`);
    request().subscribe({
      next: () => {
        this.busyId.set(null);
        this.snackBar.open(success, 'Fermer', { duration: 4000 });
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        if (error instanceof HttpErrorResponse && error.status === 401) return;
        this.snackBar.open(httpErrorMessage(error, 'Action impossible'), 'Fermer', { duration: 5000 });
        // Le serveur ne partage pas notre avis (solde, possession) : on relit le compte.
        this.auth.profile().subscribe({ error: () => undefined });
      },
    });
  }
}
