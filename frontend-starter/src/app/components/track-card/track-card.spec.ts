import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TrackCardComponent } from './track-card';
import { Track } from '../../shared/models/track.model';

const track: Track = {
  id: 'track-1',
  title: 'Blues en La',
  description: 'Shuffle lent',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 3 * 1024 * 1024,
  createdAt: '2026-09-24T08:00:00.000Z',
};

describe('TrackCardComponent', () => {
  let fixture: ComponentFixture<TrackCardComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    host().querySelector(`button[aria-label="${label} ${track.title}"]`) as HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TrackCardComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(TrackCardComponent);
    fixture.componentRef.setInput('track', track);
    await fixture.whenStable();
  });

  it('affiche les métadonnées lisibles de la piste, sans le nom du fichier', () => {
    const content = host().textContent ?? '';
    expect(content).toContain('Blues en La');
    expect(content).not.toContain('blues.mp3'); // le titre choisi suffit
    expect(content).toContain('MP3');
    expect(content).toContain('3.0 Mo');
  });

  it('propose un lien Jouer vers la page de jeu de la piste', () => {
    const link = host().querySelector('a.game-link') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/game/track-1');
    expect(link.getAttribute('aria-label')).toBe('Jouer à Blues en La');
  });

  it('émet play avec la piste', () => {
    const play = vi.fn();
    fixture.componentInstance.play.subscribe(play);

    button('Lire').click();

    expect(play).toHaveBeenCalledWith(track);
  });

  it('range « Supprimer » dans le formulaire de modification', async () => {
    const remove = vi.fn();
    fixture.componentInstance.remove.subscribe(remove);
    expect(button('Supprimer')).toBeNull(); // pas sur la carte

    fixture.componentRef.setInput('editing', true);
    await fixture.whenStable();
    button('Supprimer').click();

    expect(remove).toHaveBeenCalledWith(track);
  });

  it('désactive les actions pendant la suppression', async () => {
    fixture.componentRef.setInput('deleting', true);
    await fixture.whenStable();
    expect(button('Lire').disabled).toBe(true);
    expect(button('Modifier').disabled).toBe(true);

    fixture.componentRef.setInput('editing', true);
    await fixture.whenStable();
    expect(button('Supprimer').disabled).toBe(true);
    expect(button('Supprimer').textContent).toContain('Suppression…');
  });

  describe('modification', () => {
    const field = (name: string) => host().querySelector(`[formControlName="${name}"]`) as HTMLInputElement;

    it('affiche la description et demande l’ouverture du formulaire pré-rempli', async () => {
      const edit = vi.fn();
      fixture.componentInstance.edit.subscribe(edit);
      expect(host().textContent).toContain('Shuffle lent');

      button('Modifier').click();
      fixture.componentRef.setInput('editing', true);
      await fixture.whenStable();

      expect(edit).toHaveBeenCalledWith(track);
      expect(field('title').value).toBe('Blues en La');
      expect(field('description').value).toBe('Shuffle lent');
    });

    it('émet save avec les valeurs nettoyées', async () => {
      const save = vi.fn();
      fixture.componentInstance.save.subscribe(save);
      fixture.componentInstance.startEdit();
      fixture.componentRef.setInput('editing', true);
      await fixture.whenStable();

      fixture.componentInstance.form.setValue({ title: '  Blues lent ', description: ' 80 bpm ' });
      (host().querySelector('button[type="submit"]') as HTMLButtonElement).click();

      expect(save).toHaveBeenCalledWith({ track, changes: { title: 'Blues lent', description: '80 bpm' } });
    });

    it('refuse un titre vide sans rien émettre', async () => {
      const save = vi.fn();
      fixture.componentInstance.save.subscribe(save);
      fixture.componentRef.setInput('editing', true);
      await fixture.whenStable();

      fixture.componentInstance.form.setValue({ title: '   ', description: '' });
      (host().querySelector('button[type="submit"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(save).not.toHaveBeenCalled();
      expect(host().textContent).toContain('Le titre est obligatoire.');
    });

    it('désactive le formulaire pendant l’enregistrement', async () => {
      fixture.componentRef.setInput('editing', true);
      fixture.componentRef.setInput('saving', true);
      await fixture.whenStable();

      expect((host().querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
      expect(host().textContent).toContain('Enregistrement…');
    });
  });

  it('affiche le record et ses étoiles quand le joueur a déjà joué', async () => {
    expect(host().querySelector('.best')).toBeNull();
    fixture.componentRef.setInput('best', {
      id: 's1', trackId: 'track-1', difficulty: 'expert', instrument: 'lead', score: 4200, stars: 3, accuracy: 90, maxCombo: 50, updatedAt: '',
    });
    await fixture.whenStable();

    expect(host().querySelector('.best')?.textContent).toContain('4,200');
    expect(host().querySelectorAll('.best .won').length).toBe(3);
    expect(host().textContent).toContain('3 étoile(s) sur 5');
  });
});
