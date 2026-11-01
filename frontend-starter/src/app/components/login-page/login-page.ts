import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly loading = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('demo@example.com', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('Demo1234!', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.loading.set(true);
    const values = this.form.getRawValue();
    this.auth.login(values.email, values.password).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl('/tracks');
      },
      error: (error: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(error.error?.message ?? 'Erreur de connexion');
      },
    });
  }
}
