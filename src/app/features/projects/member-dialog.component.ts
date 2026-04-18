import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface MemberDialogData {
  projectId: string;
}

export interface MemberDialogResult {
  email: string;
}

@Component({
  selector: 'app-member-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add member</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>Email address</mat-label>
          <input
            matInput
            type="email"
            formControlName="email"
            autocomplete="email"
            required
          />
          @if (form.controls.email.hasError('required') && form.controls.email.touched) {
            <mat-error>Email is required.</mat-error>
          }
          @if (form.controls.email.hasError('email')) {
            <mat-error>Enter a valid email.</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()" [disabled]="saving()">
        Cancel
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || saving()"
        (click)="save()"
      >
        @if (saving()) {
          <mat-spinner diameter="18" />
        } @else {
          Add
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form { min-width: 320px; }
    mat-form-field { width: 100%; }
  `,
})
export class MemberDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef =
    inject<MatDialogRef<MemberDialogComponent, MemberDialogResult>>(MatDialogRef);

  readonly data = inject<MemberDialogData>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.dialogRef.close({ email: this.form.getRawValue().email.trim() });
  }
}
