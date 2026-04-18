import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { map } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { ThemeService } from './core/services/theme.service';
import { initialsFrom } from './shared/utils/initials-from';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  template: `
    @if (hideShell() || !isLoggedIn()) {
      <router-outlet />
    } @else {
      <mat-sidenav-container class="shell">
        <mat-sidenav
          #nav
          class="sidenav"
          [mode]="sidenavMode()"
          [opened]="sidenavOpened()"
          [fixedInViewport]="isHandset()"
        >
          <mat-nav-list>
            <a
              mat-list-item
              routerLink="/dashboard"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: false }"
              (click)="isHandset() && nav.close()"
            >
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <span matListItemTitle>Dashboard</span>
            </a>
            <a
              mat-list-item
              routerLink="/projects"
              routerLinkActive="active"
              (click)="isHandset() && nav.close()"
            >
              <mat-icon matListItemIcon>folder</mat-icon>
              <span matListItemTitle>Projects</span>
            </a>
            <a
              mat-list-item
              routerLink="/settings"
              routerLinkActive="active"
              (click)="isHandset() && nav.close()"
            >
              <mat-icon matListItemIcon>settings</mat-icon>
              <span matListItemTitle>Settings</span>
            </a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content class="content">
          <mat-toolbar color="primary" class="toolbar">
            @if (isHandset()) {
              <button
                mat-icon-button
                type="button"
                aria-label="Toggle navigation"
                (click)="nav.toggle()"
              >
                <mat-icon>menu</mat-icon>
              </button>
            }
            <span class="title">{{ title }}</span>
            <span class="spacer"></span>

            <button
              mat-icon-button
              type="button"
              [attr.aria-label]="darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"
              [attr.aria-pressed]="darkMode()"
              (click)="toggleTheme()"
            >
              <mat-icon>{{ darkMode() ? 'light_mode' : 'dark_mode' }}</mat-icon>
            </button>

            <button
              mat-icon-button
              class="avatar-button"
              type="button"
              [matMenuTriggerFor]="userMenu"
              aria-label="Account menu"
            >
              <div class="avatar" aria-hidden="true">{{ initials() }}</div>
            </button>
            <mat-menu #userMenu="matMenu" xPosition="before">
              <div class="user-menu-header" aria-hidden="true">
                <strong>{{ displayName() }}</strong>
              </div>
              <a mat-menu-item routerLink="/settings">
                <mat-icon>person</mat-icon>
                <span>Profile</span>
              </a>
              <button mat-menu-item type="button" (click)="logout()">
                <mat-icon>logout</mat-icon>
                <span>Sign out</span>
              </button>
            </mat-menu>
          </mat-toolbar>

          <main class="view">
            <router-outlet />
          </main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    }
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly title = 'Project Tracker Pro';

  protected readonly isHandset = toSignal(
    this.breakpoints.observe(Breakpoints.Handset).pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly sidenavMode = computed(() => (this.isHandset() ? 'over' : 'side'));

  protected readonly sidenavOpened = computed(() => !this.isHandset());

  protected readonly authUser = this.auth.currentUser;
  protected readonly profile = this.auth.userProfile;
  protected readonly isLoggedIn = this.auth.isLoggedIn;

  protected readonly darkMode = this.theme.darkMode;

  protected readonly initials = computed(() => {
    const p = this.profile();
    const u = this.authUser();
    const name = p?.displayName || u?.displayName || u?.email || '';
    return initialsFrom(name);
  });

  protected readonly displayName = computed(
    () => this.profile()?.displayName || this.authUser()?.displayName || '',
  );

  protected readonly hideShell = signal(false);

  constructor() {
    this.router.events.subscribe(() => {
      const url = this.router.url;
      this.hideShell.set(url.startsWith('/login') || url.startsWith('/register'));
    });
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.snackbar.open('Signed out.', 'Close', { duration: 2000 });
    this.router.navigateByUrl('/login');
  }
}
