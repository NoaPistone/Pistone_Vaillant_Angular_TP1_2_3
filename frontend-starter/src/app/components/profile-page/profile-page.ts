import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    this.load();
  }

  load(): void {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    this.auth.profile().subscribe({
      next: (user) => {
        this.form.setValue({ name: user.name });
        this.loading.set(false);
      },
      error: (error: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(error.error?.message ?? 'Profil impossible à charger');
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set('');
    this.saving.set(true);
    this.auth.update(this.form.getRawValue().name).subscribe({
      next: () => this.saving.set(false),
      error: (error: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(error.error?.message ?? 'Profil impossible à enregistrer');
      },
    });
  }
}
