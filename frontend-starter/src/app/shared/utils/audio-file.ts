/**
 * Règles de validation d'un fichier audio, alignées sur le backend
 * (`backend/src/app.js` : ensemble `allowed` et `MAX_FILE_SIZE`).
 *
 * Cette validation frontend évite un aller-retour inutile et donne un message
 * immédiat. Elle ne remplace jamais la validation Multer côté serveur : un
 * client peut toujours contourner Angular et appeler l'API directement.
 */
export const ALLOWED_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

/** Taille maximale acceptée par le backend : 25 Mo. */
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

/** Retourne un message d'erreur lisible, ou `null` si le fichier est acceptable. */
export function validateAudioFile(file: File): string | null {
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
    return 'Format refusé. Utilisez un fichier MP3, WAV, OGG ou M4A.';
  }
  if (file.size > MAX_AUDIO_SIZE) {
    return 'Le fichier ne doit pas dépasser 25 Mo.';
  }
  return null;
}

/** Traduit un type MIME en libellé court affiché dans les cards. */
export function audioFormatLabel(mimeType: string): string {
  switch (mimeType) {
    case 'audio/mpeg':
      return 'MP3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'WAV';
    case 'audio/ogg':
      return 'OGG';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'M4A';
    default:
      return mimeType;
  }
}
