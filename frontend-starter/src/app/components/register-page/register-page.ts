import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly loading = signal(false);
  
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.loading.set(true);
    const values = this.form.getRawValue();
    this.auth.register(values.name, values.email, values.password).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl('/profile');
      },
      error: (error: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(error.error?.message ?? 'Erreur d’inscription');
      },
    });
  }
}
