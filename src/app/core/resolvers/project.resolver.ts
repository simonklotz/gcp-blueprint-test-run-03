import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { map, Observable, of, take } from 'rxjs';
import { Project } from '../models/project.model';
import { ProjectService } from '../services/project.service';

export const projectResolver: ResolveFn<Project | null> = (route) => {
  const projects = inject(ProjectService);
  const router = inject(Router);

  const id = route.paramMap.get('id');
  if (!id) {
    router.navigate(['/projects']);
    return of(null);
  }

  return projects.getProject(id).pipe(
    take(1),
    map((project): Project | null => {
      if (!project) {
        router.navigate(['/projects']);
        return null;
      }
      return project;
    }),
  ) as Observable<Project | null>;
};
