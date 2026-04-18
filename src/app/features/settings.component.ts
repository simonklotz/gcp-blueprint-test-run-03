import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { UserService } from '../core/services/user.service';

interface ProfileForm {
  displayName: string;
  photoURL: string;
}

@Component({
  selector: 'app-settings',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Settings</h1>
    </header>

    <div class="grid">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>Profile</mat-card-title>
          <mat-card-subtitle>Update your public display info.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form #profileForm="ngForm" (ngSubmit)="save(profileForm)" class="form" novalidate>
            <mat-form-field appearance="outline">
              <mat-label>Display name</mat-label>
              <input
                matInput
                name="displayName"
                [ngModel]="model().displayName"
                (ngModelChange)="updateField('displayName', $event)"
                #displayName="ngModel"
                required
                minlength="2"
                maxlength="60"
              />
              @if (displayName.invalid && displayName.touched) {
                @if (displayName.hasError('required')) {
                  <mat-error>Display name is required.</mat-error>
                }
                @if (displayName.hasError('minlength')) {
                  <mat-error>At least 2 characters.</mat-error>
                }
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Photo URL</mat-label>
              <input
                matInput
                name="photoURL"
                [ngModel]="model().photoURL"
                (ngModelChange)="updateField('photoURL', $event)"
                type="url"
              />
              <mat-hint>Optional link to a profile picture.</mat-hint>
            </mat-form-field>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="profileForm.invalid || saving() || !dirty()"
              >
                Save changes
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>Appearance</mat-card-title>
          <mat-card-subtitle>Choose your preferred theme.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="theme-row">
          <mat-slide-toggle [checked]="darkMode()" (change)="theme.set($event.checked)">
            Dark mode
          </mat-slide-toggle>
          <p class="hint">
            <mat-icon>{{ darkMode() ? 'dark_mode' : 'light_mode' }}</mat-icon>
            {{ darkMode() ? 'Dark theme is active.' : 'Light theme is active.' }}
          </p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    mat-form-field {
      width: 100%;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }
    .theme-row {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .hint {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
  `,
})
export class SettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly snackbar = inject(MatSnackBar);
  protected readonly theme = inject(ThemeService);

  protected readonly darkMode = this.theme.darkMode;
  protected readonly saving = signal(false);

  private readonly initial = signal<ProfileForm>({
    displayName: '',
    photoURL: '',
  });

  protected readonly model = signal<ProfileForm>({
    displayName: '',
    photoURL: '',
  });

  protected readonly dirty = computed(() => {
    const a = this.initial();
    const b = this.model();
    return a.displayName !== b.displayName || a.photoURL !== b.photoURL;
  });

  constructor() {
    effect(() => {
      const profile = this.auth.userProfile();
      if (!profile) return;
      const next: ProfileForm = {
        displayName: profile.displayName ?? '',
        photoURL: profile.photoURL ?? '',
      };
      this.initial.set(next);
      this.model.set(next);
    });
  }

  updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]): void {
    this.model.update((m) => ({ ...m, [key]: value }));
  }

  async save(form: NgForm): Promise<void> {
    const user = this.auth.currentUser();
    if (!user || form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const { displayName, photoURL } = this.model();
      await this.users.updateProfile(user.uid, {
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || null,
      });
      this.initial.set({ ...this.model() });
      this.snackbar.open('Profile updated.', 'Close', { duration: 2000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save.';
      this.snackbar.open(message, 'Dismiss', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
