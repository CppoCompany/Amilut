import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { Breadcrumb } from './breadcrumb/breadcrumb';
import { isTreeChildGroup } from './navigation.model';
import { NavigationService } from './navigation.service';
import { ClassificationScreen } from './screens/classification/classification';
import { DashboardScreen } from './screens/dashboard/dashboard';
import { FilingScreen } from './screens/filing/filing';
import { ImportDeclarationScreen } from './screens/import-declaration/import-declaration';
import { CasesInReleaseListScreen } from './screens/lists/cases-in-release-list/cases-in-release-list';
import { ImportProcessesListScreen } from './screens/lists/import-processes-list/import-processes-list';
import { MyCasesListScreen } from './screens/lists/my-cases-list/my-cases-list';
import { MyClassificationsListScreen } from './screens/lists/my-classifications-list/my-classifications-list';
import { MyOrdersListScreen } from './screens/lists/my-orders-list/my-orders-list';
import { MyFilesScreen } from './screens/my-files/my-files';
import { MyOrdersScreen } from './screens/my-orders/my-orders';
import { OrderScreen } from './screens/order/order';
import { PlaceholderScreen } from './screens/placeholder/placeholder';
import { ShipmentCaseWizardScreen } from './screens/shipment-case-wizard/shipment-case-wizard';

/**
 * Workspace shell: top header, sidebar tree, and the content area whose screen
 * is chosen by {@link NavigationService}. The sidebar is driven by the service's
 * tree model, and `nav.activeScreen()` decides which panel is rendered.
 *
 * Routed at `/workspace/:slug`. The shell is the bridge from the URL to the
 * service: it feeds every `:slug` / query-param change into
 * `nav.applyUrl(...)`, so the active screen is always derived from the URL
 * (Back/Forward, refresh and deep links included). The router reuses this one
 * instance across slug changes, so the sidebar and header never remount.
 */
@Component({
  selector: 'app-workspace',
  imports: [
    Breadcrumb,
    DashboardScreen,
    OrderScreen,
    FilingScreen,
    ShipmentCaseWizardScreen,
    ClassificationScreen,
    ImportDeclarationScreen,
    MyOrdersScreen,
    MyFilesScreen,
    MyOrdersListScreen,
    CasesInReleaseListScreen,
    MyClassificationsListScreen,
    MyCasesListScreen,
    ImportProcessesListScreen,
    PlaceholderScreen,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  protected readonly nav = inject(NavigationService);
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  /** Lets the template tell a plain leaf row from an expandable sub-group. */
  protected readonly isGroup = isTreeChildGroup;

  /** Collapsed (icon-only) by default; toggled by the sidebar's own expand/close button. */
  protected readonly sidebarExpanded = signal(false);

  constructor() {
    // Both streams replay synchronously on subscribe, so the first URL is
    // applied before this shell's first render — no flash of the wrong screen.
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, query]) => this.nav.applyUrl(params.get('slug') ?? '', query));
  }

  protected toggleSidebar(): void {
    this.sidebarExpanded.update((expanded) => !expanded);
  }
}
