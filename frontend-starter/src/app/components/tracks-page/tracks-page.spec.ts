import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { TracksPageComponent } from './tracks-page';
import { TrackService } from '../../shared/services/track.service';
import { Page } from '../../shared/models/page.model';
import { Track } from '../../shared/models/track.model';

const makeTrack = (id: string): Track => ({
  id,
  title: `Piste ${id}`,
  originalName: `${id}.mp3`,
  mimeType: 'audio/mpeg',
  size: 1024,
  createdAt: '2026-09-24T08:00:00.000Z',
});

const page = (items: Track[], overrides: Partial<Page<Track>> = {}): Page<Track> => ({
  items,
  page: 1,
  limit: 5,
  total: items.length,
  pages: 1,
  ...overrides,
});

describe('TracksPageComponent', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let service: {
    list: ReturnType<typeof vi.fn<(page: number, limit: number) => Observable<Page<Track>>>>;
    upload: ReturnType<typeof vi.fn>;
    audio: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [
        { provide: TrackService, useValue: service },
        { provide: MatSnackBar, useValue: snackBar },
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  beforeEach(() => {
    service = {
      list: vi.fn(() => of(page([makeTrack('a'), makeTrack('b')]))),
      upload: vi.fn(),
      audio: vi.fn(),
      remove: vi.fn(() => of(undefined)),
      update: vi.fn(),
    };
    snackBar = { open: vi.fn() };
  });

  afterEach(() => vi.restoreAllMocks());

  describe('bibliothèque paginée', () => {
    beforeEach(create);

    it('charge la page 1 au démarrage et affiche une card par piste', () => {
      expect(service.list).toHaveBeenCalledWith(1, 5);
      expect(fixture.nativeElement.querySelectorAll('app-track-card').length).toBe(2);
    });

    it('effectue une nouvelle requête serveur à chaque changement de page', () => {
      component.go(2);

      expect(service.list).toHaveBeenLastCalledWith(2, 5);
      expect(component.page()).toBe(2);
    });

    it('traduit l’événement du Paginator (pageIndex 0-based) en page API', () => {
      component.onPage({ pageIndex: 1, pageSize: 10, length: 30, previousPageIndex: 0 });

      expect(service.list).toHaveBeenLastCalledWith(2, 10);
    });

    it('revient en page 1 après un upload réussi', () => {
      component.page.set(3);
      component.onUploaded();

      expect(service.list).toHaveBeenLastCalledWith(1, 5);
    });
  });

  it('affiche une erreur après un échec HTTP de la liste', async () => {
    service.list.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Erreur serveur' } })),
    );
    await create();

    expect(component.error()).toBe('Erreur serveur');
    expect(text()).toContain('Erreur serveur');
    expect(text()).not.toContain('Aucune piste');
  });

  describe('suppression', () => {
    beforeEach(create);

    it('appelle DELETE après confirmation, notifie et recharge la liste', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      service.list.mockClear();
      component.edit(makeTrack('a')); // « Supprimer » est dans le formulaire de modification

      component.remove(makeTrack('a'));

      expect(component.editingId()).toBeNull(); // le formulaire se ferme avec la carte supprimée
      expect(service.remove).toHaveBeenCalledWith('a');
      expect(snackBar.open).toHaveBeenCalledWith('Piste « Piste a » supprimée.', 'Fermer', expect.anything());
      expect(service.list).toHaveBeenCalledTimes(1);
      expect(component.deletingId()).toBeNull();
    });

    it('n’appelle pas le serveur si l’utilisateur annule', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.remove(makeTrack('a'));

      expect(service.remove).not.toHaveBeenCalled();
    });

    it('bloque les doubles clics pendant une suppression', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      service.remove.mockReturnValue(new Observable()); // requête qui ne se termine jamais

      component.remove(makeTrack('a'));
      component.remove(makeTrack('a'));

      expect(service.remove).toHaveBeenCalledTimes(1);
      expect(component.deletingId()).toBe('a');
    });

    it('gère une piste déjà supprimée (404) : message et resynchronisation', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      service.remove.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      service.list.mockClear();

      component.remove(makeTrack('a'));

      expect(snackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('n’existe plus'),
        'Fermer',
        expect.anything(),
      );
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('revient à la page précédente si la page courante devient vide', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.page.set(2);
      service.list.mockImplementation((requested) =>
        requested === 2
          ? of(page([], { page: 2, total: 5, pages: 1 }))
          : of(page([makeTrack('a')], { total: 5 })),
      );

      component.remove(makeTrack('f'));

      expect(service.list).toHaveBeenLastCalledWith(1, 5);
      expect(component.page()).toBe(1);
      expect(component.tracks().length).toBe(1);
    });
  });

  describe('lecture audio', () => {
    beforeEach(async () => {
      // jsdom ne fournit pas createObjectURL / revokeObjectURL.
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      URL.revokeObjectURL = vi.fn();
      await create();
    });

    it('crée une ObjectURL et affiche le morceau en cours', async () => {
      service.audio.mockReturnValue(of(new Blob(['x'], { type: 'audio/mpeg' })));

      component.play(makeTrack('a'));
      await fixture.whenStable();

      expect(service.audio).toHaveBeenCalledWith('a');
      expect(component.audioUrl()).toBe('blob:fake-url');
      expect(text()).toContain('En cours : Piste a');
    });

    it('révoque l’ObjectURL finale à la destruction du composant', () => {
      service.audio.mockReturnValue(of(new Blob(['x'])));
      component.play(makeTrack('a'));

      fixture.destroy();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });

    it('affiche une erreur compréhensible si la piste est introuvable', () => {
      service.audio.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));

      component.play(makeTrack('a'));

      expect(component.audioError()).toContain('introuvable');
    });
  });

  describe('modification d’une piste', () => {
    beforeEach(create);
    const changes = { title: 'Blues lent', description: 'Shuffle, 80 bpm' };

    it('remplace la piste modifiée dans la liste, ferme le formulaire et notifie', async () => {
      const updated = { ...makeTrack('a'), ...changes };
      service.update.mockReturnValue(of(updated));
      component.edit(makeTrack('a'));

      component.save({ track: makeTrack('a'), changes });
      await fixture.whenStable();

      expect(service.update).toHaveBeenCalledWith('a', changes);
      expect(component.editingId()).toBeNull();
      expect(component.tracks()[0]).toEqual(updated);
      expect(text()).toContain('Shuffle, 80 bpm');
      expect(service.list).toHaveBeenCalledTimes(1); // pas de rechargement complet
      expect(snackBar.open).toHaveBeenCalledWith('Piste « Blues lent » modifiée.', 'Fermer', { duration: 5000 });
    });

    it('garde le formulaire ouvert et bloque la double soumission pendant l’envoi', () => {
      const pending = new Subject<Track>();
      service.update.mockReturnValue(pending);
      component.edit(makeTrack('a'));

      component.save({ track: makeTrack('a'), changes });
      component.save({ track: makeTrack('a'), changes });

      expect(service.update).toHaveBeenCalledTimes(1);
      expect(component.savingId()).toBe('a');
      expect(component.editingId()).toBe('a');
    });

    it('garde la saisie et affiche le message serveur en cas de 400', () => {
      service.update.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Titre invalide' } })),
      );
      component.edit(makeTrack('a'));

      component.save({ track: makeTrack('a'), changes });

      expect(component.editingId()).toBe('a');
      expect(component.savingId()).toBeNull();
      expect(snackBar.open).toHaveBeenCalledWith('Titre invalide', 'Fermer', { duration: 5000 });
    });
  });
});
