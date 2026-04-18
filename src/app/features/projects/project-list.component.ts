import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { combineLatest, of, switchMap } from 'rxjs';
import { Project } from '../../core/models/project.model';
import { AppUser } from '../../core/models/user.model';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import {
  ProjectDialogComponent,
  ProjectDialogData,
  ProjectDialogResult,
} from './project-dialog.component';

interface ProjectRow {
  id: string;
  title: string;
  status: Project['status'];
  ownerName: string;
  openTasks: number;
  createdAt: Date | null;
  raw: Project;
}

@Component({
  selector: 'app-project-list',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DatePipe,
    TitleCasePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSortModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Projects</h1>
      <button mat-flat-button color="primary" type="button" (click)="openCreate()">
        <mat-icon>add</mat-icon>
        New project
      </button>
    </header>

    <mat-card appearance="outlined">
      <mat-card-content>
        <div class="toolbar-row">
          <mat-form-field appearance="outline" class="filter">
            <mat-label>Filter by title</mat-label>
            <input matInput [formControl]="filter" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>

        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="36" />
            <span>Loading projects…</span>
          </div>
        } @else if (error()) {
          <div class="error-state">
            <mat-icon>error_outline</mat-icon>
            <p>{{ error() }}</p>
          </div>
        } @else if (rows().length === 0) {
          <div class="empty-state">
            <mat-icon>folder_open</mat-icon>
            <p>You don't have any projects yet.</p>
            <button mat-stroked-button type="button" (click)="openCreate()">
              Create your first project
            </button>
          </div>
        } @else {
          <div class="table-scroll">
            <table mat-table [dataSource]="dataSource" matSort class="mat-elevation-z0">
              <ng-container matColumnDef="title">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Title</th>
                <td mat-cell *matCellDef="let row">{{ row.title }}</td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
                <td mat-cell *matCellDef="let row">
                  <mat-chip
                    [disabled]="true"
                    [color]="row.status === 'active' ? 'primary' : undefined"
                  >
                    {{ row.status | titlecase }}
                  </mat-chip>
                </td>
              </ng-container>

              <ng-container matColumnDef="owner">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Owner</th>
                <td mat-cell *matCellDef="let row">{{ row.ownerName }}</td>
              </ng-container>

              <ng-container matColumnDef="openTasks">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Open</th>
                <td mat-cell *matCellDef="let row">{{ row.openTasks }}</td>
              </ng-container>

              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Created</th>
                <td mat-cell *matCellDef="let row">
                  {{ row.createdAt ? (row.createdAt | date: 'mediumDate') : '—' }}
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr
                mat-row
                *matRowDef="let row; columns: columns"
                class="clickable"
                tabindex="0"
                role="link"
                [attr.aria-label]="'Open project ' + row.title"
                (click)="open(row)"
                (keyup.enter)="open(row)"
                (keyup.space)="open(row)"
              ></tr>
            </table>
          </div>
          <mat-paginator [pageSize]="10" [pageSizeOptions]="[5, 10, 20, 50]" showFirstLastButtons />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .toolbar-row {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }
    .filter {
      flex: 1 1 320px;
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
    .empty-state mat-icon,
    .error-state mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      margin-bottom: 8px;
    }
  `,
})
export class ProjectListComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly projects = inject(ProjectService);
  private readonly users = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly columns = ['title', 'status', 'owner', 'openTasks', 'createdAt'];

  protected readonly filter = new FormControl<string>('', { nonNullable: true });
  private readonly filterSignal = toSignal(this.filter.valueChanges, {
    initialValue: '',
  });

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly list$ = this.auth.user$.pipe(
    switchMap((user) => {
      if (!user) {
        this.loading.set(false);
        return of<Project[]>([]);
      }
      return this.projects.getProjectsForUser(user.uid);
    }),
  );

  private readonly list = toSignal(this.list$, { initialValue: [] as Project[] });

  private readonly ownerMap = signal<Record<string, string>>({});

  protected readonly rows = computed<ProjectRow[]>(() => {
    const map = this.ownerMap();
    return this.list().map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      ownerName: map[p.ownerId] ?? '…',
      openTasks: p.taskCounts?.open ?? 0,
      createdAt: p.createdAt?.toDate?.() ?? null,
      raw: p,
    }));
  });

  protected readonly dataSource = new MatTableDataSource<ProjectRow>([]);

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);

  constructor() {
    effect(() => {
      const rows = this.rows();
      this.dataSource.data = rows;
      if (rows.length >= 0) this.loading.set(false);
    });

    effect(() => {
      const f = this.filterSignal().toLowerCase().trim();
      this.dataSource.filter = f;
    });

    this.dataSource.filterPredicate = (row, filter) => row.title.toLowerCase().includes(filter);

    this.list$.pipe(switchMap((list) => this.loadOwnerNames(list))).subscribe({
      next: (map) => this.ownerMap.set(map),
      error: (err) => this.error.set(err?.message ?? 'Failed to load projects.'),
    });
  }

  ngAfterViewInit(): void {
    const paginator = this.paginator();
    const sort = this.sort();
    if (paginator) this.dataSource.paginator = paginator;
    if (sort) this.dataSource.sort = sort;
  }

  private loadOwnerNames(list: Project[]) {
    const uniqueOwnerIds = Array.from(new Set(list.map((p) => p.ownerId)));
    if (uniqueOwnerIds.length === 0) return of<Record<string, string>>({});
    return combineLatest(uniqueOwnerIds.map((id) => this.users.getUser(id))).pipe(
      switchMap((docs) => {
        const map: Record<string, string> = {};
        (docs as (AppUser | undefined)[]).forEach((u, i) => {
          map[uniqueOwnerIds[i]] = u?.displayName || u?.email || 'Unknown';
        });
        return of(map);
      }),
    );
  }

  openCreate(): void {
    const user = this.auth.currentUser();
    if (!user) return;
    const ref = this.dialog.open<ProjectDialogComponent, ProjectDialogData, ProjectDialogResult>(
      ProjectDialogComponent,
      {
        data: { ownerId: user.uid },
      },
    );
    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      try {
        const id = await this.projects.createProject(result, user.uid);
        this.snackbar.open('Project created.', 'Close', { duration: 2000 });
        this.router.navigate(['/projects', id]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create project.';
        this.snackbar.open(message, 'Dismiss', { duration: 4000 });
      }
    });
  }

  open(row: ProjectRow): void {
    this.router.navigate(['/projects', row.id]);
  }
}
