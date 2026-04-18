import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { TaskItem, TaskPriority, TaskStatus } from '../models/task.model';
import { ActivityLogEntry } from '../models/activity-log.model';

export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  tags: string[];
  dueDate: Timestamp | null;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly firestore = inject(Firestore);

  private tasksCol(projectId: string) {
    return collection(this.firestore, `projects/${projectId}/tasks`);
  }

  private taskDoc(projectId: string, taskId: string) {
    return doc(this.firestore, `projects/${projectId}/tasks/${taskId}`);
  }

  private activityLogCol(projectId: string) {
    return collection(this.firestore, `projects/${projectId}/activityLog`);
  }

  getTasksForProject(
    projectId: string,
    status?: TaskStatus | 'all',
  ): Observable<TaskItem[]> {
    const filtered = status && status !== 'all';
    const q = filtered
      ? query(
          this.tasksCol(projectId),
          where('status', '==', status),
          orderBy('createdAt', 'desc'),
        )
      : query(this.tasksCol(projectId), orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<TaskItem[]>;
  }

  getActivityLog(projectId: string): Observable<ActivityLogEntry[]> {
    const q = query(this.activityLogCol(projectId), orderBy('timestamp', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<ActivityLogEntry[]>;
  }

  async createTask(
    projectId: string,
    input: TaskInput,
    creatorUid: string,
  ): Promise<string> {
    const ref = await addDoc(this.tasksCol(projectId), {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
      tags: input.tags,
      dueDate: input.dueDate,
      createdBy: creatorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateTask(
    projectId: string,
    taskId: string,
    input: Partial<TaskInput>,
  ): Promise<void> {
    await updateDoc(this.taskDoc(projectId, taskId), {
      ...input,
      updatedAt: serverTimestamp(),
    });
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await deleteDoc(this.taskDoc(projectId, taskId));
  }
}
