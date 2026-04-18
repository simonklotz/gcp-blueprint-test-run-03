import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from '@angular/fire/auth';
import { filter, map, Observable, switchMap } from 'rxjs';
import { AppUser } from '../models/user.model';
import { UserService } from '../services/user.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly users = inject(UserService);

  readonly user$: Observable<User | null> = authState(this.auth);

  readonly currentUser = toSignal(this.user$, { initialValue: null });
  readonly isLoggedIn = computed(() => !!this.currentUser());

  readonly userProfile$: Observable<AppUser | null> = this.user$.pipe(
    switchMap((u) => (u ? this.users.getUser(u.uid).pipe(map((p) => p ?? null)) : [null])),
  );

  readonly userProfile = toSignal(this.userProfile$, { initialValue: null });
  readonly role = computed(() => this.userProfile()?.role ?? null);

  async login(email: string, password: string): Promise<void> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await this.syncProfile(cred.user);
  }

  async loginWithGoogle(): Promise<void> {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.syncProfile(cred.user);
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    await this.syncProfile(cred.user, displayName);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  /**
   * Emits once the auth state has resolved (user or null), useful for guards
   * that must wait on Firebase Auth to hydrate before deciding.
   */
  readonly authResolved$: Observable<User | null> = this.user$.pipe(filter((v) => v !== undefined));

  private async syncProfile(user: User, displayNameOverride?: string): Promise<void> {
    await this.users.upsertOnLogin({
      uid: user.uid,
      email: user.email ?? '',
      displayName: displayNameOverride || user.displayName || user.email || '',
      photoURL: user.photoURL ?? null,
    });
  }
}
