import { Component, inject, signal } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { Breadcrumb } from './breadcrumb/breadcrumb';
import { isTreeChildGroup } from './navigation.model';
import { NavigationService } from './navigation.service';
import { ClassificationScreen } from './screens/classification/classification';
import { DashboardScreen } from './screens/dashboard/dashboard';
import { FilingScreen } from './screens/filing/filing';
import { ImportDeclarationScreen } from './screens/import-declaration/import-declaration';
import { MyFilesScreen } from './screens/my-files/my-files';
import { MyOrdersScreen } from './screens/my-orders/my-orders';
import { OrderScreen } from './screens/order/order';
import { PlaceholderScreen } from './screens/placeholder/placeholder';
import { ShipmentCaseWizardScreen } from './screens/shipment-case-wizard/shipment-case-wizard';

/**
 * Workspace shell: top header, sidebar tree, and the content area whose screen
 * is chosen by {@link NavigationService}. The sidebar is driven by the service's
 * tree model, and `nav.activeScreen()` decides which panel is rendered.
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
    PlaceholderScreen,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
})
export class Workspace {
  protected readonly nav = inject(NavigationService);
  protected readonly auth = inject(AuthService);
  /** Lets the template tell a plain leaf row from an expandable sub-group. */
  protected readonly isGroup = isTreeChildGroup;

  /** Collapsed (icon-only) by default; toggled by the sidebar's own expand/close button. */
  protected readonly sidebarExpanded = signal(false);

  protected toggleSidebar(): void {
    this.sidebarExpanded.update((expanded) => !expanded);
  }
}
