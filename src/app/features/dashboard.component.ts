import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  collectionData,
  collectionGroup,
  Firestore,
  query,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { combineLatest, Observable, of, switchMap } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { ProjectService } from '../core/services/project.service';
import { UserService } from '../core/services/user.service';
import { TaskService } from '../core/services/task.service';
import { Project } from '../core/models/project.model';
import { TaskItem } from '../core/models/task.model';
import { ActivityAction, ActivityLogEntry } from '../core/models/activity-log.model';
import { AppUser } from '../core/models/user.model';

interface RecentActivityRow {
  id: string;
  action: ActivityAction;
  icon: string;
  details: string;
  performerName: string;
  timestamp: Date | null;
}

const ICON_BY_ACTION: Record<ActivityAction, string> = {
  task_created: 'add_task',
  task_updated: 'edit',
  task_deleted: 'delete',
  task_status_changed: 'sync_alt',
  member_added: 'person_add',
  member_removed: 'person_remove',
};

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div>
        <h1>Welcome{{ greetingName() ? ', ' + greetingName() : '' }}</h1>
        <p class="subtitle">Here's what's happening across your projects.</p>
      </div>
      <a mat-flat-button color="primary" routerLink="/projects">
        <mat-icon>folder</mat-icon>
        View projects
      </a>
    </header>

    <section class="cards">
      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="kpi">
            <mat-icon>folder</mat-icon>
            <div>
              <div class="kpi-value">{{ projects().length }}</div>
              <div class="kpi-label">Projects</div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="kpi">
            <mat-icon>assignment_ind</mat-icon>
            <div>
              <div class="kpi-value">{{ openTasksAssigned() }}</div>
              <div class="kpi-label">Open tasks assigned to you</div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="kpi">
            <mat-icon>check_circle</mat-icon>
            <div>
              <div class="kpi-value">{{ completedThisWeek() }}</div>
              <div class="kpi-label">Tasks completed this week</div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </section>

    <section class="activity">
      <h2>Recent activity</h2>
      @if (activityLoading()) {
        <div class="loading-state">
          <mat-spinner diameter="32" />
        </div>
      } @else if (activityRows().length === 0) {
        <mat-card appearance="outlined">
          <mat-card-content class="empty-state">
            <mat-icon>history</mat-icon>
            <p>No activity yet. Create a project to get started.</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card appearance="outlined">
          <mat-list>
            @for (row of activityRows(); track row.id) {
              <mat-list-item>
                <mat-icon matListItemIcon>{{ row.icon }}</mat-icon>
                <div matListItemTitle>{{ row.details }}</div>
                <div matListItemLine>
                  {{ row.performerName }} •
                  {{ row.timestamp ? (row.timestamp | date: 'short') : '—' }}
                </div>
              </mat-list-item>
            }
          </mat-list>
        </mat-card>
      }
    </section>
  `,
  styles: `
    .page-header h1 {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 500;
    }
    .subtitle {
      margin: 4px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .cards {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      margin-bottom: 24px;
    }
    .kpi {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .kpi mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }
    .kpi-value {
      font-size: 2rem;
      font-weight: 600;
      line-height: 1;
    }
    .kpi-label {
      color: var(--mat-sys-on-surface-variant);
    }
    .activity h2 {
      font-size: 1.1rem;
      font-weight: 500;
      margin: 0 0 12px;
    }
    .empty-state mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 4px;
    }
  `,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly projectsService = inject(ProjectService);
  private readonly tasksService = inject(TaskService);
  private readonly users = inject(UserService);
  private readonly firestore = inject(Firestore);

  protected readonly profile = this.auth.userProfile;
  protected readonly greetingName = computed(
    () => this.profile()?.displayName || this.auth.currentUser()?.displayName || '',
  );

  private readonly projects$ = this.auth.user$.pipe(
    switchMap((u) => (u ? this.projectsService.getProjectsForUser(u.uid) : of<Project[]>([]))),
  );

  protected readonly projects = toSignal(this.projects$, {
    initialValue: [] as Project[],
  });

  // Open tasks assigned to me — collectionGroup query on tasks.
  private readonly assignedOpen$: Observable<TaskItem[]> = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u) return of<TaskItem[]>([]);
      const q = query(
        collectionGroup(this.firestore, 'tasks'),
        where('assigneeId', '==', u.uid),
        where('status', '==', 'open'),
      );
      return collectionData(q, { idField: 'id' }) as Observable<TaskItem[]>;
    }),
  );

  private readonly assignedOpenList = toSignal(this.assignedOpen$, {
    initialValue: [] as TaskItem[],
  });
  protected readonly openTasksAssigned = computed(() => this.assignedOpenList().length);

  // Tasks completed in the last 7 days across collection-group.
  private readonly completedRecently$: Observable<TaskItem[]> = this.auth.user$.pipe(
    switchMap((u) => {
      if (!u) return of<TaskItem[]>([]);
      const since = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const q = query(
        collectionGroup(this.firestore, 'tasks'),
        where('status', '==', 'done'),
        where('updatedAt', '>=', since),
      );
      return collectionData(q, { idField: 'id' }) as Observable<TaskItem[]>;
    }),
  );

  private readonly completedRecently = toSignal(this.completedRecently$, {
    initialValue: [] as TaskItem[],
  });
  protected readonly completedThisWeek = computed(() => this.completedRecently().length);

  // Recent activity across my projects — per-project subscription, then merge.
  private readonly recentActivity$: Observable<ActivityLogEntry[]> = this.projects$.pipe(
    switchMap((list) => {
      if (list.length === 0) return of<ActivityLogEntry[]>([]);
      const first = list.slice(0, 5);
      return combineLatest(first.map((p) => this.tasksService.getActivityLog(p.id))).pipe(
        switchMap((lists) => {
          const all = ([] as ActivityLogEntry[]).concat(...lists);
          const sorted = all
            .slice()
            .sort((a, b) => {
              const ta = a.timestamp?.toMillis?.() ?? 0;
              const tb = b.timestamp?.toMillis?.() ?? 0;
              return tb - ta;
            })
            .slice(0, 10);
          return of(sorted);
        }),
      );
    }),
  );

  private readonly recentActivity = toSignal(this.recentActivity$, {
    initialValue: [] as ActivityLogEntry[],
  });

  protected readonly activityLoading = signal(true);
  private readonly performerMap = signal<Record<string, string>>({});

  protected readonly activityRows = computed<RecentActivityRow[]>(() => {
    const map = this.performerMap();
    return this.recentActivity().map((e) => ({
      id: e.id,
      action: e.action,
      icon: ICON_BY_ACTION[e.action] ?? 'info',
      details: e.details,
      performerName: map[e.performedBy] ?? '…',
      timestamp: e.timestamp?.toDate?.() ?? null,
    }));
  });

  constructor() {
    this.recentActivity$
      .pipe(
        takeUntilDestroyed(),
        switchMap((list) => {
          this.activityLoading.set(false);
          const ids = Array.from(new Set(list.map((e) => e.performedBy))).filter(Boolean);
          if (ids.length === 0) return of<Record<string, string>>({});
          return combineLatest(ids.map((id) => this.users.getUser(id))).pipe(
            switchMap((docs) => {
              const map: Record<string, string> = {};
              (docs as (AppUser | undefined)[]).forEach((u, i) => {
                map[ids[i]] = u?.displayName || u?.email || 'Unknown';
              });
              return of(map);
            }),
          );
        }),
      )
      .subscribe((map) => this.performerMap.set(map));
  }
}
