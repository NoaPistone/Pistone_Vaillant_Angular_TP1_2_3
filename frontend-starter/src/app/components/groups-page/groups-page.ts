import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Friend, Group } from '../../shared/models/group.model';
import { AuthService } from '../../shared/services/auth.service';
import { GroupService } from '../../shared/services/group.service';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';

/**
 * Onglet Groupe : ses amis (ajoutés par leur identifiant #xxxx), créer son groupe (un seul,
 * dont on est l'hôte), rejoindre celui d'un autre avec un code, ouvrir le salon de jeu.
 */
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvatarBadgeComponent],
  templateUrl: './groups-page.html',
  styleUrl: './groups-page.css',
})
export class GroupsPageComponent {
  private readonly service = inject(GroupService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  /** Mon identifiant d'ami, affiché pour être partagé. */
  readonly myTag = computed(() => this.auth.currentUser()?.tag ?? null);
  readonly friends = signal<Friend[]>([]);
  readonly groups = signal<Group[]>([]);
  /** Un seul groupe créé par joueur : le formulaire de création disparaît ensuite. */
  readonly ownsGroup = computed(() => this.groups().some((g) => g.isOwner));
  readonly loading = signal(true);
  readonly error = signal('');
  /** Action en cours : 'create', 'join', 'friend', l'id du groupe quitté ou de l'ami retiré. Une seule à la fois. */
  readonly busy = signal<string | null>(null);

  /*
   * Un FormGroup par formulaire : c'est la directive [formGroup] qui émet (ngSubmit).
   * Sans elle, le navigateur ferait un envoi classique et rechargerait la page.
   */
  readonly createForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S.*\S/), Validators.maxLength(40)],
    }),
  });
  readonly joinForm = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\s*[A-Za-z0-9]{6}\s*$/)] }),
  });
  readonly friendForm = new FormGroup({
    tag: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\s*#?[A-HJ-NP-Za-hj-np-z2-9]{4}\s*$/)] }),
  });
  readonly name = this.createForm.controls.name;
  readonly code = this.joinForm.controls.code;
  readonly tag = this.friendForm.controls.tag;

  constructor() {
    if (!this.auth.currentUser()) this.auth.profile().subscribe({ error: () => undefined });
    this.load();
    this.service.friends().subscribe({ next: (friends) => this.friends.set(friends), error: () => undefined });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Groupes impossibles à charger'));
      },
    });
  }

  create(): void {
    if (this.busy()) return;
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.busy.set('create');
    this.service.create(this.name.value.trim()).subscribe({
      next: (group) => {
        this.busy.set(null);
        this.name.reset();
        this.groups.update((groups) => [group, ...groups]);
        this.notify(`Groupe « ${group.name} » créé. Partagez le code ${group.code} pour inviter.`);
      },
      error: (error: unknown) => this.fail(error, 'Création impossible'),
    });
  }

  join(): void {
    if (this.busy()) return;
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    this.busy.set('join');
    this.service.join(this.code.value.trim().toUpperCase()).subscribe({
      next: (group) => {
        this.busy.set(null);
        this.code.reset();
        this.groups.update((groups) => [group, ...groups]);
        this.notify(`Bienvenue dans « ${group.name} ».`);
      },
      error: (error: unknown) => this.fail(error, 'Impossible de rejoindre ce groupe'),
    });
  }

  addFriend(): void {
    if (this.busy()) return;
    if (this.tag.invalid) {
      this.tag.markAsTouched();
      return;
    }
    this.busy.set('friend');
    this.service.addFriend(this.tag.value.trim().replace(/^#/, '').toUpperCase()).subscribe({
      next: (friend) => {
        this.busy.set(null);
        this.tag.reset();
        this.friends.update((friends) => [...friends, friend].sort((a, b) => a.name.localeCompare(b.name)));
        this.notify(`${friend.name} fait maintenant partie de vos amis.`);
      },
      error: (error: unknown) => this.fail(error, 'Ajout impossible'),
    });
  }

  removeFriend(friend: Friend): void {
    if (this.busy()) return;
    if (!window.confirm(`Retirer ${friend.name} de vos amis ?`)) return;
    this.busy.set(friend.id);
    this.service.removeFriend(friend.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.friends.update((friends) => friends.filter((f) => f.id !== friend.id));
      },
      error: (error: unknown) => this.fail(error, 'Impossible de retirer cet ami'),
    });
  }

  leave(group: Group): void {
    if (this.busy()) return;
    const question = group.isOwner
      ? `Supprimer « ${group.name} » ? Tous les membres en sortiront.`
      : `Quitter « ${group.name} » ? Il faudra son code pour revenir.`;
    if (!window.confirm(question)) return;
    this.busy.set(group.id);
    this.service.leave(group.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.groups.update((groups) => groups.filter((g) => g.id !== group.id));
        this.notify(group.isOwner ? `« ${group.name} » est supprimé.` : `Vous avez quitté « ${group.name} ».`);
      },
      error: (error: unknown) => this.fail(error, 'Impossible de quitter ce groupe'),
    });
  }

  private fail(error: unknown, fallback: string): void {
    this.busy.set(null);
    if (error instanceof HttpErrorResponse && error.status === 401) return;
    this.notify(httpErrorMessage(error, fallback));
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Fermer', { duration: 5000 });
  }
}
