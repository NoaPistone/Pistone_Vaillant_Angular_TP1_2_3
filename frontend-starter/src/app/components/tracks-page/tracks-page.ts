import { Component, inject, OnDestroy, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { httpErrorMessage } from '../../shared/utils/http-error';
import { TrackCardComponent } from '../track-card/track-card';
import { TrackUploadComponent } from '../track-upload/track-upload';

/**
 * Page « Backing tracks » : orchestre la bibliothèque paginée, la lecture et la suppression.
 * Toutes les requêtes passent par TrackService ; ce composant ne manipule que des Signals.
 */
@Component({
  imports: [MatPaginatorModule, TrackCardComponent, TrackUploadComponent],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly snackBar = inject(MatSnackBar);
  private listSubscription?: Subscription;

  // État de la bibliothèque (pagination serveur).
  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly limit = signal(5);
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');

  // État des actions sur une piste : l'id permet de n'animer que la card concernée.
  readonly deletingId = signal<string | null>(null);
  readonly loadingAudioId = signal<string | null>(null);

  // Lecteur audio.
  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly audioError = signal('');

  constructor() {
    this.load();
  }

  /**
   * Charge la page courante depuis le serveur.
   * Si une requête précédente est encore en cours (clics rapides sur « Suivant »),
   * elle est annulée : seule la dernière page demandée est affichée.
   */
  load(): void {
    this.listSubscription?.unsubscribe();
    this.error.set('');
    this.loading.set(true);
    this.listSubscription = this.service.list(this.page(), this.limit()).subscribe({
      next: (response) => {
        // Page devenue vide (dernière piste supprimée, ici ou dans un autre onglet) :
        // on revient à la dernière page existante au lieu d'afficher « Aucune piste ».
        if (response.items.length === 0 && response.total > 0 && this.page() > response.pages) {
          this.go(response.pages);
          return;
        }
        this.tracks.set(response.items);
        this.total.set(response.total);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(httpErrorMessage(error, 'Bibliothèque impossible à charger'));
      },
    });
  }

  go(page: number): void {
    this.page.set(page);
    this.load();
  }

  /** Événement du Paginator Material : `pageIndex` commence à 0, l'API à 1. */
  onPage(event: PageEvent): void {
    this.limit.set(event.pageSize);
    this.go(event.pageIndex + 1);
  }

  /** Après un upload réussi, la nouvelle piste (la plus récente) est en page 1. */
  onUploaded(): void {
    this.go(1);
  }

  play(track: Track): void {
    if (this.loadingAudioId()) return;
    this.audioError.set('');
    this.loadingAudioId.set(track.id);
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        this.loadingAudioId.set(null);
        // L'ancienne ObjectURL est libérée avant d'en créer une nouvelle.
        this.releaseAudio();
        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTrack.set(track);
      },
      error: (error: unknown) => {
        this.loadingAudioId.set(null);
        // Avec responseType 'blob', le corps d'erreur est aussi un Blob : on s'appuie sur le statut.
        this.audioError.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'Piste introuvable : elle a peut-être été supprimée.'
            : httpErrorMessage(error, 'Lecture audio impossible'),
        );
      },
    });
  }

  /** Erreur du lecteur <audio> lui-même (fichier corrompu, codec non supporté…). */
  onAudioError(): void {
    this.audioError.set('Le navigateur ne peut pas lire ce fichier (format non supporté ou fichier corrompu).');
  }

  remove(track: Track): void {
    if (this.deletingId()) return;
    if (!window.confirm(`Supprimer « ${track.title} » ? Cette action est définitive.`)) return;

    this.deletingId.set(track.id);
    this.service.remove(track.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        if (this.currentTrack()?.id === track.id) this.stopPlayer();
        this.notify(`Piste « ${track.title} » supprimée.`);
        this.load();
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        // 401 : l'intercepteur a déjà déconnecté l'utilisateur et redirigé vers /login.
        if (status === 401) return;
        this.notify(
          status === 404
            ? 'Cette piste n’existe plus ou ne vous appartient pas. La liste a été actualisée.'
            : httpErrorMessage(error, 'Suppression impossible'),
        );
        // L'affichage n'est plus fiable : on resynchronise avec le serveur.
        this.load();
      },
    });
  }

  ngOnDestroy(): void {
    this.listSubscription?.unsubscribe();
    this.releaseAudio();
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Fermer', { duration: 5000 });
  }

  private stopPlayer(): void {
    this.releaseAudio();
    this.audioUrl.set('');
    this.currentTrack.set(null);
  }

  /** Une ObjectURL garde le Blob en mémoire tant qu'elle n'est pas révoquée. */
  private releaseAudio(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
  }
}
