import { Pipe, PipeTransform } from '@angular/core';

/**
 * Affiche une taille en octets sous une forme lisible : `512 o`, `3.4 Ko`, `4.2 Mo`.
 * Le backend conserve `size` en octets (`req.file.size` de Multer).
 * Pipe pur : Angular ne recalcule la valeur que si l'entrée change.
 */
@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(size: number): string {
    if (size < 1024) return `${size} o`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
    return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
  }
}
