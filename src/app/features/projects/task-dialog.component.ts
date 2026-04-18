import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import {
  collection,
  collectionData,
  Firestore,
  query,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { map, Observable, of, take } from 'rxjs';
import { TaskItem, TaskPriority, TaskStatus } from '../../core/models/task.model';
import { AppUser } from '../../core/models/user.model';

export interface TaskDialogData {
  projectId: string;
  task?: TaskItem;
  members: AppUser[];
}

export interface TaskDialogResult {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  tags: string[];
  dueDate: Timestamp | null;
}

@Component({
  selector: 'app-task-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.task ? 'Edit task' : 'New task' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>Title</mat-label>
          <input matInput formControlName="title" required maxlength="120" />
          @if (form.controls.title.hasError('required') && form.controls.title.touched) {
            <mat-error>Title is required.</mat-error>
          }
          @if (form.controls.title.hasError('duplicate')) {
            <mat-error>A task with this title already exists.</mat-error>
          }
          @if (form.controls.title.pending) {
            <mat-hint>Checking…</mat-hint>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea matInput rows="3" formControlName="description" maxlength="2000"></textarea>
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Status</mat-label>
            <mat-select formControlName="status">
              <mat-option value="open">Open</mat-option>
              <mat-option value="in-progress">In progress</mat-option>
              <mat-option value="done">Done</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Priority</mat-label>
            <mat-select formControlName="priority">
              <mat-option value="low">Low</mat-option>
              <mat-option value="medium">Medium</mat-option>
              <mat-option value="high">High</mat-option>
              <mat-option value="critical">Critical</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Assignee</mat-label>
            <mat-select formControlName="assigneeId">
              <mat-option [value]="null">Unassigned</mat-option>
              @for (m of data.members; track m.uid) {
                <mat-option [value]="m.uid">{{ m.displayName || m.email }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Due date</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="dueDate" />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Tags</mat-label>
          <mat-chip-grid #chipGrid aria-label="Task tags">
            @for (tag of tags(); track tag) {
              <mat-chip-row (removed)="removeTag(tag)">
                {{ tag }}
                <button matChipRemove type="button" [attr.aria-label]="'Remove tag ' + tag">
                  <mat-icon>cancel</mat-icon>
                </button>
              </mat-chip-row>
            }
            <input
              placeholder="Add tag"
              [matChipInputFor]="chipGrid"
              [matChipInputSeparatorKeyCodes]="separatorKeys"
              (matChipInputTokenEnd)="addTag($event)"
            />
          </mat-chip-grid>
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
        {{ data.task ? 'Save' : 'Create' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 420px;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row mat-form-field {
      flex: 1;
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class TaskDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly firestore = inject(Firestore);
  private readonly dialogRef =
    inject<MatDialogRef<TaskDialogComponent, TaskDialogResult>>(MatDialogRef);

  readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);

  protected readonly separatorKeys = [ENTER, COMMA];
  protected readonly saving = signal(false);
  protected readonly tags = signal<string[]>(this.data.task?.tags ?? []);

  readonly form = this.fb.nonNullable.group({
    title: [
      this.data.task?.title ?? '',
      {
        validators: [Validators.required],
        asyncValidators: [
          duplicateTaskTitleValidator(this.firestore, this.data.projectId, this.data.task?.id),
        ],
        updateOn: 'blur',
      },
    ],
    description: [this.data.task?.description ?? ''],
    status: [(this.data.task?.status ?? 'open') as TaskStatus, Validators.required],
    priority: [(this.data.task?.priority ?? 'medium') as TaskPriority, Validators.required],
    assigneeId: [this.data.task?.assigneeId ?? (null as string | null)],
    dueDate: [this.data.task?.dueDate?.toDate() ?? (null as Date | null)],
  });

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && !this.tags().includes(value)) {
      this.tags.update((list) => [...list, value]);
    }
    event.chipInput?.clear();
  }

  removeTag(tag: string): void {
    this.tags.update((list) => list.filter((t) => t !== tag));
  }

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
      priority: v.priority,
      assigneeId: v.assigneeId,
      dueDate: v.dueDate ? Timestamp.fromDate(v.dueDate) : null,
      tags: this.tags(),
    });
  }
}

function duplicateTaskTitleValidator(
  firestore: Firestore,
  projectId: string,
  ignoreTaskId?: string,
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const value = (control.value ?? '').toString().trim();
    if (!value) return of(null);
    const tasksCol = collection(firestore, `projects/${projectId}/tasks`);
    const q = query(tasksCol, where('title', '==', value));
    return (collectionData(q, { idField: 'id' }) as Observable<{ id: string }[]>).pipe(
      take(1),
      map((results) => {
        const conflict = results.some((t) => t.id !== ignoreTaskId);
        return conflict ? { duplicate: true } : null;
      }),
    );
  };
}
