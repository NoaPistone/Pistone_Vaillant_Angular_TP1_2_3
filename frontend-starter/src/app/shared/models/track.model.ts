/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  /** Facultatif : absent des pistes importées avant l'ajout du champ. */
  description?: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
