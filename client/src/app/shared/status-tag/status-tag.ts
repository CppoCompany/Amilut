import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tag } from 'primeng/tag';

export type TagSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast';

/**
 * Severity per pipeline status: neutral (just started) → amber (waiting on
 * someone) → blue (in motion) → green (done). Unknown values stay neutral.
 */
const SEVERITY: Record<string, TagSeverity> = {
  preparing: 'secondary',
  closed: 'secondary',
  ready_for_pickup: 'warn',
  in_release: 'warn',
  waiting_at_port: 'warn',
  picked_up: 'info',
  open: 'info',
  departed: 'success',
  released: 'success',
};

export function statusSeverity(status: string | null | undefined): TagSeverity {
  return (status && SEVERITY[status]) || 'secondary';
}

/**
 * Status badge on PrimeNG's tag. `status` picks the severity (and adds a
 * `status-tag--<status>` class for the few statuses with their own tint);
 * `label` is the Hebrew text.
 */
@Component({
  selector: 'app-status-tag',
  imports: [Tag],
  template: `<p-tag [value]="label()" [severity]="severity()" [styleClass]="styleClass()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusTag {
  readonly status = input<string | null | undefined>(null);
  readonly label = input('');

  protected readonly severity = computed(() => statusSeverity(this.status()));
  protected readonly styleClass = computed(
    () => `status-tag status-tag--${this.status() ?? 'none'}`,
  );
}
