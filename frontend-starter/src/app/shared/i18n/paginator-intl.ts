import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/** Traduction française des libellés du Paginator Angular Material. */
@Injectable()
export class FrenchPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Pistes par page :';
  override nextPageLabel = 'Page suivante';
  override previousPageLabel = 'Page précédente';
  override firstPageLabel = 'Première page';
  override lastPageLabel = 'Dernière page';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0) return '0 sur 0';
    const start = page * pageSize + 1;
    const end = Math.min(start + pageSize - 1, length);
    return `${start} – ${end} sur ${length}`;
  };
}
