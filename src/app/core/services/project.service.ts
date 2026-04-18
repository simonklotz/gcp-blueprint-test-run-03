import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  arrayRemove,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Project, ProjectStatus } from '../models/project.model';

export interface ProjectCreateInput {
  title: string;
  description: string;
  status: ProjectStatus;
}

export interface ProjectUpdateInput {
  title?: string;
  description?: string;
  status?: ProjectStatus;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly firestore = inject(Firestore);

  private projectsCol() {
    return collection(this.firestore, 'projects');
  }

  private projectDoc(id: string) {
    return doc(this.firestore, `projects/${id}`);
  }

  getProjectsForUser(uid: string): Observable<Project[]> {
    const q = query(
      this.projectsCol(),
      where('memberIds', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
    );
    return collectionData(q, { idField: 'id' }) as Observable<Project[]>;
  }

  getProject(id: string): Observable<Project | undefined> {
    return docData(this.projectDoc(id), { idField: 'id' }) as Observable<
      Project | undefined
    >;
  }

  async createProject(input: ProjectCreateInput, ownerUid: string): Promise<string> {
    const ref = await addDoc(this.projectsCol(), {
      title: input.title,
      description: input.description,
      status: input.status,
      ownerId: ownerUid,
      memberIds: [ownerUid],
      taskCounts: { open: 0, inProgress: 0, done: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateProject(id: string, updates: ProjectUpdateInput): Promise<void> {
    await updateDoc(this.projectDoc(id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteProject(id: string): Promise<void> {
    await deleteDoc(this.projectDoc(id));
  }

  async removeMember(projectId: string, uid: string): Promise<void> {
    await updateDoc(this.projectDoc(projectId), {
      memberIds: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
  }
}
