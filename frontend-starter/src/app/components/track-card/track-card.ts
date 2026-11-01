import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { FileSizePipe } from '../../shared/pipes/file-size.pipe';
import { audioFormatLabel } from '../../shared/utils/audio-file';

/** Champs modifiables après l'import, envoyés tels quels au `PATCH`. */
export type TrackChanges = Pick<Track, 'title' | 'description'>;

/**
 * Card de présentation d'une piste.
 * Composant « présentationnel » : il ne connaît ni HttpClient ni TrackService.
 * Il reçoit des données par `input()` et signale les actions par `output()` ;
 * c'est la page parente qui décide quoi faire (lecture, modification, suppression).
 * « Supprimer » est rangé dans le formulaire « Modifier » : moins de boutons sur chaque carte.
 */
@Component({
  selector: 'app-track-card',
  imports: [DatePipe, FileSizePipe, ReactiveFormsModule],
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
  /**
   * Vrai quand la page a ouvert le formulaire de cette piste. C'est la page qui le
   * referme, uniquement après la réponse du serveur : en cas d'erreur, la saisie est conservée.
   */
  readonly editing = input(false);
  /** Vrai pendant la requête PATCH de cette piste. */
  readonly saving = input(false);

  readonly play = output<Track>();
  readonly remove = output<Track>();
  readonly edit = output<Track>();
  readonly cancelEdit = output<void>();
  readonly save = output<{ track: Track; changes: TrackChanges }>();

  /** `pattern(/\S/)` refuse un titre fait uniquement d'espaces, que `required` laisse passer. */
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  readonly format = computed(() => audioFormatLabel(this.track().mimeType));
  readonly busy = computed(() => this.disabled() || this.deleting() || this.loadingAudio());

  /** Pré-remplit le formulaire avec les valeurs actuelles avant de demander son ouverture. */
  startEdit(): void {
    this.form.reset({ title: this.track().title, description: this.track().description ?? '' });
    this.edit.emit(this.track());
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, description } = this.form.getRawValue();
    this.save.emit({ track: this.track(), changes: { title: title.trim(), description: description.trim() } });
  }
}
