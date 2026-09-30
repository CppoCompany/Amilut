import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { NavigationService } from './navigation.service';
import { ClassificationScreen } from './screens/classification/classification';
import { FilingScreen } from './screens/filing/filing';
import { ImportDeclarationScreen } from './screens/import-declaration/import-declaration';
import { MyFilesScreen } from './screens/my-files/my-files';
import { MyOrdersScreen } from './screens/my-orders/my-orders';
import { OrderScreen } from './screens/order/order';
import { PlaceholderScreen } from './screens/placeholder/placeholder';
import { ShipmentScreen } from './screens/shipment/shipment';

/**
 * Workspace shell: top header, sidebar tree, and the content area whose screen
 * is chosen by {@link NavigationService}. The sidebar is driven by the service's
 * tree model, and `nav.activeScreen()` decides which panel is rendered.
 */
@Component({
  selector: 'app-workspace',
  imports: [
    OrderScreen,
    FilingScreen,
    ShipmentScreen,
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
}
