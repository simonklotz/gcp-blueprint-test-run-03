import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'ptp.theme.dark';
const BODY_CLASS = 'dark-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly darkMode = signal<boolean>(this.readInitial());

  constructor() {
    effect(() => {
      const enabled = this.darkMode();
      const body = document.body;
      body.classList.toggle(BODY_CLASS, enabled);
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      } catch {
        // ignore storage failures (e.g. private mode)
      }
    });
  }

  toggle(): void {
    this.darkMode.update((v) => !v);
  }

  set(enabled: boolean): void {
    this.darkMode.set(enabled);
  }

  private readInitial(): boolean {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      // ignore
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
