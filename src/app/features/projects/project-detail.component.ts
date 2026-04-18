import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { combineLatest, Observable, of, switchMap } from 'rxjs';
import { Project } from '../../core/models/project.model';
import { TaskItem, TaskStatus } from '../../core/models/task.model';
import { AppUser } from '../../core/models/user.model';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { UserService } from '../../core/services/user.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PriorityBadgeDirective } from '../../shared/directives/priority-badge.directive';
import {
  ProjectDialogComponent,
  ProjectDialogData,
  ProjectDialogResult,
} from './project-dialog.component';
import { TaskDialogComponent, TaskDialogData, TaskDialogResult } from './task-dialog.component';
import {
  MemberDialogComponent,
  MemberDialogData,
  MemberDialogResult,
} from './member-dialog.component';
import { ActivityLogComponent } from './activity-log.component';
import { initialsFrom } from '../../shared/utils/initials-from';

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskItem['priority'];
  assigneeName: string;
  dueDate: Date | null;
  raw: TaskItem;
}

@Component({
  selector: 'app-project-detail',
  imports: [
    CommonModule,
    DatePipe,
    TitleCasePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
    PriorityBadgeDirective,
    ActivityLogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!project(); as _none) {
      <div class="loading-state">
        <mat-spinner diameter="36" />
        <span>Loading project…</span>
      </div>
    } @else {
      @let p = project()!;
      <header class="page-header">
        <div class="titles">
          <a
            mat-icon-button
            href="#"
            aria-label="Back to projects"
            (click)="back($event)"
            (keyup.enter)="back($event)"
          >
            <mat-icon>arrow_back</mat-icon>
          </a>
          <div>
            <h1>{{ p.title }}</h1>
            <p class="subtitle">{{ p.description || 'No description.' }}</p>
          </div>
        </div>
        <div class="header-actions">
          <mat-chip [disabled]="true" [color]="p.status === 'active' ? 'primary' : undefined">
            {{ p.status | titlecase }}
          </mat-chip>
          @if (isOwner()) {
            <button mat-stroked-button type="button" (click)="editProject()">
              <mat-icon>edit</mat-icon>
              Edit
            </button>
          }
        </div>
      </header>

      <mat-tab-group animationDuration="150ms">
        <mat-tab label="Tasks">
          <section class="tab-panel">
            <div class="filters">
              <mat-chip-listbox
                [multiple]="false"
                [value]="statusFilter()"
                aria-label="Filter by status"
                (change)="onStatusFilterChange($event.value)"
              >
                <mat-chip-option value="all">All</mat-chip-option>
                <mat-chip-option value="open">Open</mat-chip-option>
                <mat-chip-option value="in-progress">In progress</mat-chip-option>
                <mat-chip-option value="done">Done</mat-chip-option>
              </mat-chip-listbox>
              <mat-form-field appearance="outline" class="assignee-filter">
                <mat-label>Assignee</mat-label>
                <mat-select [value]="assigneeFilter()" (valueChange)="assigneeFilter.set($event)">
                  <mat-option value="all">Anyone</mat-option>
                  <mat-option [value]="null">Unassigned</mat-option>
                  @for (m of members(); track m.uid) {
                    <mat-option [value]="m.uid">{{ m.displayName || m.email }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <span class="spacer"></span>
              <button mat-flat-button color="primary" type="button" (click)="openCreateTask()">
                <mat-icon>add</mat-icon>
                Add task
              </button>
            </div>

            @if (tasksLoading()) {
              <div class="loading-state">
                <mat-spinner diameter="32" />
              </div>
            } @else if (taskRows().length === 0) {
              <div class="empty-state">
                <mat-icon>task_alt</mat-icon>
                <p>No tasks match the current filters.</p>
              </div>
            } @else {
              <div class="table-scroll">
                <table mat-table [dataSource]="tableSource" matSort class="mat-elevation-z0">
                  <ng-container matColumnDef="title">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>Title</th>
                    <td mat-cell *matCellDef="let row">{{ row.title }}</td>
                  </ng-container>

                  <ng-container matColumnDef="status">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
                    <td mat-cell *matCellDef="let row">{{ row.status | titlecase }}</td>
                  </ng-container>

                  <ng-container matColumnDef="priority">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>Priority</th>
                    <td mat-cell *matCellDef="let row">
                      <span [appPriorityBadge]="row.priority">
                        {{ row.priority }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="assignee">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>Assignee</th>
                    <td mat-cell *matCellDef="let row">{{ row.assigneeName }}</td>
                  </ng-container>

                  <ng-container matColumnDef="dueDate">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>Due</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.dueDate ? (row.dueDate | date: 'mediumDate') : '—' }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let row">
                      <button
                        mat-icon-button
                        type="button"
                        [attr.aria-label]="'Delete task ' + row.title"
                        (click)="deleteTask(row, $event)"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="columns"></tr>
                  <tr
                    mat-row
                    *matRowDef="let row; columns: columns"
                    class="clickable"
                    tabindex="0"
                    role="button"
                    [attr.aria-label]="'Edit task ' + row.title"
                    (click)="openEditTask(row)"
                    (keyup.enter)="openEditTask(row)"
                    (keyup.space)="openEditTask(row)"
                  ></tr>
                </table>
              </div>
            }
          </section>
        </mat-tab>

        <mat-tab label="Members">
          <section class="tab-panel">
            <div class="filters">
              <span class="counter">{{ members().length }} member(s)</span>
              <span class="spacer"></span>
              @if (isOwner()) {
                <button mat-flat-button color="primary" type="button" (click)="openAddMember()">
                  <mat-icon>person_add</mat-icon>
                  Add member
                </button>
              }
            </div>
            @if (members().length === 0) {
              <div class="empty-state">
                <mat-icon>group</mat-icon>
                <p>No members yet.</p>
              </div>
            } @else {
              <div class="member-list">
                @for (m of members(); track m.uid) {
                  <mat-card appearance="outlined" class="member-card">
                    <mat-card-content class="member">
                      <div class="avatar" aria-hidden="true">
                        {{ initials(m.displayName || m.email) }}
                      </div>
                      <div class="member-info">
                        <strong>{{ m.displayName || m.email }}</strong>
                        <small>{{ m.email }}</small>
                      </div>
                      <mat-chip [disabled]="true">
                        {{ m.uid === p.ownerId ? 'Owner' : (m.role | titlecase) }}
                      </mat-chip>
                      @if (isOwner() && m.uid !== p.ownerId) {
                        <button
                          mat-icon-button
                          type="button"
                          [attr.aria-label]="'Remove ' + (m.displayName || m.email)"
                          (click)="removeMember(m)"
                        >
                          <mat-icon>remove_circle_outline</mat-icon>
                        </button>
                      }
                    </mat-card-content>
                  </mat-card>
                }
              </div>
            }
          </section>
        </mat-tab>

        <mat-tab label="Activity">
          <section class="tab-panel">
            <app-activity-log [projectId]="p.id" />
          </section>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .titles {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .titles h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
    }
    .subtitle {
      margin: 4px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .tab-panel {
      padding: 16px 0;
    }
    .filters {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .spacer {
      flex: 1;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
    }
    tr.clickable {
      cursor: pointer;
    }
    tr.clickable:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -2px;
    }
    .assignee-filter {
      min-width: 200px;
    }
    .member-list {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }
    .member {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .member-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .member-info small {
      color: var(--mat-sys-on-surface-variant);
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--mat-sys-secondary);
      color: var(--mat-sys-on-secondary);
      display: grid;
      place-items: center;
      font-weight: 600;
    }
    .counter {
      color: var(--mat-sys-on-surface-variant);
    }
    .empty-state mat-icon,
    .loading-state mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      margin-bottom: 8px;
    }
  `,
})
export class ProjectDetailComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly projects = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly users = inject(UserService);
  private readonly functions = inject(Functions);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);

  /** Route param injected via withComponentInputBinding(). */
  readonly id = input.required<string>();

  initials = initialsFrom;

  protected readonly columns = ['title', 'status', 'priority', 'assignee', 'dueDate', 'actions'];

  // Status filter signal → observable → re-queried tasks stream.
  protected readonly statusFilter = signal<TaskStatus | 'all'>('all');
  protected readonly assigneeFilter = signal<string | null | 'all'>('all');

  private readonly projectId$ = toObservable(this.id);

  private readonly project$: Observable<Project | undefined> = this.projectId$.pipe(
    switchMap((id) => this.projects.getProject(id)),
  );

  protected readonly project = toSignal(this.project$, { initialValue: undefined });

  private readonly tasks$ = combineLatest([this.projectId$, toObservable(this.statusFilter)]).pipe(
    switchMap(([id, status]) =>
      id ? this.taskService.getTasksForProject(id, status) : of<TaskItem[]>([]),
    ),
  );

  protected readonly tasks = toSignal(this.tasks$, {
    initialValue: [] as TaskItem[],
  });

  protected readonly tasksLoading = signal(true);

  private readonly members$ = this.project$.pipe(
    switchMap((p) => {
      if (!p) return of<AppUser[]>([]);
      const ids = p.memberIds ?? [];
      if (ids.length === 0) return of<AppUser[]>([]);
      return combineLatest(ids.map((uid) => this.users.getUser(uid))).pipe(
        switchMap((docs) => of((docs as (AppUser | undefined)[]).filter((u): u is AppUser => !!u))),
      );
    }),
  );

  protected readonly members = toSignal(this.members$, {
    initialValue: [] as AppUser[],
  });

  private readonly memberMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const m of this.members()) {
      map[m.uid] = m.displayName || m.email;
    }
    return map;
  });

  protected readonly isOwner = computed(
    () => this.project()?.ownerId === this.auth.currentUser()?.uid,
  );

  protected readonly filteredTasks = computed<TaskItem[]>(() => {
    const assignee = this.assigneeFilter();
    const list = this.tasks();
    if (assignee === 'all') return list;
    return list.filter((t) => t.assigneeId === assignee);
  });

  protected readonly taskRows = computed<TaskRow[]>(() => {
    const map = this.memberMap();
    return this.filteredTasks().map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigneeName: t.assigneeId ? (map[t.assigneeId] ?? '…') : 'Unassigned',
      dueDate: t.dueDate?.toDate?.() ?? null,
      raw: t,
    }));
  });

  protected readonly tableSource = new MatTableDataSource<TaskRow>([]);
  private readonly sort = viewChild(MatSort);

  constructor() {
    effect(() => {
      this.tableSource.data = this.taskRows();
    });
    effect(() => {
      // loading resolves as soon as tasks emit (even empty).
      this.tasks();
      this.tasksLoading.set(false);
    });
    // Keep member map subscription alive.
    this.members$.pipe(takeUntilDestroyed()).subscribe();
  }

  ngAfterViewInit(): void {
    const sort = this.sort();
    if (sort) this.tableSource.sort = sort;
  }

  onStatusFilterChange(value: TaskStatus | 'all'): void {
    this.statusFilter.set(value);
    this.tasksLoading.set(true);
  }

  back(event?: Event): void {
    event?.preventDefault();
    this.router.navigate(['/projects']);
  }

  editProject(): void {
    const p = this.project();
    const user = this.auth.currentUser();
    if (!p || !user) return;
    const ref = this.dialog.open<ProjectDialogComponent, ProjectDialogData, ProjectDialogResult>(
      ProjectDialogComponent,
      {
        data: { ownerId: user.uid, project: p },
      },
    );
    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      try {
        await this.projects.updateProject(p.id, result);
        this.snackbar.open('Project updated.', 'Close', { duration: 2000 });
      } catch (err: unknown) {
        this.handleError(err, 'Failed to update project.');
      }
    });
  }

  openCreateTask(): void {
    const p = this.project();
    const user = this.auth.currentUser();
    if (!p || !user) return;
    const ref = this.dialog.open<TaskDialogComponent, TaskDialogData, TaskDialogResult>(
      TaskDialogComponent,
      {
        data: { projectId: p.id, members: this.members() },
      },
    );
    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      try {
        await this.taskService.createTask(p.id, result, user.uid);
        this.snackbar.open('Task created.', 'Close', { duration: 2000 });
      } catch (err: unknown) {
        this.handleError(err, 'Failed to create task.');
      }
    });
  }

  openEditTask(row: TaskRow): void {
    const p = this.project();
    if (!p) return;
    const ref = this.dialog.open<TaskDialogComponent, TaskDialogData, TaskDialogResult>(
      TaskDialogComponent,
      {
        data: { projectId: p.id, task: row.raw, members: this.members() },
      },
    );
    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      try {
        await this.taskService.updateTask(p.id, row.id, result);
        this.snackbar.open('Task updated.', 'Close', { duration: 2000 });
      } catch (err: unknown) {
        this.handleError(err, 'Failed to update task.');
      }
    });
  }

  deleteTask(row: TaskRow, event: Event): void {
    event.stopPropagation();
    const p = this.project();
    if (!p) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete task',
        message: `Delete "${row.title}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      try {
        await this.taskService.deleteTask(p.id, row.id);
        this.snackbar.open('Task deleted.', 'Close', { duration: 2000 });
      } catch (err: unknown) {
        this.handleError(err, 'Failed to delete task.');
      }
    });
  }

  openAddMember(): void {
    const p = this.project();
    if (!p) return;
    const ref = this.dialog.open<MemberDialogComponent, MemberDialogData, MemberDialogResult>(
      MemberDialogComponent,
      {
        data: { projectId: p.id },
      },
    );
    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      try {
        const callable = httpsCallable<{ projectId: string; email: string }, { uid: string }>(
          this.functions,
          'addMember',
        );
        await callable({ projectId: p.id, email: result.email });
        this.snackbar.open('Member added.', 'Close', { duration: 2000 });
      } catch (err: unknown) {
        this.handleError(err, 'Failed to add member.');
      }
    });
  }

  removeMember(member: AppUser): void {
    const p = this.project();
    if (!p) return;
    if (member.uid === p.ownerId) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remove member',
        message: `Remove ${member.displayName || member.email} from this project?`,
        confirmLabel: 'Remove',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (!confirmed) return;
      try {
        await this.projects.removeMember(p.id, member.uid);
        this.snackbar.open('Member removed.', 'Close', { duration: 2000 });
      } catch (err: unknown) {
        this.handleError(err, 'Failed to remove member.');
      }
    });
  }

  private handleError(err: unknown, fallback: string): void {
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback;
    this.snackbar.open(message, 'Dismiss', { duration: 4000 });
  }
}
