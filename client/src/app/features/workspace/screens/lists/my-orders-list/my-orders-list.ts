import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  DESTINATION_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  OrderStatus,
  SHIPMENT_TYPE_LABELS,
} from '../../../../../api/enums';
import type { OrderDto } from '../../../../../api/models';
import { OrderSortKey, OrdersApi } from '../../../../../api/orders-api';
import { formatHeDate, textOrEmDash } from '../../../../../shared/format';
import { NavigationService } from '../../../navigation.service';
import { ListPage } from '../list-page/list-page';
import type { ListPageConfig } from '../list-page.model';

/** "ההזמנות שלי" (רשימות) — every active order handled by the signed-in user, server-paged. */
@Component({
  selector: 'app-my-orders-list-screen',
  imports: [ListPage],
  template: `<app-list-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrdersListScreen {
  private readonly ordersApi = inject(OrdersApi);
  private readonly nav = inject(NavigationService);

  protected readonly config: ListPageConfig<OrderDto> = {
    page: 'listMyOrders',
    title: 'ההזמנות שלי',
    defaultSort: 'createdAt',
    statusOptions: ORDER_STATUSES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] })),
    showCustomer: true,
    searchPlaceholder: 'מספר הזמנה, לקוח או ספק',
    rowKey: (order) => order.id,
    errorText: 'טעינת ההזמנות נכשלה',
    columns: [
      { key: 'id', header: 'מספר הזמנה', sortable: true, cssClass: 'data-table__numeric' },
      { key: 'customerName', header: 'לקוח', sortable: true, cell: (o) => textOrEmDash(o.customerName) },
      { key: 'supplierName', header: 'ספק', cell: (o) => textOrEmDash(o.supplierName) },
      {
        key: 'status',
        header: 'סטטוס',
        sortable: true,
        cell: (o) => ORDER_STATUS_LABELS[o.status],
        pill: (o) => o.status,
      },
      { key: 'shipmentType', header: 'סוג משלוח', cell: (o) => SHIPMENT_TYPE_LABELS[o.shipmentType] },
      { key: 'destination', header: 'יעד', cell: (o) => DESTINATION_LABELS[o.destination] },
      { key: 'etaDate', header: 'ETA', cssClass: 'data-table__numeric', cell: (o) => formatHeDate(o.etaDate) },
      {
        key: 'createdAt',
        header: 'תאריך פתיחה',
        sortable: true,
        cssClass: 'data-table__numeric',
        cell: (o) => formatHeDate(o.createdAt),
      },
    ],
    load: (params) =>
      this.ordersApi.listMinePaged({
        q: params.q,
        status: params.status as OrderStatus | undefined,
        customerId: params.customerId,
        from: params.from,
        to: params.to,
        sort: params.sort as OrderSortKey,
        dir: params.dir,
        page: params.page,
        pageSize: params.pageSize,
      }),
    open: (order) => this.nav.openOrderForEdit(order.id),
  };
}
