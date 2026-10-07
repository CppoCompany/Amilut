import { TestBed } from '@angular/core/testing';

import { isTreeChildGroup, TreeChild } from './navigation.model';
import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
  let nav: NavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    nav = TestBed.inject(NavigationService);
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

  it('defaults to "לוח בקרה" with no group expanded', () => {
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

  it('selecting a leaf inside a collapsed group both activates it and reveals its group', () => {
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(false);

    const myFiles = flattenLeaves().find((c) => c.page === 'myFiles')!;
    nav.selectChild(myFiles);

    expect(nav.activeScreen()).toBe('myFiles');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
    expect(nav.isNodeExpanded('ws-shipment-group')).toBe(true);
  });

  it('openOrderForEdit shows the order screen but highlights "ההזמנות שלי", not "יצירת הזמנה חדשה"', () => {
    nav.openOrderForEdit(1001);

    expect(nav.editOrderId()).toBe(1001);
    expect(nav.activeScreen()).toBe('order');
    expect(nav.isChildActive('ws-my-orders')).toBe(true);
    expect(nav.isChildActive('ws-order')).toBe(false);
  });

  it('openCaseForEdit shows the shipping-case wizard but highlights "התיקים שלי", not "יצירת תיק שילוח"', () => {
    nav.openCaseForEdit(2002);

    expect(nav.editCaseId()).toBe(2002);
    expect(nav.activeScreen()).toBe('shipmentCaseWizard');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
    expect(nav.isChildActive('ws-shipment')).toBe(false);
  });

  it('selectChild on "יצירת הזמנה חדשה" bumps newOrderRequested (so the mounted screen resets even if it doesn\'t remount)', () => {
    nav.openOrderForEdit(1001); // now editing an existing order, "ההזמnות שלי" highlighted
    const before = nav.newOrderRequested();

    const createNew = flattenLeaves().find((c) => c.page === 'order')!;
    nav.selectChild(createNew);

    expect(nav.newOrderRequested()).toBe(before + 1);
    expect(nav.isChildActive('ws-order')).toBe(true);
    // Unrelated clicks must never bump it.
    const before2 = nav.newOrderRequested();
    nav.selectChild(flattenLeaves().find((c) => c.page === 'myOrders')!);
    expect(nav.newOrderRequested()).toBe(before2);
  });

  it('selectChild on "יצירת תיק שילוח" bumps newCaseRequested the same way', () => {
    nav.openCaseForEdit(2002);
    const before = nav.newCaseRequested();

    const createNew = flattenLeaves().find((c) => c.page === 'shipmentCaseWizard')!;
    nav.selectChild(createNew);

    expect(nav.newCaseRequested()).toBe(before + 1);
    expect(nav.isChildActive('ws-shipment')).toBe(true);
  });

  it('adds the "רשימות" group after "תיקי שילוח" with the five list pages, each mapped to its own screen', () => {
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
      expect(nav.activeScreen()).toBe(child.page);
      expect(nav.isChildActive(child.id)).toBe(true);
    }
    expect(nav.isNodeExpanded('ws-lists-group')).toBe(true);
  });

  it('goToList opens a list page by key and selectChildById selects a row by id', () => {
    nav.goToList('listCasesInRelease');
    expect(nav.activeScreen()).toBe('listCasesInRelease');
    expect(nav.isChildActive('ws-list-cases-in-release')).toBe(true);
    expect(nav.activeGroupLabel()).toBe('רשימות');

    nav.selectChildById('ws-classification');
    expect(nav.activeScreen()).toBe('classification');
    expect(nav.isChildActive('ws-classification')).toBe(true);
  });

  it('the default landing screen is unchanged by the lists group', () => {
    expect(nav.activeScreen()).toBe('order');
    expect(nav.isChildActive('ws-order')).toBe(true);
  });

  it('goToMyOrders/goToMyFiles still resolve to the relocated My Orders/My Cases rows', () => {
    nav.goToMyOrders();
    expect(nav.activeScreen()).toBe('myOrders');
    expect(nav.isChildActive('ws-my-orders')).toBe(true);

    nav.goToMyFiles();
    expect(nav.activeScreen()).toBe('myFiles');
    expect(nav.isChildActive('ws-my-files')).toBe(true);
  });
});
