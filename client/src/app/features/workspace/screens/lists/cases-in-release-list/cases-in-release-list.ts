import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MblStatus } from '../../../../../api/enums';
import { MblApi, MblSortKey } from '../../../../../api/mbl-api';
import type { MblSummaryDto } from '../../../../../api/models';
import { NavigationService } from '../../../navigation.service';
import { ListPage } from '../list-page/list-page';
import type { ListPageConfig } from '../list-page.model';
import { mblCaseColumns } from '../mbl-case-columns';

/**
 * "תיקים בהתרה" (רשימות) — every shipping case whose status is `in_release`
 * (customs release in progress), any handler (`GET /api/mbl/paged?status=in_release`).
 * The status is the page's definition, so there is no status select here.
 */
@Component({
  selector: 'app-cases-in-release-list-screen',
  imports: [ListPage],
  template: `<app-list-page [config]="config" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CasesInReleaseListScreen {
  private readonly mblApi = inject(MblApi);
  private readonly nav = inject(NavigationService);

  protected readonly config: ListPageConfig<MblSummaryDto> = {
    page: 'listCasesInRelease',
    title: 'תיקים בהתרה',
    defaultSort: 'createdAt',
    showCustomer: true,
    searchPlaceholder: 'מספר תיק, MBL, מוביל או לקוח',
    rowKey: (mblCase) => mblCase.id,
    errorText: 'טעינת התיקים נכשלה',
    columns: mblCaseColumns(),
    load: (params) =>
      this.mblApi.listPaged({
        status: MblStatus.IN_RELEASE,
        q: params.q,
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
