import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TRADE_AGREEMENT_LABELS } from '../../../../../api/enums';
import { ClassificationSortKey, ImportFilesApi } from '../../../../../api/import-files-api';
import type { ClassificationRowDto } from '../../../../../api/models';
import { formatHeDate, textOrEmDash } from '../../../../../shared/format';
import { CurrentCaseService } from '../../../current-case.service';
import { NavigationService } from '../../../navigation.service';
import { ListPage } from '../list-page/list-page';
import type { ListPageConfig } from '../list-page.model';

/**
 * "הסיווגים שלי" (רשימות) — every classified supplier-invoice line across all
 * import cases, one row per line (`GET /api/import-files/classifications`).
 * Unscoped: import files hang off `order_account`, which has no owner column.
 * Double-click points the classification screen at the row's case.
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
  private readonly currentCase = inject(CurrentCaseService);

  protected readonly config: ListPageConfig<ClassificationRowDto> = {
    page: 'listMyClassifications',
    title: 'הסיווגים שלי',
    defaultSort: 'createdAt',
    showCaseNumber: true,
    searchPlaceholder: 'מק"ט, תיאור, פרט מכס או שם קובץ',
    rowKey: (row) => `${row.fileId}:${row.lineIndex}`,
    errorText: 'טעינת הסיווגים נכשלה',
    columns: [
      { key: 'accountId', header: 'מספר תיק', sortable: true, cssClass: 'data-table__numeric' },
      { key: 'fileName', header: 'קובץ', cell: (r) => textOrEmDash(r.fileName) },
      { key: 'item', header: 'מק"ט', sortable: true, cell: (r) => textOrEmDash(r.item) },
      { key: 'description', header: 'תיאור', cell: (r) => textOrEmDash(r.description) },
      { key: 'quantity', header: 'כמות', cssClass: 'data-table__numeric', cell: (r) => textOrEmDash(r.quantity) },
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
        cell: (r) =>
          r.classification.tradeAgreement
            ? TRADE_AGREEMENT_LABELS[r.classification.tradeAgreement]
            : '—',
      },
      { key: 'countryName', header: 'מדינת מקור', cell: (r) => textOrEmDash(r.countryName) },
      {
        key: 'approvals',
        header: 'אישורים',
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
        accountId: params.caseNumber,
        from: params.from,
        to: params.to,
        sort: params.sort as ClassificationSortKey,
        dir: params.dir,
        page: params.page,
        pageSize: params.pageSize,
      }),
    open: (row) => {
      this.currentCase.caseId.set(row.accountId);
      this.nav.selectChildById('ws-classification');
    },
  };
}
