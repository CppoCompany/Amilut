import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ActiveContextService } from '../../features/workspace/active-context.service';
import { ContextDialogService } from '../../features/workspace/context-dialog.service';
import { itemOpenGuard } from './item-open.guard';

describe('itemOpenGuard', () => {
  let injector: Injector;
  let activeContext: ActiveContextService;
  let dialogs: ContextDialogService;

  beforeEach(async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    injector = TestBed.inject(Injector);
    activeContext = TestBed.inject(ActiveContextService);
    dialogs = TestBed.inject(ContextDialogService);
    TestBed.inject(HttpTestingController).verify(); // nothing persisted, so no validation calls
    await activeContext.ready;
  });

  afterEach(() => sessionStorage.clear());

  function run(request: { type: 'order' | 'file'; id: string; label: string }) {
    return runInInjectionContext(injector, () => itemOpenGuard(request));
  }

  describe('no active item path', () => {
    it('opens directly and allows when nothing of that type is open', async () => {
      const allowed = await run({ type: 'order', id: '5678', label: 'הזמנה #5678' });

      expect(allowed).toBe(true);
      expect(activeContext.items()).toEqual([
        expect.objectContaining({ type: 'order', id: '5678' }),
      ]);
      expect(activeContext.currentId()).toBe('order:5678');
    });

    it('re-opening the same (type, id) is a no-op collision — just updates in place', async () => {
      activeContext.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });

      const allowed = await run({ type: 'order', id: '5678', label: 'הזמנה #5678 (עודכן)' });

      expect(allowed).toBe(true);
      expect(activeContext.items().length).toBe(1);
      expect(activeContext.current()?.label).toBe('הזמנה #5678 (עודכן)');
    });
  });

  it('replaces a clean conflicting item silently, no dialog', async () => {
    activeContext.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });

    const allowed = await run({ type: 'order', id: '2000', label: 'הזמנה #2000' });

    expect(allowed).toBe(true);
    expect(activeContext.items().map((i) => i.id)).toEqual(['2000']);
    expect(dialogs.pendingUnsavedChanges()).toBeNull();
  });

  describe('dirty conflicting item — all three dialog outcomes', () => {
    beforeEach(() => {
      activeContext.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });
      activeContext.markDirty('order', '1000', true);
    });

    it('Cancel blocks the open — nothing changes', async () => {
      const guardPromise = run({ type: 'order', id: '2000', label: 'הזמנה #2000' });

      expect(dialogs.pendingUnsavedChanges()?.id).toBe('1000');
      dialogs.resolveUnsavedChanges('cancel');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.items().map((i) => i.id)).toEqual(['1000']);
    });

    it('Discard evicts the old item and opens the new one', async () => {
      const guardPromise = run({ type: 'order', id: '2000', label: 'הזמנה #2000' });
      dialogs.resolveUnsavedChanges('discard');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
      expect(activeContext.items().map((i) => i.id)).toEqual(['2000']);
    });

    it('Save opens the new item once the registered handler resolves true', async () => {
      activeContext.registerSaveHandler('order', '1000', () => of(true));

      const guardPromise = run({ type: 'order', id: '2000', label: 'הזמנה #2000' });
      dialogs.resolveUnsavedChanges('save');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
      expect(activeContext.items().map((i) => i.id)).toEqual(['2000']);
    });

    it('a failed Save blocks the open and leaves the old item in place', async () => {
      activeContext.registerSaveHandler('order', '1000', () => of(false));

      const guardPromise = run({ type: 'order', id: '2000', label: 'הזמנה #2000' });
      dialogs.resolveUnsavedChanges('save');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.items().map((i) => i.id)).toEqual(['1000']);
    });
  });

  it('does not treat a different type as conflicting', async () => {
    activeContext.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });
    activeContext.markDirty('order', '1000', true);

    const allowed = await run({ type: 'file', id: '1', label: 'תיק #1' });

    expect(allowed).toBe(true);
    expect(activeContext.items().map((i) => i.id).sort()).toEqual(['1', '1000']);
    expect(dialogs.pendingUnsavedChanges()).toBeNull();
  });
});
