import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MBL_STATUS_LABELS, MBL_STATUSES, MblStatus } from '../../../../../api/enums';
import { MblApi, MblSortKey } from '../../../../../api/mbl-api';
import type { MblSummaryDto } from '../../../../../api/models';
import { NavigationService } from '../../../navigation.service';
import { ListPage } from '../list-page/list-page';
import type { ListPageConfig } from '../list-page.model';
import { mblCaseColumns } from '../mbl-case-columns';

/**
 * "תהליכי יבוא" (רשימות) — every shipping case in the system, any handler and
 * any status (`GET /api/mbl/paged` with no scoping). Each MBL case is one
 * import process.
 */
@Component({
  selector: 'app-import-processes-list-screen',
  imports: [ListPage],
  template: `<app-list-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportProcessesListScreen {
  private readonly mblApi = inject(MblApi);
  private readonly nav = inject(NavigationService);

  protected readonly config: ListPageConfig<MblSummaryDto> = {
    page: 'listImportProcesses',
    title: 'תהליכי יבוא',
    defaultSort: 'createdAt',
    statusOptions: MBL_STATUSES.map((value) => ({ value, label: MBL_STATUS_LABELS[value] })),
    showCustomer: true,
    searchPlaceholder: 'מספר תיק, MBL, מוביל או לקוח',
    rowKey: (mblCase) => mblCase.id,
    errorText: 'טעינת תהליכי היבוא נכשלה',
    columns: mblCaseColumns(),
    load: (params) =>
      this.mblApi.listPaged({
        q: params.q,
        status: params.status as MblStatus | undefined,
        customerId: params.customerId,
        from: params.from,
        to: params.to,
        sort: params.sort as MblSortKey,
        dir: params.dir,
        page: params.page,
        pageSize: params.pageSize,
      }),
    open: (mblCase) => this.nav.openCaseForEdit(mblCase.id),
  };
}
