import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
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
import { MatSelectModule } from '@angular/material/select';
import { collection, collectionData, Firestore, query, where } from '@angular/fire/firestore';
import { map, Observable, of, take } from 'rxjs';
import { Project, ProjectStatus } from '../../core/models/project.model';

export interface ProjectDialogData {
  ownerId: string;
  project?: Project;
}

export interface ProjectDialogResult {
  title: string;
  description: string;
  status: ProjectStatus;
}

@Component({
  selector: 'app-project-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.project ? 'Edit project' : 'New project' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>Title</mat-label>
          <input matInput formControlName="title" required maxlength="120" />
          @if (form.controls.title.hasError('required') && form.controls.title.touched) {
            <mat-error>Title is required.</mat-error>
          }
          @if (form.controls.title.hasError('minlength')) {
            <mat-error>At least 3 characters.</mat-error>
          }
          @if (form.controls.title.hasError('duplicate')) {
            <mat-error>You already own a project with this title.</mat-error>
          }
          @if (form.controls.title.pending) {
            <mat-hint>Checking for duplicates…</mat-hint>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea matInput rows="4" formControlName="description" maxlength="2000"></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option value="active">Active</mat-option>
            <mat-option value="archived">Archived</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || form.pending || saving()"
        (click)="save()"
      >
        {{ data.project ? 'Save' : 'Create' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 340px;
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class ProjectDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly firestore = inject(Firestore);
  private readonly dialogRef =
    inject<MatDialogRef<ProjectDialogComponent, ProjectDialogResult>>(MatDialogRef);

  readonly data = inject<ProjectDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    title: [
      this.data.project?.title ?? '',
      {
        validators: [Validators.required, Validators.minLength(3)],
        asyncValidators: [
          duplicateTitleValidator(this.firestore, this.data.ownerId, this.data.project?.id),
        ],
        updateOn: 'blur',
      },
    ],
    description: [this.data.project?.description ?? ''],
    status: [(this.data.project?.status ?? 'active') as ProjectStatus, Validators.required],
  });

  cancel(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.form.invalid || this.form.pending) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    this.dialogRef.close({
      title: v.title.trim(),
      description: v.description.trim(),
      status: v.status,
    });
  }
}

function duplicateTitleValidator(
  firestore: Firestore,
  ownerId: string,
  ignoreProjectId?: string,
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const value = (control.value ?? '').toString().trim();
    if (!value) return of(null);
    const projectsCol = collection(firestore, 'projects');
    const q = query(projectsCol, where('ownerId', '==', ownerId), where('title', '==', value));
    return (collectionData(q, { idField: 'id' }) as Observable<Project[]>).pipe(
      take(1),
      map((results) => {
        const conflict = results.some((p) => p.id !== ignoreProjectId);
        return conflict ? { duplicate: true } : null;
      }),
    );
  };
}
