import { Directive, effect, inject, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/user.model';

@Directive({
  selector: '[appIfRole]',
})
export class IfRoleDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);

  private allowed: UserRole | UserRole[] | null = null;
  private visible = false;

  @Input({ required: true })
  set appIfRole(role: UserRole | UserRole[]) {
    this.allowed = role;
    this.apply();
  }

  constructor() {
    effect(() => {
      // Re-evaluate whenever the user profile signal updates.
      this.auth.userProfile();
      this.apply();
    });
  }

  private apply(): void {
    const current = this.auth.userProfile()?.role;
    const permitted = this.isPermitted(current);
    if (permitted && !this.visible) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.visible = true;
    } else if (!permitted && this.visible) {
      this.viewContainer.clear();
      this.visible = false;
    }
  }

  private isPermitted(role: UserRole | undefined): boolean {
    if (!role || !this.allowed) {
      return false;
    }
    return Array.isArray(this.allowed) ? this.allowed.includes(role) : this.allowed === role;
  }
}
