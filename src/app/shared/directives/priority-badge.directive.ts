import { Directive, ElementRef, Input, Renderer2, inject } from '@angular/core';
import { TaskPriority } from '../../core/models/task.model';

const PALETTE: Record<TaskPriority, { bg: string; fg: string }> = {
  low: { bg: '#2e7d32', fg: '#ffffff' },
  medium: { bg: '#f9a825', fg: '#000000' },
  high: { bg: '#ef6c00', fg: '#ffffff' },
  critical: { bg: '#c62828', fg: '#ffffff' },
};

@Directive({
  selector: '[appPriorityBadge]',
})
export class PriorityBadgeDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);

  @Input({ required: true })
  set appPriorityBadge(priority: TaskPriority) {
    const palette = PALETTE[priority];
    const node = this.el.nativeElement;
    this.renderer.setStyle(node, 'background-color', palette.bg);
    this.renderer.setStyle(node, 'color', palette.fg);
    this.renderer.setStyle(node, 'padding', '2px 8px');
    this.renderer.setStyle(node, 'border-radius', '999px');
    this.renderer.setStyle(node, 'font-size', '0.75rem');
    this.renderer.setStyle(node, 'font-weight', '600');
    this.renderer.setStyle(node, 'text-transform', 'uppercase');
    this.renderer.setStyle(node, 'letter-spacing', '0.04em');
    this.renderer.setStyle(node, 'display', 'inline-block');
  }
}
