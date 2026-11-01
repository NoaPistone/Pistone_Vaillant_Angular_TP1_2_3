import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { filter, map, Observable } from 'rxjs';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';
import { UploadEvent } from '../models/upload-event.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  /** Pagination serveur : chaque page correspond à une nouvelle requête HTTP. */
  list(page = 1, limit = 5) {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit },
    });
  }

  /**
   * Envoie le multipart `audio` + `title` et suit la progression.
   *
   * Avec `observe: 'events'` et `reportProgress: true`, l'Observable n'émet plus
   * une seule réponse finale mais une suite d'événements (`Sent`,
   * `UploadProgress`… puis `Response`). Le service les traduit en `UploadEvent`
   * pour que le composant n'ait pas à connaître les types internes d'Angular.
   * Les événements de progression nécessitent `withXhr()` (voir `main.ts`).
   */
  upload(file: File, title: string): Observable<UploadEvent> {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    return this.http
      .post<Track>('/api/tracks', body, { reportProgress: true, observe: 'events' })
      .pipe(
        map((event) => toUploadEvent(event)),
        filter((event): event is UploadEvent => event !== null),
      );
  }

  /** Télécharge l'audio en `Blob` : la requête passe par l'intercepteur JWT. */
  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  /** Modifie le titre et/ou la description. Le backend renvoie la piste à jour (`200`), `400` ou `404`. */
  update(id: string, changes: Pick<Track, 'title' | 'description'>) {
    return this.http.patch<Track>(`/api/tracks/${id}`, changes);
  }

  /** Supprime une piste. Le backend vérifie le JWT et le propriétaire (`204` ou `404`). */
  remove(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}

/**
 * Traduit un `HttpEvent` en événement métier, ou `null` s'il est inutile à l'interface.
 * Le pourcentage vaut `loaded / total` : `total` peut être absent si le navigateur
 * ne connaît pas la taille du corps, on affiche alors 0 % jusqu'à la réponse.
 */
function toUploadEvent(event: HttpEvent<Track>): UploadEvent | null {
  if (event.type === HttpEventType.UploadProgress) {
    const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
    return { type: 'progress', percent };
  }
  if (event.type === HttpEventType.Response && event.body) {
    return { type: 'done', track: event.body };
  }
  return null;
}
