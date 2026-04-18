import { Timestamp } from '@angular/fire/firestore';

export type ProjectStatus = 'active' | 'archived';

export interface TaskCounts {
  open: number;
  inProgress: number;
  done: number;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  ownerId: string;
  memberIds: string[];
  taskCounts: TaskCounts;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
