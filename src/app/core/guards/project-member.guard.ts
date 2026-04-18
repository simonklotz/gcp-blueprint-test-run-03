import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { combineLatest, map, Observable, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ProjectService } from '../services/project.service';

export const projectMemberGuard: CanActivateFn = (route): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const projects = inject(ProjectService);
  const router = inject(Router);
  const snackbar = inject(MatSnackBar);

  const id = route.paramMap.get('id') ?? '';

  return combineLatest([auth.user$, projects.getProject(id)]).pipe(
    take(1),
    map(([user, project]) => {
      if (!user) return router.createUrlTree(['/login']);
      if (!project) {
        snackbar.open('Project not found.', 'Dismiss', { duration: 4000 });
        return router.createUrlTree(['/projects']);
      }
      const allowed = project.ownerId === user.uid || project.memberIds?.includes(user.uid);
      if (!allowed) {
        snackbar.open('You do not have access to this project.', 'Dismiss', {
          duration: 4000,
        });
        return router.createUrlTree(['/projects']);
      }
      return true;
    }),
  );
};
