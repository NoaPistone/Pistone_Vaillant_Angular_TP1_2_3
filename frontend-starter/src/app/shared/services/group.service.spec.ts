import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GroupService, parseServerEvents } from './group.service';
import { LiveState } from '../models/group.model';

describe('parseServerEvents', () => {
  it('extrait les données des messages et ignore les commentaires', () => {
    expect(parseServerEvents('data: {"a":1}\n\n: ping\n\ndata: {"b":2}')).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe('GroupService', () => {
  let service: GroupService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GroupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crée et rejoint un groupe', () => {
    service.create('Les Riffs').subscribe();
    const create = http.expectOne('/api/groups');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Les Riffs' });

    service.join('AB23CD').subscribe();
    expect(http.expectOne('/api/groups/join').request.body).toEqual({ code: 'AB23CD' });
  });

  it('lit le flux du salon au fil de l’eau, message par message', () => {
    const states: LiveState[] = [];
    service.live('g1').subscribe((state) => states.push(state));
    const request = http.expectOne('/api/groups/g1/live');
    expect(request.request.responseType).toBe('text');

    const first = 'data: {"state":"lobby","bandScore":0}\n\n';
    const second = 'data: {"state":"playing","bandScore":0}\n\n';
    // Le premier message arrive en deux morceaux : rien n'est émis tant qu'il est incomplet.
    request.event({ type: HttpEventType.DownloadProgress, loaded: 10, partialText: first.slice(0, 15) });
    expect(states).toEqual([]);
    request.event({ type: HttpEventType.DownloadProgress, loaded: 40, partialText: first + ': ping\n\n' });
    request.event({ type: HttpEventType.DownloadProgress, loaded: 90, partialText: first + ': ping\n\n' + second });

    expect(states.map((s) => s.state)).toEqual(['lobby', 'playing']);
  });

  it('envoie les actions du salon', () => {
    service.setPlayer('g1', { instrument: 'bass', difficulty: 'hard', ready: true }).subscribe();
    expect(http.expectOne('/api/groups/g1/live/player').request.body).toEqual({ instrument: 'bass', difficulty: 'hard', ready: true });

    service.reportScore('g1', { score: 1200, combo: 14, done: false }).subscribe();
    expect(http.expectOne('/api/groups/g1/live/score').request.method).toBe('POST');
  });
});
