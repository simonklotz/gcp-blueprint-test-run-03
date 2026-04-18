import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { AppUser, UserRole } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);

  private userDoc(uid: string) {
    return doc(this.firestore, `users/${uid}`);
  }

  getUser(uid: string): Observable<AppUser | undefined> {
    return docData(this.userDoc(uid), { idField: 'uid' }) as Observable<
      AppUser | undefined
    >;
  }

  async getUsersByIds(uids: string[]): Promise<AppUser[]> {
    if (uids.length === 0) return [];
    const results: AppUser[] = [];
    for (const uid of uids) {
      const user = await firstValueFrom(this.getUser(uid));
      if (user) results.push(user);
    }
    return results;
  }

  async findUserByEmail(email: string): Promise<AppUser | null> {
    const usersCol = collection(this.firestore, 'users');
    const q = query(usersCol, where('email', '==', email));
    const snap = collectionData(q, { idField: 'uid' }) as Observable<AppUser[]>;
    const users = await firstValueFrom(snap);
    return users[0] ?? null;
  }

  async upsertOnLogin(params: {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
  }): Promise<void> {
    const ref = this.userDoc(params.uid);
    const existing = await firstValueFrom(this.getUser(params.uid));
    if (existing) {
      await updateDoc(ref, {
        email: params.email,
        displayName: params.displayName || existing.displayName,
        photoURL: params.photoURL,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const role: UserRole = 'member';
    await setDoc(ref, {
      uid: params.uid,
      email: params.email,
      displayName: params.displayName,
      photoURL: params.photoURL,
      role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async updateProfile(
    uid: string,
    updates: { displayName?: string; photoURL?: string | null },
  ): Promise<void> {
    await updateDoc(this.userDoc(uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }
}
