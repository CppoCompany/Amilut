import { Injectable, computed, signal } from '@angular/core';

import type { HblDto, MblDto, OrderDto } from '../../api/models';

/** The full Order currently being worked on (loaded for edit, or just saved). */
export interface SelectedOrder {
  readonly kind: 'order';
  readonly order: OrderDto;
}

/** The full shipping case currently being worked on — the MBL plus its HBLs,
 *  mirroring exactly what `ShipmentCaseWizardScreen` holds (`savedMbl`/`hbls`). */
export interface SelectedShippingCase {
  readonly kind: 'shippingCase';
  readonly mbl: MblDto;
  readonly hbls: readonly HblDto[];
}

/** `null` means nothing is currently selected. */
export type SelectedEntity = SelectedOrder | SelectedShippingCase | null;

/**
 * App-wide "what am I currently working on" state — at most one Order OR one
 * Shipping Case at a time, never both (selecting one replaces the other,
 * since both live in the same single-slot signal). Drives the breadcrumb
 * (see `Breadcrumb`) and is kept in sync by `OrderScreen`/`ShipmentCaseWizardScreen`
 * reactively as their own `savedOrder`/`savedMbl`+`hbls` signals change.
 */
@Injectable({ providedIn: 'root' })
export class SelectionStateService {
  private readonly _selected = signal<SelectedEntity>(null);
  readonly selected = this._selected.asReadonly();

  readonly selectedOrder = computed<OrderDto | null>(() => {
    const entity = this._selected();
    return entity?.kind === 'order' ? entity.order : null;
  });

  readonly selectedShippingCase = computed<SelectedShippingCase | null>(() => {
    const entity = this._selected();
    return entity?.kind === 'shippingCase' ? entity : null;
  });

  /** Selecting an Order always replaces whatever was selected before (Order or
   *  Shipping Case) — there is only ever one active entity. */
  selectOrder(order: OrderDto): void {
    this._selected.set({ kind: 'order', order });
  }

  /** Selecting a Shipping Case always replaces whatever was selected before. */
  selectShippingCase(mbl: MblDto, hbls: readonly HblDto[]): void {
    this._selected.set({ kind: 'shippingCase', mbl, hbls });
  }

  clear(): void {
    this._selected.set(null);
  }
}
