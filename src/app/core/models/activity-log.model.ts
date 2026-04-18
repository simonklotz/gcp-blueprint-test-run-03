import { Timestamp } from '@angular/fire/firestore';

export type ActivityAction =
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'task_status_changed'
  | 'member_added'
  | 'member_removed';

export interface ActivityLogEntry {
  id: string;
  action: ActivityAction;
  performedBy: string;
  targetTaskId: string | null;
  details: string;
  timestamp: Timestamp;
}
