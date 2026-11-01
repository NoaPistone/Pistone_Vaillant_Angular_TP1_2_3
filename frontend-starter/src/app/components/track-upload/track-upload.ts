import { Component, computed, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { UploadState } from '../../shared/models/upload-event.model';
import { TrackService } from '../../shared/services/track.service';
import { validateAudioFile } from '../../shared/utils/audio-file';
import { httpErrorMessage } from '../../shared/utils/http-error';

/**
 * Formulaire d'import d'une piste avec suivi de progression.
 * Flux : formulaire → TrackService.upload() → HttpClient → événements de progression.
 * Le composant émet `uploaded` après un `201` pour que la page recharge la liste.
 */
@Component({
  selector: 'app-track-upload',
  imports: [ReactiveFormsModule],
  templateUrl: './track-upload.html',
  styleUrl: './track-upload.css',
})
export class TrackUploadComponent {
  private readonly service = inject(TrackService);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly uploaded = output<Track>();

  readonly title = new FormControl('', { nonNullable: true });
  readonly file = signal<File | null>(null);
  readonly state = signal<UploadState>({ status: 'idle' });

  // Valeurs dérivées de l'union `state` : le template reste simple et typé.
  readonly uploading = computed(() => this.state().status === 'uploading');
  readonly percent = computed(() => {
    const state = this.state();
    return state.status === 'uploading' ? state.percent : 0;
  });
  /** 100 % envoyé mais pas encore de réponse : le serveur écrit le fichier et la métadonnée. */
  readonly processing = computed(() => this.uploading() && this.percent() === 100);
  readonly successTitle = computed(() => {
    const state = this.state();
    return state.status === 'success' ? state.track.title : '';
  });
  readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  });

  choose(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    // Un nouveau choix efface l'ancien succès/erreur, mais on valide tout de suite
    // pour afficher le problème avant même le clic sur « Envoyer ».
    const problem = file ? validateAudioFile(file) : null;
    this.state.set(problem ? { status: 'error', message: problem } : { status: 'idle' });
  }

  upload(): void {
    const file = this.file();
    // Garde anti double-soumission : le bouton est désactivé, mais on protège aussi la méthode.
    if (!file || this.uploading()) return;

    const problem = validateAudioFile(file);
    if (problem) {
      this.state.set({ status: 'error', message: problem });
      return;
    }

    this.state.set({ status: 'uploading', percent: 0 });
    this.title.disable();
    this.service.upload(file, this.title.value || file.name).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.state.set({ status: 'uploading', percent: event.percent });
          return;
        }
        this.state.set({ status: 'success', track: event.track });
        this.reset();
        this.uploaded.emit(event.track);
      },
      error: (error: unknown) => {
        this.title.enable();
        this.state.set({ status: 'error', message: httpErrorMessage(error, 'Envoi impossible') });
      },
    });
  }

  /** Vide le formulaire, y compris l'<input type="file"> natif qui garde sinon son fichier. */
  private reset(): void {
    this.title.enable();
    this.title.setValue('');
    this.file.set(null);
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }
}
