import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TRADE_AGREEMENT_LABELS } from '../../../../../api/enums';
import { ClassificationSortKey, ImportFilesApi } from '../../../../../api/import-files-api';
import type { ClassificationRowDto } from '../../../../../api/models';
import { formatHeDate, textOrEmDash } from '../../../../../shared/format';
import { FilingContextService } from '../../../filing-context.service';
import { NavigationService } from '../../../navigation.service';
import { ListPage } from '../list-page/list-page';
import type { ListPageConfig } from '../list-page.model';

/**
 * "הסיווגים שלי" (רשימות) — every classified supplier-invoice line across all
 * orders/CCFs, one row per line (`GET /api/import-files/classifications`).
 * Unscoped: import files have no owner (user) column. Double-click points
 * the classification screen at the row's Order/CCF.
 */
@Component({
  selector: 'app-my-classifications-list-screen',
  imports: [ListPage],
  template: `<app-list-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyClassificationsListScreen {
  private readonly importFilesApi = inject(ImportFilesApi);
  private readonly nav = inject(NavigationService);
  private readonly filingContext = inject(FilingContextService);

  protected readonly config: ListPageConfig<ClassificationRowDto> = {
    page: 'listMyClassifications',
    title: 'הסיווגים שלי',
    defaultSort: 'createdAt',
    // No single numeric "case number" quick-filter exists anymore — an order
    // id and a ccf id are different spaces, which a lone text box can't
    // represent. The server still accepts orderId/ccfId independently
    // (PagedClassificationsParams) for a future richer filter.
    showCaseNumber: false,
    searchPlaceholder: 'מק"ט, תיאור, פרט מכס או שם קובץ',
    rowKey: (row) => `${row.fileId}:${row.lineIndex}`,
    errorText: 'טעינת הסיווגים נכשלה',
    columns: [
      { key: 'contextLabel', header: 'הקשר', sortable: true, cell: (r) => r.contextLabel },
      { key: 'fileName', header: 'קובץ', sortable: true, cell: (r) => textOrEmDash(r.fileName) },
      { key: 'item', header: 'מק"ט', sortable: true, cell: (r) => textOrEmDash(r.item) },
      { key: 'description', header: 'תיאור', sortable: true, cell: (r) => textOrEmDash(r.description) },
      { key: 'quantity', header: 'כמות', sortable: true, cssClass: 'data-table__numeric', cell: (r) => textOrEmDash(r.quantity) },
      {
        key: 'classificationCode',
        header: 'פרט מכס',
        sortable: true,
        cssClass: 'data-table__numeric',
        cell: (r) => textOrEmDash(r.classification.classificationCode),
      },
      {
        key: 'tradeAgreement',
        header: 'הסכם סחר',
        sortable: true,
        cell: (r) =>
          r.classification.tradeAgreement
            ? TRADE_AGREEMENT_LABELS[r.classification.tradeAgreement]
            : '—',
      },
      { key: 'countryName', header: 'מדינת מקור', sortable: true, cell: (r) => textOrEmDash(r.countryName) },
      {
        key: 'approvals',
        header: 'אישורים',
        sortable: true,
        cssClass: 'data-table__numeric',
        cell: (r) => String(r.classification.approvals.length),
      },
      {
        key: 'createdAt',
        header: 'תאריך העלאה',
        sortable: true,
        cssClass: 'data-table__numeric',
        cell: (r) => formatHeDate(r.createdAt),
      },
    ],
    load: (params) =>
      this.importFilesApi.listClassifications({
        q: params.q,
        from: params.from,
        to: params.to,
        sort: params.sort as ClassificationSortKey,
        dir: params.dir,
        page: params.page,
        pageSize: params.pageSize,
      }),
    open: (row) => {
      this.filingContext.context.set(
        row.orderId !== null ? { kind: 'order', id: row.orderId } : { kind: 'ccf', id: row.ccfId! },
      );
      this.nav.selectChildById('ws-classification');
    },
  };
}
