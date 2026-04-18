import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { combineLatest, of, switchMap } from 'rxjs';
import { ActivityAction, ActivityLogEntry } from '../../core/models/activity-log.model';
import { AppUser } from '../../core/models/user.model';
import { TaskService } from '../../core/services/task.service';
import { UserService } from '../../core/services/user.service';

interface ActivityRow {
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
  selector: 'app-activity-log',
  imports: [CommonModule, DatePipe, MatIconModule, MatListModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="loading-state">
        <mat-spinner diameter="32" />
      </div>
    } @else if (rows().length === 0) {
      <div class="empty-state">
        <mat-icon>history</mat-icon>
        <p>No activity yet.</p>
      </div>
    } @else {
      <mat-list role="list" class="log">
        @for (row of rows(); track row.id) {
          <mat-list-item role="listitem">
            <mat-icon matListItemIcon>{{ row.icon }}</mat-icon>
            <div matListItemTitle>{{ row.details }}</div>
            <div matListItemLine>
              {{ row.performerName }} •
              {{ row.timestamp ? (row.timestamp | date: 'short') : '—' }}
            </div>
          </mat-list-item>
        }
      </mat-list>
    }
  `,
  styles: `
    .log {
      padding: 0;
    }
  `,
})
export class ActivityLogComponent {
  private readonly tasks = inject(TaskService);
  private readonly users = inject(UserService);

  readonly projectId = input.required<string>();
  readonly limit = input<number>(50);

  private readonly entries$ = toObservable(this.projectId).pipe(
    switchMap((id) => (id ? this.tasks.getActivityLog(id) : of<ActivityLogEntry[]>([]))),
  );

  private readonly entries = toSignal(this.entries$, {
    initialValue: [] as ActivityLogEntry[],
  });

  protected readonly loading = signal(true);
  private readonly userMap = signal<Record<string, string>>({});

  protected readonly rows = computed<ActivityRow[]>(() => {
    const map = this.userMap();
    const list = this.entries().slice(0, this.limit());
    return list.map((e) => ({
      id: e.id,
      action: e.action,
      icon: ICON_BY_ACTION[e.action] ?? 'info',
      details: e.details,
      performerName: map[e.performedBy] ?? '…',
      timestamp: e.timestamp?.toDate?.() ?? null,
    }));
  });

  constructor() {
    effect(() => {
      // Any emission (including initial) flips loading off.
      this.entries();
      this.loading.set(false);
    });

    this.entries$
      .pipe(
        takeUntilDestroyed(),
        switchMap((entries) => {
          const ids = Array.from(new Set(entries.map((e) => e.performedBy))).filter(Boolean);
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
      .subscribe((map) => this.userMap.set(map));
  }
}
