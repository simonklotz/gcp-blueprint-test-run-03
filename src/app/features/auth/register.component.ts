import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth-shell">
      <mat-card class="auth-card" appearance="outlined">
        <mat-card-header>
          <mat-card-title>Create account</mat-card-title>
          <mat-card-subtitle>Project Tracker Pro</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <mat-form-field appearance="outline">
              <mat-label>Display name</mat-label>
              <input matInput formControlName="displayName" required />
              @if (
                form.controls.displayName.hasError('required') && form.controls.displayName.touched
              ) {
                <mat-error>Display name is required.</mat-error>
              }
            </mat-form-field>

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
                autocomplete="new-password"
                required
              />
              @if (form.controls.password.hasError('required') && form.controls.password.touched) {
                <mat-error>Password is required.</mat-error>
              }
              @if (form.controls.password.hasError('minlength')) {
                <mat-error>At least 8 characters.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Confirm password</mat-label>
              <input
                matInput
                type="password"
                formControlName="confirmPassword"
                autocomplete="new-password"
                required
              />
              @if (form.hasError('mismatch') && form.controls.confirmPassword.touched) {
                <mat-error>Passwords must match.</mat-error>
              }
            </mat-form-field>

            <div class="actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner diameter="18" />
                } @else {
                  Create account
                }
              </button>
            </div>
          </form>
        </mat-card-content>
        <mat-card-actions align="end">
          <span class="link-hint">Already registered?</span>
          <a mat-button routerLink="/login">Sign in</a>
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
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [matchPasswords] },
  );

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const { displayName, email, password } = this.form.getRawValue();
    this.loading.set(true);
    try {
      await this.auth.register(email, password, displayName);
      this.snackbar.open('Account created. Welcome!', 'Close', { duration: 2000 });
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
        case 'auth/email-already-in-use':
          return 'This email is already registered.';
        case 'auth/weak-password':
          return 'Password is too weak.';
        default:
          return err.message;
      }
    }
    return 'Something went wrong. Please try again.';
  }
}

function matchPasswords(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}
