import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { MBL_SHIPPING_TYPE_LABELS, SEA_METHOD_LABELS } from '../../../api/enums';
import { NavigationService } from '../navigation.service';
import { SelectedEntity, SelectionStateService } from '../selection-state.service';

/** "ימי - FCL/FCL", "אווירי", etc. */
function methodLabel(entity: Extract<SelectedEntity, { kind: 'shippingCase' }>): string {
  const mbl = entity.mbl;
  const shippingLabel = MBL_SHIPPING_TYPE_LABELS[mbl.shippingType];
  return mbl.seaMethod ? `${shippingLabel} - ${SEA_METHOD_LABELS[mbl.seaMethod]}` : shippingLabel;
}

/**
 * Top breadcrumb bar: the sidebar navigation trail (group → current page) plus
 * a trailing badge for whatever Order/Shipping Case is currently selected (see
 * `SelectionStateService`). Both halves are driven entirely by signals, so the
 * trail and the badge update on their own as navigation/selection change —
 * nothing here is pushed to it imperatively.
 */
@Component({
  selector: 'app-breadcrumb',
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumb {
  protected readonly nav = inject(NavigationService);
  private readonly selection = inject(SelectionStateService);

  protected readonly selectedKind = computed(() => this.selection.selected()?.kind ?? null);

  protected readonly selectedLabel = computed(() => {
    const entity = this.selection.selected();
    if (!entity) return null;
    if (entity.kind === 'order') {
      const order = entity.order;
      return order.customerName ? `הזמנה #${order.id} — ${order.customerName}` : `הזמנה #${order.id}`;
    }
    const mblLabel = entity.mbl.mblNumber || `#${entity.mbl.id}`;
    return `תיק שילוח ${mblLabel} — ${methodLabel(entity)}`;
  });

  /** Re-opens the selected entity's screen (reuses the existing "edit" nav flow). */
  protected openSelected(): void {
    const entity = this.selection.selected();
    if (!entity) return;
    if (entity.kind === 'order') {
      this.nav.openOrderForEdit(entity.order.id);
    } else {
      this.nav.openCaseForEdit(entity.mbl.id);
    }
  }

  protected clearSelection(): void {
    this.selection.clear();
  }
}
