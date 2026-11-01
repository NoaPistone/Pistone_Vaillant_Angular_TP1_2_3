import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { AvatarBadgeComponent } from '../avatar-badge/avatar-badge';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AvatarBadgeComponent, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // Après un rechargement de page, seul le jeton est conservé : on relit le profil
    // pour afficher l'avatar et le solde dans la barre du haut.
    if (this.auth.token()) this.auth.profile().subscribe({ error: () => undefined });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
