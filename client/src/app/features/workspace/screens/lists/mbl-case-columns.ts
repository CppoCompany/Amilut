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
 * differs. Every column sorts; the keys match the server's whitelist (`MBL_SORT_COLUMNS`).
 */
export function mblCaseColumns(): GridColumn<MblSummaryDto>[] {
  return [
    { key: 'id', header: 'מספר תיק', sortable: true, cssClass: 'data-table__numeric' },
    { key: 'mblNumber', header: 'מספר MBL', sortable: true, cell: (c) => textOrEmDash(c.mblNumber) },
    { key: 'shippingType', header: 'שיטת משלוח', sortable: true, cell: mblMethodLabel },
    { key: 'customerNames', header: 'לקוחות', sortable: true, cell: (c) => joinOrEmDash(c.customerNames) },
    { key: 'carrierName', header: 'מוביל', sortable: true, cell: (c) => textOrEmDash(c.carrierName) },
    { key: 'hblCount', header: 'Files', sortable: true, cssClass: 'data-table__numeric' },
    { key: 'orderCount', header: 'הזמנות', sortable: true, cssClass: 'data-table__numeric' },
    { key: 'handlerName', header: 'פקיד מטפל', sortable: true, cell: (c) => textOrEmDash(c.handlerName) },
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
