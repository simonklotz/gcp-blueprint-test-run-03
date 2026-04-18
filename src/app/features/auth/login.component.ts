import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth-shell">
      <mat-card class="auth-card" appearance="outlined">
        <mat-card-header>
          <mat-card-title>Sign in</mat-card-title>
          <mat-card-subtitle>Project Tracker Pro</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" required />
              @if (form.controls.email.hasError('required') && form.controls.email.touched) {
                <mat-error>Email is required.</mat-error>
              }
              @if (form.controls.email.hasError('email')) {
                <mat-error>Enter a valid email.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Password</mat-label>
              <input
                matInput
                type="password"
                formControlName="password"
                autocomplete="current-password"
                required
              />
              @if (form.controls.password.hasError('required') && form.controls.password.touched) {
                <mat-error>Password is required.</mat-error>
              }
            </mat-form-field>

            <div class="actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner diameter="18" />
                } @else {
                  Sign in
                }
              </button>
              <button
                mat-stroked-button
                type="button"
                (click)="loginWithGoogle()"
                [disabled]="loading()"
              >
                <mat-icon>account_circle</mat-icon>
                Continue with Google
              </button>
            </div>
          </form>
        </mat-card-content>
        <mat-card-actions align="end">
          <span class="link-hint">No account?</span>
          <a mat-button routerLink="/register">Create one</a>
        </mat-card-actions>
      </mat-card>
    </main>
  `,
  styles: `
    .auth-shell {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      background-color: var(--mat-sys-surface-container-lowest);
    }
    .auth-card {
      width: 100%;
      max-width: 420px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    mat-form-field {
      width: 100%;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .link-hint {
      color: var(--mat-sys-on-surface-variant);
      margin-right: 4px;
      align-self: center;
    }
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    try {
      await this.auth.login(email, password);
      this.snackbar.open('Welcome back!', 'Close', { duration: 2000 });
      this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.snackbar.open(this.describe(err), 'Dismiss', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.loading.set(true);
    try {
      await this.auth.loginWithGoogle();
      this.snackbar.open('Signed in with Google.', 'Close', { duration: 2000 });
      this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.snackbar.open(this.describe(err), 'Dismiss', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  private describe(err: unknown): string {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'Invalid email or password.';
        case 'auth/too-many-requests':
          return 'Too many attempts. Try again later.';
        default:
          return err.message;
      }
    }
    return 'Something went wrong. Please try again.';
  }
}
