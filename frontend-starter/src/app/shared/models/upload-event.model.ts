import { Track } from './track.model';

/**
 * Événement métier émis par `TrackService.upload()`.
 * Le service traduit les nombreux `HttpEvent` Angular en deux cas utiles à l'interface :
 * - `progress` : une partie du fichier a été envoyée (pourcentage de 0 à 100) ;
 * - `done` : le serveur a répondu `201` avec la piste créée.
 */
export type UploadEvent =
  | { type: 'progress'; percent: number }
  | { type: 'done'; track: Track };

/**
 * État affiché par le formulaire d'upload. Une union discriminée par `status`
 * garantit qu'un pourcentage n'existe que pendant l'envoi et qu'un message
 * d'erreur n'existe qu'en cas d'échec.
 */
export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; percent: number }
  | { status: 'success'; track: Track }
  | { status: 'error'; message: string };
