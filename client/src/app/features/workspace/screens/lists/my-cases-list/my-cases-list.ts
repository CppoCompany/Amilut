import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MBL_STATUS_LABELS, MBL_STATUSES, MblStatus } from '../../../../../api/enums';
import { MblApi, MblSortKey } from '../../../../../api/mbl-api';
import type { MblSummaryDto } from '../../../../../api/models';
import { NavigationService } from '../../../navigation.service';
import { ListPage } from '../list-page/list-page';
import type { ListPageConfig } from '../list-page.model';
import { mblCaseColumns } from '../mbl-case-columns';

/** "התיקים שלי" (רשימות) — the shipping cases opened by the signed-in user (`GET /api/mbl/paged?mine=true`). */
@Component({
  selector: 'app-my-cases-list-screen',
  imports: [ListPage],
  template: `<app-list-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyCasesListScreen {
  private readonly mblApi = inject(MblApi);
  private readonly nav = inject(NavigationService);

  protected readonly config: ListPageConfig<MblSummaryDto> = {
    page: 'listMyCases',
    title: 'התיקים שלי',
    defaultSort: 'createdAt',
    statusOptions: MBL_STATUSES.map((value) => ({ value, label: MBL_STATUS_LABELS[value] })),
    showCustomer: true,
    searchPlaceholder: 'מספר תיק, MBL, מוביל או לקוח',
    rowKey: (mblCase) => mblCase.id,
    errorText: 'טעינת התיקים נכשלה',
    columns: mblCaseColumns(),
    load: (params) =>
      this.mblApi.listPaged({
        mine: true,
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
