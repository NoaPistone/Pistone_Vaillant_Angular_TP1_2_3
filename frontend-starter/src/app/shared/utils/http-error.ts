import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extrait un message compréhensible d'une erreur HTTP.
 * - statut `0` : le navigateur n'a obtenu aucune réponse (backend arrêté, réseau coupé) ;
 * - sinon : on privilégie le champ `message` renvoyé par l'API Express ;
 * - à défaut : on affiche le message de repli fourni par l'appelant.
 */
export function httpErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Serveur injoignable. Vérifiez que le backend est lancé.';
    const body: unknown = error.error;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return fallback;
}
