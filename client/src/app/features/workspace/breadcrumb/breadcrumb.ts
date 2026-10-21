import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Breadcrumb as PBreadcrumb } from 'primeng/breadcrumb';
import { Button } from 'primeng/button';

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
 * Top breadcrumb bar: the sidebar navigation trail (group → current page, on
 * PrimeNG's breadcrumb) plus
 * a trailing badge for whatever Order/Shipping Case is currently selected (see
 * `SelectionStateService`). Both halves are driven entirely by signals, so the
 * trail and the badge update on their own as navigation/selection change —
 * nothing here is pushed to it imperatively.
 */
@Component({
  selector: 'app-breadcrumb',
  imports: [PBreadcrumb, Button],
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumb {
  protected readonly nav = inject(NavigationService);
  private readonly selection = inject(SelectionStateService);

  /** "ראשי" → the landing screen ("איזור האישי"). */
  protected readonly home: MenuItem = {
    label: 'ראשי',
    icon: 'fa-solid fa-house',
    command: () => this.goHome(),
  };

  /** Group (not clickable — it never navigates anywhere) → current page. */
  protected readonly trail = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    const groupLabel = this.nav.activeGroupLabel();
    if (groupLabel) items.push({ label: groupLabel, styleClass: 'breadcrumb-item' });
    const child = this.nav.activeChild();
    if (child) {
      items.push({
        label: child.label,
        icon: child.icon,
        styleClass: 'breadcrumb-item breadcrumb-item--current',
      });
    }
    return items;
  });

  protected readonly selectedIcon = computed(() =>
    this.selectedKind() === 'order' ? 'fa-solid fa-file-invoice' : 'fa-solid fa-truck-fast',
  );

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

  protected goHome(): void {
    this.nav.selectChildById('ws-dashboard');
  }
}
