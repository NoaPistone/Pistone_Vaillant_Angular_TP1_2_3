import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpDownloadProgressEvent, HttpEventType } from '@angular/common/http';
import { filter, map, mergeMap, Observable } from 'rxjs';
import { Friend, Group, GroupTrack, LiveState } from '../models/group.model';
import { Difficulty, Instrument } from '../utils/beatmap';

/** Amis, groupes (REST) et parties en direct (flux Server-Sent Events + actions POST). */
@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly http = inject(HttpClient);

  friends() {
    return this.http.get<Friend[]>('/api/friends');
  }

  /** `tag` : identifiant d'ami, avec ou sans « # » (le serveur l'accepte des deux façons). */
  addFriend(tag: string) {
    return this.http.post<Friend>('/api/friends', { tag });
  }

  removeFriend(id: string) {
    return this.http.delete<void>(`/api/friends/${id}`);
  }

  list() {
    return this.http.get<Group[]>('/api/groups');
  }

  create(name: string) {
    return this.http.post<Group>('/api/groups', { name });
  }

  join(code: string) {
    return this.http.post<Group>('/api/groups/join', { code });
  }

  leave(id: string) {
    return this.http.post<void>(`/api/groups/${id}/leave`, null);
  }

  tracks(id: string) {
    return this.http.get<GroupTrack[]>(`/api/groups/${id}/tracks`);
  }

  /**
   * Flux temps réel du salon. Plutôt qu'un `EventSource` (qui ne sait pas envoyer l'en-tête
   * Authorization), on lit la réponse texte au fil de l'eau avec HttpClient : avec
   * `reportProgress`, chaque morceau reçu arrive dans un événement `DownloadProgress`
   * (`partialText` = tout le texte reçu depuis le début). L'intercepteur JWT s'applique donc.
   *
   * ponytail: le texte reçu s'accumule pendant toute la connexion (quelques Ko par partie) ;
   * passer à fetch() + ReadableStream si des salons restaient ouverts des heures.
   */
  live(id: string): Observable<LiveState> {
    let consumed = 0;
    return this.http
      .get(`/api/groups/${id}/live`, { responseType: 'text', observe: 'events', reportProgress: true })
      .pipe(
        filter((event): event is HttpDownloadProgressEvent => event.type === HttpEventType.DownloadProgress),
        mergeMap((event) => {
          const text = event.partialText ?? '';
          const end = text.lastIndexOf('\n\n'); // seuls les messages complets sont lus
          if (end < consumed) return [];
          const chunk = text.slice(consumed, end);
          consumed = end + 2;
          return parseServerEvents(chunk);
        }),
        map((data) => JSON.parse(data) as LiveState),
      );
  }

  chooseTrack(id: string, trackId: string) {
    return this.http.post<void>(`/api/groups/${id}/live/track`, { trackId });
  }

  setPlayer(id: string, settings: { instrument: Instrument; difficulty: Difficulty; ready: boolean }) {
    return this.http.post<void>(`/api/groups/${id}/live/player`, settings);
  }

  start(id: string) {
    return this.http.post<void>(`/api/groups/${id}/live/start`, null);
  }

  reportScore(id: string, progress: { score: number; combo: number; done: boolean }) {
    return this.http.post<void>(`/api/groups/${id}/live/score`, progress);
  }

  reset(id: string) {
    return this.http.post<void>(`/api/groups/${id}/live/reset`, null);
  }
}

/**
 * Extrait les données des messages « text/event-stream » : messages séparés par une ligne vide,
 * lignes `data: …` (les lignes `: …` sont des commentaires, comme le ping du serveur).
 */
export function parseServerEvents(text: string): string[] {
  return text
    .split('\n\n')
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n'),
    )
    .filter((data) => data.length > 0);
}
