import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrackCardComponent } from './track-card';
import { Track } from '../../shared/models/track.model';

const track: Track = {
  id: 'track-1',
  title: 'Blues en La',
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
    TestBed.configureTestingModule({ imports: [TrackCardComponent] });
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

  it('émet play et remove avec la piste', () => {
    const play = vi.fn();
    const remove = vi.fn();
    fixture.componentInstance.play.subscribe(play);
    fixture.componentInstance.remove.subscribe(remove);

    button('Lire').click();
    button('Supprimer').click();

    expect(play).toHaveBeenCalledWith(track);
    expect(remove).toHaveBeenCalledWith(track);
  });

  it('désactive les actions pendant la suppression', async () => {
    fixture.componentRef.setInput('deleting', true);
    await fixture.whenStable();

    expect(button('Lire').disabled).toBe(true);
    expect(button('Supprimer').disabled).toBe(true);
    expect(button('Supprimer').textContent).toContain('Suppression…');
  });
});
