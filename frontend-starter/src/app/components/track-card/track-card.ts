import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Track } from '../../shared/models/track.model';
import { FileSizePipe } from '../../shared/pipes/file-size.pipe';
import { audioFormatLabel } from '../../shared/utils/audio-file';

/**
 * Card de présentation d'une piste.
 * Composant « présentationnel » : il ne connaît ni HttpClient ni TrackService.
 * Il reçoit des données par `input()` et signale les actions par `output()` ;
 * c'est la page parente qui décide quoi faire (lecture, suppression).
 */
@Component({
  selector: 'app-track-card',
  imports: [DatePipe, FileSizePipe],
  templateUrl: './track-card.html',
  styleUrl: './track-card.css',
})
export class TrackCardComponent {
  readonly track = input.required<Track>();
  /** Vrai si cette piste est celle chargée dans le lecteur. */
  readonly current = input(false);
  /** Vrai pendant le téléchargement du Blob audio de cette piste. */
  readonly loadingAudio = input(false);
  /** Vrai pendant la requête DELETE de cette piste. */
  readonly deleting = input(false);
  /** Vrai quand une autre action globale empêche d'agir (ex. autre suppression). */
  readonly disabled = input(false);

  readonly play = output<Track>();
  readonly remove = output<Track>();

  readonly format = computed(() => audioFormatLabel(this.track().mimeType));
  readonly busy = computed(() => this.disabled() || this.deleting() || this.loadingAudio());
}
