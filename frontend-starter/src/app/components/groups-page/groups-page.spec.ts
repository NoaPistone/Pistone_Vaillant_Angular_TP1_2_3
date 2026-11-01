import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { GroupsPageComponent } from './groups-page';
import { GroupService } from '../../shared/services/group.service';
import { Group } from '../../shared/models/group.model';
import { AuthService } from '../../shared/services/auth.service';

const avatar = { id: 'rocker', name: 'Rockeur', emoji: '🎸', color: '#8f5bff', price: 0 };
const group = (id: string, name: string): Group => ({
  id, name, code: 'K7QF2M', isOwner: false, members: [{ id: 'u1', name: 'Léa', avatar, isOwner: true }],
});
const bob = { id: 'u2', name: 'Bob', tag: 'B0B5', avatar };

describe('GroupsPageComponent', () => {
  let fixture: ComponentFixture<GroupsPageComponent>;
  let component: GroupsPageComponent;
  let service: Record<'list' | 'create' | 'join' | 'leave' | 'friends' | 'addFriend' | 'removeFriend', ReturnType<typeof vi.fn>>;
  let snackBar: { open: ReturnType<typeof vi.fn> };
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    service = {
      list: vi.fn(() => of([group('g1', 'Les Riffs')])), create: vi.fn(), join: vi.fn(), leave: vi.fn(),
      friends: vi.fn(() => of([bob])), addFriend: vi.fn(), removeFriend: vi.fn(),
    };
    snackBar = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GroupsPageComponent],
      providers: [
        provideRouter([]),
        { provide: GroupService, useValue: service },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AuthService, useValue: { currentUser: signal({ tag: 'K7P2' }), profile: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('liste mes groupes avec leur code et un lien vers le salon', () => {
    expect(host().textContent).toContain('Les Riffs');
    expect(host().textContent).toContain('K7QF2M');
    expect(host().querySelector('a.go')?.getAttribute('href')).toBe('/groups/g1/live');
  });

  it('crée un groupe et annonce son code', async () => {
    service.create.mockReturnValue(of(group('g2', 'Les Accords')));
    component.name.setValue('  Les Accords ');

    component.create();
    await fixture.whenStable();

    expect(service.create).toHaveBeenCalledWith('Les Accords');
    expect(component.groups()[0].id).toBe('g2');
    expect(snackBar.open.mock.calls[0][0]).toContain('K7QF2M');
  });

  it('refuse un code mal formé sans appeler le serveur', () => {
    component.code.setValue('abc');
    component.join();
    expect(service.join).not.toHaveBeenCalled();
  });

  it('rejoint un groupe avec un code en minuscules et affiche le refus du serveur', () => {
    service.join.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Groupe complet (4 membres)' } })));
    component.code.setValue('k7qf2m');

    component.join();

    expect(service.join).toHaveBeenCalledWith('K7QF2M');
    expect(snackBar.open).toHaveBeenCalledWith('Groupe complet (4 membres)', 'Fermer', { duration: 5000 });
    expect(component.busy()).toBeNull();
  });

  it('affiche mon identifiant et mes amis, en ajoute un par son identifiant', async () => {
    expect(host().querySelector('.my-tag')?.textContent).toContain('#K7P2');
    expect(host().querySelector('.friend')?.textContent).toContain('#B0B5');
    service.addFriend.mockReturnValue(of({ ...bob, id: 'u3', name: 'Ana', tag: 'ANA2' }));
    component.tag.setValue(' #ana2 ');

    component.addFriend();
    await fixture.whenStable();

    expect(service.addFriend).toHaveBeenCalledWith('ANA2');
    expect(component.friends().map((f) => f.name)).toEqual(['Ana', 'Bob']);
  });

  it('refuse un identifiant d’ami mal formé sans appeler le serveur', () => {
    for (const value of ['#AB', 'K0P2', '#ABCDE']) {
      component.tag.setValue(value);
      component.addFriend();
    }
    expect(service.addFriend).not.toHaveBeenCalled();
  });

  it('retire un ami après confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    service.removeFriend.mockReturnValue(of(undefined));

    component.removeFriend(bob);

    expect(service.removeFriend).toHaveBeenCalledWith('u2');
    expect(component.friends()).toEqual([]);
  });

  it('un seul groupe créé : sans formulaire de création, et son créateur le supprime', async () => {
    component.groups.set([{ ...group('g1', 'Les Riffs'), isOwner: true }]);
    await fixture.whenStable();

    expect(host().querySelector('input[formControlName="name"]')).toBeNull();
    expect(host().querySelector('.group button.danger')?.textContent).toContain('Supprimer le groupe');
  });

  it('quitte un groupe après confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    service.leave.mockReturnValue(of(undefined));

    component.leave(component.groups()[0]);

    expect(service.leave).toHaveBeenCalledWith('g1');
    expect(component.groups()).toEqual([]);
  });

  describe('formulaires (par le DOM, comme un utilisateur)', () => {
    /** Tape une valeur dans un champ puis clique sur le bouton d'envoi de son formulaire. */
    async function submit(field: string, value: string): Promise<void> {
      const input = host().querySelector(`input[formControlName="${field}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      (input.closest('form')!.querySelector('button[type="submit"]') as HTMLButtonElement).click();
      await fixture.whenStable();
    }

    it('crée le groupe au clic sur « Créer », sans recharger la page', async () => {
      service.create.mockReturnValue(of(group('g2', 'Les Accords')));

      await submit('name', 'Les Accords');

      expect(service.create).toHaveBeenCalledWith('Les Accords');
      expect(host().textContent).toContain('Les Accords');
    });

    it('rejoint un groupe au clic sur « Rejoindre »', async () => {
      service.join.mockReturnValue(of(group('g3', 'Les Basses')));

      await submit('code', 'k7qf2m');

      expect(service.join).toHaveBeenCalledWith('K7QF2M');
    });

    it('affiche l’erreur du nom au clic, sans appeler le serveur', async () => {
      await submit('name', 'x');

      expect(service.create).not.toHaveBeenCalled();
      expect(host().textContent).toContain('Donnez un nom de 2 à 40 caractères.');
    });
  });
});
