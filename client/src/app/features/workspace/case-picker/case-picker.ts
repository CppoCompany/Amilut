import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { MblApi } from '../../../api/mbl-api';
import type { MblSummaryDto } from '../../../api/models';
import { CurrentCaseService } from '../current-case.service';

/** Single batch of cases offered in the dropdown (the server's page-size ceiling). */
const MAX_CASES = 200;

/**
 * "תיק" dropdown at the top of the per-case screens (filing, classification).
 * Lists the shipping cases and writes the choice to {@link CurrentCaseService};
 * the hosting screen reacts to that signal.
 */
@Component({
  selector: 'app-case-picker',
  templateUrl: './case-picker.html',
  styleUrl: './case-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CasePicker {
  private readonly mblApi = inject(MblApi);
  private readonly currentCase = inject(CurrentCaseService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly caseId = this.currentCase.caseId;
  protected readonly cases = signal<MblSummaryDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.loadCases();
  }

  protected onCaseChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.caseId.set(value === '' ? null : Number(value));
  }

  /** "תיק 7 · MBL-987654321 · ACME Ltd." — the parts a case has, in that order. */
  protected caseLabel(mblCase: MblSummaryDto): string {
    return [`תיק ${mblCase.id}`, mblCase.mblNumber, mblCase.customerNames.join(', ')]
      .filter((part) => !!part)
      .join(' · ');
  }

  private loadCases(): void {
    this.loading.set(true);
    this.mblApi
      .list({ limit: MAX_CASES })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (cases) => {
          this.cases.set(cases);
          // A case deleted since it was picked must not stay selected.
          const selected = this.caseId();
          if (selected !== null && !cases.some((c) => c.id === selected)) {
            this.caseId.set(null);
          }
        },
        error: () => this.errorMessage.set('טעינת רשימת התיקים נכשלה'),
      });
  }
}
