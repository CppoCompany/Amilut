import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';

import { FilingContextPicker } from '../../filing-context-picker/filing-context-picker';
import { FilingContextService } from '../../filing-context.service';
import { ImportFilesPanel } from '../../import-files-panel/import-files-panel';
import { NavigationService } from '../../navigation.service';

/** "תיוק ניירת יבוא" — import paperwork filing view, scoped to an Order or a Customs Clearance File. */
@Component({
  selector: 'app-filing-screen',
  imports: [FilingContextPicker, ImportFilesPanel],
  templateUrl: './filing.html',
  styleUrl: './filing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilingScreen {
  private readonly nav = inject(NavigationService);
  private readonly filingContext = inject(FilingContextService);

  protected readonly context = this.filingContext.context;

  constructor() {
    // The Order/CCF screens' "תיוק ניירת יבוא" link and "ייבוא מסמכים" in
    // "ההזמנות שלי" navigate to `/workspace/filing?orderId=N`/`?ccfId=N`,
    // which NavigationService.applyUrl turns into `openFilingContext` before
    // this screen shows. Consume it once as soon as it appears and preselect
    // it in the (shared) context picker. An effect rather than a one-shot
    // constructor read, same reasoning as the order screen's `editOrderId`:
    // Back/Forward can land on a filing URL while this instance is already
    // mounted.
    effect(() => {
      const incoming = this.nav.openFilingContext();
      if (incoming === null) return;
      untracked(() => {
        this.nav.openFilingContext.set(null);
        this.filingContext.context.set(incoming);
      });
    });
  }
}
