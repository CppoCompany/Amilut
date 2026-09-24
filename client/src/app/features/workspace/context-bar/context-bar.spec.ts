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

  function closeButton(tab: HTMLElement): HTMLButtonElement {
    return tab.querySelector('.context-bar__close') as HTMLButtonElement;
  }

  describe('rendering', () => {
    it('shows the empty state when nothing is open', () => {
      expect(fixture.nativeElement.querySelector('.context-bar__empty').textContent).toContain(
        'אין פריטים פתוחים',
      );
      expect(tabs().length).toBe(0);
    });

    it('renders one tab per open item with its label, icon, and close button', () => {
      activeContext.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      fixture.detectChanges();

      const items = tabs();
      expect(items.length).toBe(1);
      expect(items[0].querySelector('.context-bar__label')?.textContent).toBe('הזמנה #5678');
      expect(items[0].querySelector('i.fa-file-invoice')).toBeTruthy();
      expect(closeButton(items[0]).getAttribute('aria-label')).toBe('סגור הזמנה הזמנה #5678');
    });

    it('shows a dirty indicator only when the item is dirty', () => {
      activeContext.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      fixture.detectChanges();
      expect(tabs()[0].querySelector('.context-bar__dirty-dot')).toBeNull();

      activeContext.markDirty('order', '5678', true);
      fixture.detectChanges();
      expect(tabs()[0].querySelector('.context-bar__dirty-dot')).toBeTruthy();
    });

    it('shows an optional status badge only when meta.statusLabel is supplied', () => {
      activeContext.open({ type: 'file', id: '1', label: 'תיק #1', meta: { statusLabel: 'פתוח' } });
      fixture.detectChanges();
      expect(tabs()[0].querySelector('.context-bar__badge')?.textContent).toBe('פתוח');
    });

    it('ellipsizes long labels via CSS and exposes the full text as a tooltip', () => {
      const longLabel = 'הזמנה עם תיאור ארוך מאוד שלא אמור להישבר את הפריסה של הסרגל';
      activeContext.open({ type: 'order', id: '9', label: longLabel });
      fixture.detectChanges();

      expect(tabs()[0].getAttribute('title')).toBe(`הזמנה ${longLabel}`);
    });
  });

  describe('highlighting', () => {
    it('marks only the current item as selected', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' }); // becomes current
      fixture.detectChanges();

      const [orderTab, fileTab] = tabs();
      expect(orderTab.getAttribute('aria-selected')).toBe('false');
      expect(orderTab.classList.contains('context-bar__item--current')).toBe(false);
      expect(fileTab.getAttribute('aria-selected')).toBe('true');
      expect(fileTab.classList.contains('context-bar__item--current')).toBe(true);
    });

    it('clicking a tab makes it current and reopens its screen', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      tabs()[0].click(); // the order tab, currently not selected
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('order:1');
      expect(nav.editOrderId()).toBe(1);
    });
  });

  describe('close flow', () => {
    it('closes a clean item immediately, with no dialog', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      fixture.detectChanges();

      closeButton(tabs()[0]).click();
      fixture.detectChanges();

      expect(activeContext.items()).toEqual([]);
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    });

    it('prompts before closing a dirty item, and Cancel leaves it open', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      fixture.detectChanges();

      closeButton(tabs()[0]).click();
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

      closeButton(tabs()[0]).click();
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

      closeButton(tabs()[0]).click();
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

      closeButton(tabs()[0]).click();
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

      closeButton(tabs()[1]).click(); // close the current (file) item
      fixture.detectChanges();

      expect(activeContext.items().map((i) => i.id)).toEqual(['1']);
      expect(activeContext.currentId()).toBe('order:1');
      expect(nav.editOrderId()).toBe(1); // its screen was reopened as the fallback
    });

    it('navigates to the relevant list page when the last item is closed', () => {
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      const goToMyFiles = vi.spyOn(nav, 'goToMyFiles');
      closeButton(tabs()[0]).click();
      fixture.detectChanges();

      expect(activeContext.items()).toEqual([]);
      expect(goToMyFiles).toHaveBeenCalled();
    });

    it('closing a non-current item does not disturb the current one', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' }); // current
      fixture.detectChanges();

      closeButton(tabs()[0]).click(); // close the non-current order
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

      tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('order:1');
    });

    it('Space activates a tab', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.open({ type: 'file', id: '2', label: 'תיק #2' });
      fixture.detectChanges();

      tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      fixture.detectChanges();

      expect(activeContext.currentId()).toBe('order:1');
    });

    it('Escape cancels the unsaved-changes dialog', () => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
      fixture.detectChanges();

      closeButton(tabs()[0]).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
      expect(activeContext.items().map((i) => i.id)).toEqual(['1']); // still open
    });
  });
});
