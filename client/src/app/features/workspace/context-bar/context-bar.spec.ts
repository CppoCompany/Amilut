import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ActiveContextService } from '../active-context.service';
import { NavigationService } from '../navigation.service';
import { ContextBar } from './context-bar';

describe('ContextBar', () => {
  let fixture: ComponentFixture<ContextBar>;
  let activeContext: ActiveContextService;
  let nav: NavigationService;
  let http: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ContextBar],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    activeContext = TestBed.inject(ActiveContextService);
    nav = TestBed.inject(NavigationService);
    http = TestBed.inject(HttpTestingController);
    await activeContext.ready; // nothing persisted, resolves immediately

    fixture = TestBed.createComponent(ContextBar);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function tabs(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.context-bar__item'));
  }

  function tabByKey(key: string): HTMLElement {
    return fixture.nativeElement.querySelector(`[data-tab-key="${key}"]`) as HTMLElement;
  }

  function closeButton(tab: HTMLElement): HTMLButtonElement {
    return tab.querySelector('.context-bar__close') as HTMLButtonElement;
  }

  describe('rendering', () => {
    it('shows all eight tabs, empty, by default', () => {
      const items = tabs();
      expect(items.length).toBe(8);

      const expectedNames = [
        ['order', 'מספר הזמנה'],
        ['file', 'מספר תיק עמילות מכס'],
        ['supplierName', 'שם ספק'],
        ['customerName', 'שם לקוח'],
        ['cargoDescription', 'תיאור טובין'],
        ['transactionNumber', 'מספר עסקה'],
        ['manifestNumber', 'מספר מצהר'],
        ['billOfLadingNumber', 'מספר שטר מטען'],
      ] as const;
      for (const [key, name] of expectedNames) {
        expect(tabByKey(key).querySelector('.context-bar__label')?.textContent).toBe(name);
        expect(tabByKey(key).querySelector('.context-bar__value')).toBeNull();
        expect(tabByKey(key).classList.contains('context-bar__item--static')).toBe(true);
      }
    });

    it('renders the order tab with its number and close button once a real order is open, styled like every other tab', () => {
      activeContext.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      fixture.detectChanges();

      const tab = tabByKey('order');
      expect(tab.querySelector('.context-bar__label')?.textContent).toBe('מספר הזמנה');
      expect(tab.querySelector('.context-bar__value')?.textContent).toBe('5678');
      expect(closeButton(tab).getAttribute('aria-label')).toBe('סגור הזמנה הזמנה #5678');
      expect(tab.classList.contains('context-bar__item--static')).toBe(false);
      expect(tabs().length).toBe(8); // the other seven are unaffected

      // No per-tab styling variants, and no leading type icon on any tab
      // (the close button's own "x" icon is unrelated) — every tab (empty,
      // populated, closeable or not) shares the exact same base markup.
      const placeholder = tabByKey('file');
      expect(placeholder.querySelector('.context-bar__label')).toBeTruthy();
      expect(placeholder.querySelector('i')).toBeNull();
      expect(tab.querySelector('i:not(.context-bar__close i)')).toBeNull();
    });

    it('a draft (unsaved) order shows the tab name only, with no value yet', () => {
      activeContext.open({ type: 'order', id: 'draft', label: 'הזמנה חדשה' });
      fixture.detectChanges();

      expect(tabByKey('order').querySelector('.context-bar__label')?.textContent).toBe('מספר הזמנה');
    });

    it('populates supplier/customer tabs from the open order, and cargo/transaction/manifest from the open case', () => {
      activeContext.open({
        type: 'order',
        id: '5678',
        label: 'הזמנה #5678',
        meta: { customerName: 'ACME', supplierName: 'Global Freight' },
      });
      activeContext.open({
        type: 'file',
        id: '99',
        label: 'תיק #99',
        meta: {
          cargoDescription: 'Electronics',
          transactionNumber: 'TXN-1',
          manifestNumber: 'MAN-2',
        },
      });
      fixture.detectChanges();

      expect(tabByKey('customerName').querySelector('.context-bar__value')?.textContent).toBe('ACME');
      expect(tabByKey('supplierName').querySelector('.context-bar__value')?.textContent).toBe(
        'Global Freight',
      );
      expect(tabByKey('cargoDescription').querySelector('.context-bar__value')?.textContent).toBe(
        'Electronics',
      );
      expect(tabByKey('transactionNumber').querySelector('.context-bar__value')?.textContent).toBe(
        'TXN-1',
      );
      expect(tabByKey('manifestNumber').querySelector('.context-bar__value')?.textContent).toBe('MAN-2');
      // The case's meta never leaks into the order-owned tabs and vice versa.
      expect(tabByKey('order').querySelector('.context-bar__value')?.textContent).toBe('5678');
      expect(tabByKey('file').querySelector('.context-bar__value')?.textContent).toBe('99');
    });

    it('closing the order reverts Order Number/Customer/Supplier to name-only, tabs stay visible', () => {
      activeContext.open({
        type: 'order',
        id: '5678',
        label: 'הזמנה #5678',
        meta: { customerName: 'ACME', supplierName: 'Global Freight' },
      });
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();

      expect(tabs().length).toBe(8);
      expect(tabByKey('order').querySelector('.context-bar__label')?.textContent).toBe('מספר הזמנה');
      expect(tabByKey('customerName').querySelector('.context-bar__label')?.textContent).toBe('שם לקוח');
      expect(tabByKey('supplierName').querySelector('.context-bar__label')?.textContent).toBe('שם ספק');
    });

    it('shows a dirty indicator only when the item is dirty', () => {
      activeContext.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      fixture.detectChanges();
      expect(tabByKey('order').querySelector('.context-bar__dirty-dot')).toBeNull();

      activeContext.markDirty('order', '5678', true);
      fixture.detectChanges();
      expect(tabByKey('order').querySelector('.context-bar__dirty-dot')).toBeTruthy();
    });

    it('shows an optional status badge only when meta.statusLabel is supplied', () => {
      activeContext.open({ type: 'file', id: '1', label: 'תיק #1', meta: { statusLabel: 'פתוח' } });
      fixture.detectChanges();
      expect(tabByKey('file').querySelector('.context-bar__badge')?.textContent).toBe('פתוח');
    });

    it('ellipsizes long labels via CSS and exposes the full text as a tooltip', () => {
      const longLabel = 'הזמנה עם תיאור ארוך מאוד שלא אמור להישבר את הפריסה של הסרגל';
      activeContext.open({ type: 'order', id: '9', label: longLabel });
      fixture.detectChanges();

      expect(tabByKey('order').getAttribute('title')).toBe(`הזמנה ${longLabel}`);
    });
  });

  describe('highlighting', () => {
    it('marks only the current item as selected', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' }); // becomes current
      fixture.detectChanges();

      const orderTab = tabByKey('order');
      const fileTab = tabByKey('file');
      expect(orderTab.getAttribute('aria-selected')).toBe('false');
      expect(orderTab.classList.contains('context-bar__item--current')).toBe(false);
      expect(fileTab.getAttribute('aria-selected')).toBe('true');
      expect(fileTab.classList.contains('context-bar__item--current')).toBe(true);
    });

    it('clicking a tab makes it current and reopens its screen', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      tabByKey('order').click(); // the order tab, currently not selected
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('order:1');
      expect(nav.editOrderId()).toBe(1);
    });
  });

  describe('close flow', () => {
    it('closes a clean item immediately, with no dialog', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();

      expect(activeContext.items()).toEqual([]);
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    });

    it('prompts before closing a dirty item, and Cancel leaves it open', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();

      (fixture.nativeElement.querySelector('.btn-secondary:not(.discard-btn)') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(activeContext.items().map((i) => i.id)).toEqual(['1']); // still open
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    });

    it('Discard closes the dirty item without saving', async () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.discard-btn') as HTMLButtonElement).click();
      await Promise.resolve(); // flush the async continuation after the dialog's choice resolves
      fixture.detectChanges();

      expect(activeContext.items()).toEqual([]);
    });

    it('Save invokes the registered save handler and only closes once it resolves true', async () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      let saveCalls = 0;
      activeContext.registerSaveHandler('order', '1', () => {
        saveCalls++;
        return of(true);
      });
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve(); // one extra tick: the registered handler's Observable also resolves via firstValueFrom
      fixture.detectChanges();

      expect(saveCalls).toBe(1);
      expect(activeContext.items()).toEqual([]);
    });

    it('a failed Save leaves the item open', async () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      activeContext.registerSaveHandler('order', '1', () => of(false));
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      expect(activeContext.items().map((i) => i.id)).toEqual(['1']);
    });

    it('falls back to the previously-open item when the current one is closed', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' }); // current
      fixture.detectChanges();

      closeButton(tabByKey('file')).click(); // close the current (file) item
      fixture.detectChanges();

      expect(activeContext.items().map((i) => i.id)).toEqual(['1']);
      expect(activeContext.currentId()).toBe('order:1');
      expect(nav.editOrderId()).toBe(1); // its screen was reopened as the fallback
    });

    it('navigates to the relevant list page when the last item is closed', () => {
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      const goToMyFiles = vi.spyOn(nav, 'goToMyFiles');
      closeButton(tabByKey('file')).click();
      fixture.detectChanges();

      expect(activeContext.items()).toEqual([]);
      expect(goToMyFiles).toHaveBeenCalled();
    });

    it('closing a non-current item does not disturb the current one', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' }); // current
      fixture.detectChanges();

      closeButton(tabByKey('order')).click(); // close the non-current order
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('file:2');
      expect(activeContext.items().map((i) => i.id)).toEqual(['2']);
    });
  });

  describe('keyboard interaction', () => {
    it('Enter activates a tab', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      tabByKey('order').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('order:1');
    });

    it('Space activates a tab', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      tabByKey('order').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('order:1');
    });

    it('Escape cancels the unsaved-changes dialog', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      fixture.detectChanges();

      closeButton(tabByKey('order')).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
      expect(activeContext.items().map((i) => i.id)).toEqual(['1']); // still open
    });
  });
});
