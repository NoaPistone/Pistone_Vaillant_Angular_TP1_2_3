import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TrackService } from './track.service';
import { UploadEvent } from '../models/upload-event.model';
import { Track } from '../models/track.model';

const track: Track = {
  id: 'track-1',
  title: 'Practice',
  originalName: 'practice.mp3',
  mimeType: 'audio/mpeg',
  size: 5,
  createdAt: '2026-09-24T08:00:00.000Z',
};

/**
 * Tests unitaires du service : HttpTestingController intercepte les requêtes,
 * aucune requête ne quitte le navigateur, aucun backend ni MongoDB n'est nécessaire.
 */
describe('TrackService', () => {
  let service: TrackService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TrackService);
    http = TestBed.inject(HttpTestingController);
  });

  // verify() échoue si une requête inattendue a été envoyée ou n'a pas été traitée.
  afterEach(() => http.verify());

  it('transmet page et limit à la pagination serveur', () => {
    service.list(2, 5).subscribe();

    const request = http.expectOne('/api/tracks?page=2&limit=5');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('5');
    request.flush({ items: [], page: 2, limit: 5, total: 0, pages: 1 });
  });

  it('construit le multipart avec exactement audio et title', () => {
    const file = new File(['audio'], 'practice.mp3', { type: 'audio/mpeg' });
    service.upload(file, 'Practice').subscribe();

    const request = http.expectOne('/api/tracks');
    const body = request.request.body as FormData;
    expect(request.request.method).toBe('POST');
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(['audio', 'title']);
    expect(body.get('audio')).toBe(file);
    expect(body.get('title')).toBe('Practice');
    expect(request.request.reportProgress).toBe(true);
    request.flush(track, { status: 201, statusText: 'Created' });
  });

  it('traduit les événements HTTP en progression puis en piste créée', () => {
    const events: UploadEvent[] = [];
    const file = new File(['audio'], 'practice.mp3', { type: 'audio/mpeg' });
    service.upload(file, 'Practice').subscribe((event) => events.push(event));

    const request = http.expectOne('/api/tracks');
    request.event({ type: HttpEventType.UploadProgress, loaded: 25, total: 100 });
    request.event({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
    request.flush(track, { status: 201, statusText: 'Created' });

    expect(events).toEqual([
      { type: 'progress', percent: 25 },
      { type: 'progress', percent: 100 },
      { type: 'done', track },
    ]);
  });

  it('demande la piste audio en Blob', () => {
    const audio = new Blob(['audio'], { type: 'audio/mpeg' });
    let received: Blob | undefined;
    service.audio('track-1').subscribe((response) => (received = response));

    const request = http.expectOne('/api/tracks/track-1/audio');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(audio);
    expect(received).toBe(audio);
  });

  it('supprime une piste avec DELETE /api/tracks/:id', () => {
    let completed = false;
    service.remove('track-1').subscribe({ complete: () => (completed = true) });

    const request = http.expectOne('/api/tracks/track-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(completed).toBe(true);
  });

  it('modifie titre et description avec PATCH /api/tracks/:id', () => {
    const changes = { title: 'Blues lent', description: 'Shuffle en La, 80 bpm' };
    let received: Track | undefined;
    service.update('track-1', changes).subscribe((response) => (received = response));

    const request = http.expectOne('/api/tracks/track-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(changes);
    const updated = { id: 'track-1', ...changes } as Track;
    request.flush(updated);
    expect(received).toEqual(updated);
  });
});
