import { Timestamp } from '@angular/fire/firestore';

export type UserRole = 'admin' | 'member';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
