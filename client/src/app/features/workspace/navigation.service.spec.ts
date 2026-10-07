import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { isTreeChildGroup, TreeChild } from './navigation.model';
import { NavigationService } from './navigation.service';
import { provideWorkspaceTestRouting, settleNavigation } from './navigation.testing';

describe('NavigationService', () => {
  let nav: NavigationService;
  let harness: RouterTestingHarness;
  let location: Location;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideWorkspaceTestRouting()] });
    nav = TestBed.inject(NavigationService);
    location = TestBed.inject(Location);
    // Land on the default screen exactly as the app does (via the route redirect).
    harness = await RouterTestingHarness.create('/workspace');
  });

  function flattenLeaves(): TreeChild[] {
    return nav.tree().flatMap((entry) => (isTreeChildGroup(entry) ? entry.children : [entry]));
  }

  it('replaces the old flat "Create New Order"/"Create Shipping Case" rows with expandable groups, directly in the top-level list', () => {
    const ordersGroup = nav.tree().find((entry) => entry.id === 'ws-orders-group');
    const shipmentGroup = nav.tree().find((entry) => entry.id === 'ws-shipment-group');

    expect(ordersGroup && isTreeChildGroup(ordersGroup)).toBe(true);
    expect(shipmentGroup && isTreeChildGroup(shipmentGroup)).toBe(true);
    if (!ordersGroup || !shipmentGroup || !isTreeChildGroup(ordersGroup) || !isTreeChildGroup(shipmentGroup)) {
      throw new Error('groups not found');
    }

    expect(ordersGroup.label).toBe('הזמנות');
    expect(ordersGroup.children.map((c) => c.page)).toEqual(['myOrders', 'order']);

    expect(shipmentGroup.label).toBe('תיקי שילוח');
    expect(shipmentGroup.children.map((c) => c.page)).toEqual(['myFiles', 'shipmentCaseWizard']);
  });

  it('removes the old standalone "בחר משלוח" (Select Shipment) node entirely', () => {
    expect(nav.tree().some((entry) => entry.id === 'shipmentSelect')).toBe(false);
  });

  it('removes the "תחנות עבודה" wrapper — its rows are now top-level, not nested under it', () => {
    expect(nav.tree().some((entry) => entry.id === 'workstations')).toBe(false);
    // Rows that used to live only inside it are now directly in the top-level list.
    expect(nav.tree().some((entry) => entry.id === 'ws-filing')).toBe(true);
    expect(nav.tree().some((entry) => entry.id === 'ws-classification')).toBe(true);
  });

  it('still exposes every previously-reachable page after the restructure', () => {
    const pages = flattenLeaves().map((c) => c.page);
    expect(pages).toEqual(
      expect.arrayContaining([
        'myOrders',
        'order',
        'myFiles',
        'shipmentCaseWizard',
        'filing',
        'classification',
      ]),
    );
  });

  it('puts "לוח בקרה" first in the tree, as a top-level row', () => {
    const first = nav.tree()[0];
    expect(isTreeChildGroup(first)).toBe(false);
    expect(first.id).toBe('ws-dashboard');
    expect(first.label).toBe('לוח בקרה');
  });

  it('lands on "לוח בקרה" at /workspace/dashboard with no group expanded', () => {
    expect(location.path()).toBe('/workspace/dashboard');
    expect(nav.activeScreen()).toBe('dashboard');
    expect(nav.isChildActive('ws-dashboard')).toBe(true);
    expect(nav.isNodeExpanded('ws-orders-group')).toBe(false);
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(false);
  });

  it('toggles a group independently of other groups', () => {
    nav.toggleNode('ws-orders-group');
    expect(nav.isNodeExpanded('ws-orders-group')).toBe(true);

    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(false);
    nav.toggleNode('ws-shipment-group');
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(true);
    expect(nav.isNodeExpanded('ws-orders-group')).toBe(true); // untouched

    nav.toggleNode('ws-shipment-group');
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(false);
  });

  it('selecting a leaf inside a collapsed group both activates it and reveals its group', async () => {
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(false);

    const myFiles = flattenLeaves().find((c) => c.page === 'myFiles')!;
    nav.selectChild(myFiles);
    await settleNavigation();

    expect(location.path()).toBe('/workspace/my-files');
    expect(nav.activeScreen()).toBe('myFiles');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(true);
  });

  it('openOrderForEdit shows the order screen but highlights "ההזמנות שלי", not "יצירת הזמנה חדשה"', async () => {
    nav.openOrderForEdit(1001);
    await settleNavigation();

    expect(location.path()).toBe('/workspace/order?orderId=1001');
    expect(nav.editOrderId()).toBe(1001);
    expect(nav.activeScreen()).toBe('order');
    expect(nav.isChildActive('ws-my-orders')).toBe(true);
    expect(nav.isChildActive('ws-order')).toBe(false);
  });

  it('openCaseForEdit shows the shipping-case wizard but highlights "התיקים שלי", not "יצירת תיק שילוח"', async () => {
    nav.openCaseForEdit(2002);
    await settleNavigation();

    expect(location.path()).toBe('/workspace/shipment?caseId=2002');
    expect(nav.editCaseId()).toBe(2002);
    expect(nav.activeScreen()).toBe('shipmentCaseWizard');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
    expect(nav.isChildActive('ws-shipment')).toBe(false);
  });

  it('selectChild on "יצירת הזמנה חדשה" bumps newOrderRequested (so the mounted screen resets even if it doesn\'t remount) and drops the edit id from the URL', async () => {
    nav.openOrderForEdit(1001); // now editing an existing order, "ההזמנות שלי" highlighted
    await settleNavigation();
    const before = nav.newOrderRequested();

    const createNew = flattenLeaves().find((c) => c.page === 'order')!;
    nav.selectChild(createNew);
    await settleNavigation();

    expect(nav.newOrderRequested()).toBe(before + 1);
    expect(nav.isChildActive('ws-order')).toBe(true);
    expect(location.path()).toBe('/workspace/order');
    expect(nav.editOrderId()).toBeNull();
    // Unrelated clicks must never bump it.
    const before2 = nav.newOrderRequested();
    nav.selectChild(flattenLeaves().find((c) => c.page === 'myOrders')!);
    await settleNavigation();
    expect(nav.newOrderRequested()).toBe(before2);
  });

  it('selectChild on "יצירת תיק שילוח" bumps newCaseRequested the same way', async () => {
    nav.openCaseForEdit(2002);
    await settleNavigation();
    const before = nav.newCaseRequested();

    const createNew = flattenLeaves().find((c) => c.page === 'shipmentCaseWizard')!;
    nav.selectChild(createNew);
    await settleNavigation();

    expect(nav.newCaseRequested()).toBe(before + 1);
    expect(nav.isChildActive('ws-shipment')).toBe(true);
    expect(location.path()).toBe('/workspace/shipment');
    expect(nav.editCaseId()).toBeNull();
  });

  it('re-selecting the already-active row bumps the counter but is a same-URL navigation (no new history entry)', async () => {
    const createNew = flattenLeaves().find((c) => c.page === 'order')!;
    nav.selectChild(createNew);
    await settleNavigation();
    expect(location.path()).toBe('/workspace/order');
    const before = nav.newOrderRequested();

    nav.selectChild(createNew);
    await settleNavigation();
    expect(nav.newOrderRequested()).toBe(before + 1);
    expect(location.path()).toBe('/workspace/order');

    // Back skips straight over the ignored same-URL navigation to the dashboard.
    location.back();
    await settleNavigation();
    expect(location.path()).toBe('/workspace/dashboard');
    expect(nav.activeScreen()).toBe('dashboard');
  });

  it('adds the "רשימות" group after "תיקי שילוח" with the five list pages, each mapped to its own screen', async () => {
    const ids = nav.tree().map((entry) => entry.id);
    expect(ids.indexOf('ws-lists-group')).toBe(ids.indexOf('ws-shipment-group') + 1);

    const lists = nav.tree().find((entry) => entry.id === 'ws-lists-group');
    if (!lists || !isTreeChildGroup(lists)) throw new Error('lists group not found');
    expect(lists.label).toBe('רשימות');
    expect(lists.children.map((c) => [c.id, c.page, c.label])).toEqual([
      ['ws-list-my-orders', 'listMyOrders', 'ההזמנות שלי'],
      ['ws-list-cases-in-release', 'listCasesInRelease', 'תיקים בהתרה'],
      ['ws-list-my-classifications', 'listMyClassifications', 'הסיווגים שלי'],
      ['ws-list-my-cases', 'listMyCases', 'התיקים שלי'],
      ['ws-list-import-processes', 'listImportProcesses', 'תהליכי יבוא'],
    ]);

    for (const child of lists.children) {
      nav.selectChild(child);
      await settleNavigation();
      expect(nav.activeScreen()).toBe(child.page);
      expect(nav.isChildActive(child.id)).toBe(true);
    }
    expect(nav.isNodeExpanded('ws-lists-group')).toBe(true);
  });

  it('goToList opens a list page by key and selectChildById selects a row by id', async () => {
    nav.goToList('listCasesInRelease');
    await settleNavigation();
    expect(location.path()).toBe('/workspace/list-cases-in-release');
    expect(nav.activeScreen()).toBe('listCasesInRelease');
    expect(nav.isChildActive('ws-list-cases-in-release')).toBe(true);
    expect(nav.activeGroupLabel()).toBe('רשימות');

    nav.selectChildById('ws-classification');
    await settleNavigation();
    expect(location.path()).toBe('/workspace/classification');
    expect(nav.activeScreen()).toBe('classification');
    expect(nav.isChildActive('ws-classification')).toBe(true);
  });

  it('goToMyOrders/goToMyFiles still resolve to the relocated My Orders/My Cases rows', async () => {
    nav.goToMyOrders();
    await settleNavigation();
    expect(nav.activeScreen()).toBe('myOrders');
    expect(nav.isChildActive('ws-my-orders')).toBe(true);

    nav.goToMyFiles();
    await settleNavigation();
    expect(nav.activeScreen()).toBe('myFiles');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
  });

  describe('URL ↔ screen', () => {
    it('maps every row to a slug (`ws-` prefix stripped, other ids as-is) and back', () => {
      const bySlug = Object.fromEntries(flattenLeaves().map((c) => [nav.slugOf(c), c.id]));
      expect(bySlug).toEqual({
        dashboard: 'ws-dashboard',
        'my-orders': 'ws-my-orders',
        order: 'ws-order',
        filing: 'ws-filing',
        'my-files': 'ws-my-files',
        shipment: 'ws-shipment',
        'list-my-orders': 'ws-list-my-orders',
        'list-cases-in-release': 'ws-list-cases-in-release',
        'list-my-classifications': 'ws-list-my-classifications',
        'list-my-cases': 'ws-list-my-cases',
        'list-import-processes': 'ws-list-import-processes',
        classification: 'ws-classification',
        'post-classification': 'ws-post-classification',
        'doc-review': 'ws-doc-review',
        transmit: 'ws-transmit',
        'land-transport': 'ws-land-transport',
        'imp-details': 'imp-details',
        'imp-invoice': 'imp-invoice',
        'imp-attachments': 'imp-attachments',
        'imp-transmissions': 'imp-transmissions',
        'imp-submissions': 'imp-submissions',
        'imp-notices': 'imp-notices',
      });
      for (const child of flattenLeaves()) {
        expect(nav.childBySlug(nav.slugOf(child))).toBe(child);
      }
      expect(nav.childBySlug('nope')).toBeNull();
      expect(nav.childBySlug('ws-dashboard')).toBeNull(); // the raw id is not a slug
    });

    it('selectChild(ws-list-my-cases) navigates to /workspace/list-my-cases', async () => {
      nav.selectChildById('ws-list-my-cases');
      await settleNavigation();

      expect(location.path()).toBe('/workspace/list-my-cases');
      expect(nav.activeScreen()).toBe('listMyCases');
      expect(nav.isChildActive('ws-list-my-cases')).toBe(true);
    });

    it('a deep link to an "הצהרת יבוא" child keeps its id as the slug and expands the group', async () => {
      await harness.navigateByUrl('/workspace/imp-invoice');

      expect(nav.activeScreen()).toBe('importDeclaration');
      expect(nav.isChildActive('imp-invoice')).toBe(true);
      expect(nav.isNodeExpanded('importDeclaration')).toBe(true);
      expect(nav.activeGroupLabel()).toBe('הצהרת יבוא');
    });

    it('Back returns to the previous screen: my-orders → dashboard → back = myOrders', async () => {
      await harness.navigateByUrl('/workspace/my-orders');
      expect(nav.activeScreen()).toBe('myOrders');
      await harness.navigateByUrl('/workspace/dashboard');
      expect(nav.activeScreen()).toBe('dashboard');

      location.back();
      await settleNavigation();

      expect(location.path()).toBe('/workspace/my-orders');
      expect(nav.activeScreen()).toBe('myOrders');
      expect(nav.isChildActive('ws-my-orders')).toBe(true);

      location.forward();
      await settleNavigation();
      expect(nav.activeScreen()).toBe('dashboard');
    });

    it('/workspace/order?orderId=7 queues order 7 for editing (and a plain /workspace/order clears it)', async () => {
      await harness.navigateByUrl('/workspace/order?orderId=7');

      expect(nav.editOrderId()).toBe(7);
      expect(nav.editCaseId()).toBeNull();
      expect(nav.activeScreen()).toBe('order');
      expect(nav.isChildActive('ws-my-orders')).toBe(true);

      await harness.navigateByUrl('/workspace/order');
      expect(nav.editOrderId()).toBeNull();
      expect(nav.isChildActive('ws-order')).toBe(true);
    });

    it('/workspace/shipment?caseId=9 queues MBL 9 for the wizard', async () => {
      await harness.navigateByUrl('/workspace/shipment?caseId=9');

      expect(nav.editCaseId()).toBe(9);
      expect(nav.editOrderId()).toBeNull();
      expect(nav.activeScreen()).toBe('shipmentCaseWizard');
      expect(nav.isChildActive('ws-my-files')).toBe(true);
    });

    it('ignores a malformed or misplaced edit id', async () => {
      await harness.navigateByUrl('/workspace/order?orderId=abc');
      expect(nav.editOrderId()).toBeNull();
      expect(nav.isChildActive('ws-order')).toBe(true);

      await harness.navigateByUrl('/workspace/dashboard?orderId=7');
      expect(nav.editOrderId()).toBeNull();
      expect(nav.activeScreen()).toBe('dashboard');
    });

    it('an unknown slug is replaced by the dashboard (no extra history entry)', async () => {
      await harness.navigateByUrl('/workspace/my-orders');
      await harness.navigateByUrl('/workspace/no-such-screen');
      await settleNavigation();

      expect(location.path()).toBe('/workspace/dashboard');
      expect(nav.activeScreen()).toBe('dashboard');
      expect(nav.isChildActive('ws-dashboard')).toBe(true);

      // replaceUrl: Back goes to the screen before the bad URL, not to the bad URL.
      location.back();
      await settleNavigation();
      expect(location.path()).toBe('/workspace/my-orders');
      expect(nav.activeScreen()).toBe('myOrders');
    });

    it('a bare /workspace redirects to the dashboard', async () => {
      await harness.navigateByUrl('/workspace/filing');
      await harness.navigateByUrl('/workspace');
      await settleNavigation();

      expect(TestBed.inject(Router).url).toBe('/workspace/dashboard');
      expect(nav.activeScreen()).toBe('dashboard');
    });
  });
});
