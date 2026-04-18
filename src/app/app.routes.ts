import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { loginRedirectGuard } from './core/guards/login-redirect.guard';
import { projectMemberGuard } from './core/guards/project-member.guard';
import { projectResolver } from './core/resolvers/project.resolver';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    canActivate: [loginRedirectGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [loginRedirectGuard],
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/projects/project-list.component').then((m) => m.ProjectListComponent),
  },
  {
    path: 'projects/:id',
    canActivate: [authGuard, projectMemberGuard],
    resolve: { project: projectResolver },
    loadComponent: () =>
      import('./features/projects/project-detail.component').then((m) => m.ProjectDetailComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
