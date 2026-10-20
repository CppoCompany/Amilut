import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { HblDto } from '../../../../../api/models';

/** One container as listed in the wizard sidebar's "מבנה התיק" grid: either a
 *  `mbl_container` row (groupage) or the Job's own single container (every
 *  other sea method — `id` is then `null`), plus the Files shipped in it. */
export interface ContainerSummary {
  id: number | null;
  containerNumber: string | null;
  containerSealNumber: string | null;
  cargoDescription: string | null;
  grossWeightKg: number | null;
  volumeCbm: number | null;
  files: HblDto[];
}

/** Read-only popup with one container's details, opened by clicking a row of
 *  the sidebar's containers grid. Same backdrop/card shell as the other
 *  dialogs in this app (there is no shared dialog component). */
@Component({
  selector: 'app-container-details-dialog',
  templateUrl: './container-details-dialog.html',
  styleUrl: './container-details-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onClose()' },
})
export class ContainerDetailsDialog {
  readonly container = input.required<ContainerSummary>();
  readonly closed = output<void>();

  protected onClose(): void {
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /** "File #3 · HBL-001 · לקוח" — same wording as the sidebar's File dropdown. */
  protected fileLabel(hbl: HblDto): string {
    const parts = [`File #${hbl.sequenceNumber}`];
    if (hbl.hblNumber) parts.push(hbl.hblNumber);
    if (hbl.customerName) parts.push(hbl.customerName);
    return parts.join(' · ');
  }
}
