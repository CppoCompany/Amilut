import { MBL_SHIPPING_TYPE_LABELS, MBL_STATUS_LABELS, SEA_METHOD_LABELS } from '../../../../api/enums';
import type { MblSummaryDto } from '../../../../api/models';
import type { GridColumn } from '../../../../shared/data-grid/data-grid';
import { formatHeDate, joinOrEmDash, textOrEmDash } from '../../../../shared/format';

/** "ימי - FCL/FCL", "אווירי", etc. — same wording as the "התיקים שלי" grid. */
export function mblMethodLabel(mblCase: MblSummaryDto): string {
  const shippingLabel = MBL_SHIPPING_TYPE_LABELS[mblCase.shippingType];
  return mblCase.seaMethod
    ? `${shippingLabel} - ${SEA_METHOD_LABELS[mblCase.seaMethod]}`
    : shippingLabel;
}

/**
 * Columns shared by the three MBL-case lists ("התיקים שלי", "תיקים בהתרה",
 * "תהליכי יבוא") — they all read `GET /api/mbl/paged`, only the fixed query
 * differs. Sortable keys match the server's whitelist.
 */
export function mblCaseColumns(): GridColumn<MblSummaryDto>[] {
  return [
    { key: 'id', header: 'מספר תיק', sortable: true, cssClass: 'data-table__numeric' },
    { key: 'mblNumber', header: 'מספר MBL', sortable: true, cell: (c) => textOrEmDash(c.mblNumber) },
    { key: 'shippingType', header: 'שיטת משלוח', cell: mblMethodLabel },
    { key: 'customerNames', header: 'לקוחות', cell: (c) => joinOrEmDash(c.customerNames) },
    { key: 'carrierName', header: 'מוביל', sortable: true, cell: (c) => textOrEmDash(c.carrierName) },
    { key: 'hblCount', header: 'תיקי HBL', cssClass: 'data-table__numeric' },
    { key: 'orderCount', header: 'הזמנות', cssClass: 'data-table__numeric' },
    { key: 'handlerName', header: 'פקיד מטפל', cell: (c) => textOrEmDash(c.handlerName) },
    {
      key: 'status',
      header: 'סטטוס',
      sortable: true,
      cell: (c) => MBL_STATUS_LABELS[c.status],
      pill: (c) => c.status,
    },
    {
      key: 'createdAt',
      header: 'תאריך פתיחה',
      sortable: true,
      cssClass: 'data-table__numeric',
      cell: (c) => formatHeDate(c.createdAt),
    },
  ];
}
