import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ActiveContextService } from '../../features/workspace/active-context.service';
import { ContextDialogService } from '../../features/workspace/context-dialog.service';
import { canDeactivateCurrentItemGuard } from './can-deactivate.guard';

describe('canDeactivateCurrentItemGuard', () => {
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
    TestBed.inject(HttpTestingController).verify();
    await activeContext.ready;
  });

  afterEach(() => sessionStorage.clear());

  function run() {
    return runInInjectionContext(injector, () => canDeactivateCurrentItemGuard());
  }

  describe('no active item path', () => {
    it('allows immediately when nothing is open', async () => {
      const allowed = await run();
      expect(allowed).toBe(true);
      expect(dialogs.pendingUnsavedChanges()).toBeNull();
    });
  });

  it('allows immediately when the current item is clean', async () => {
    activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });

    const allowed = await run();

    expect(allowed).toBe(true);
    expect(dialogs.pendingUnsavedChanges()).toBeNull();
  });

  describe('a dirty current item — all three dialog outcomes', () => {
    beforeEach(() => {
      activeContext.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      activeContext.markDirty('order', '1', true);
    });

    it('Cancel blocks the navigation', async () => {
      const guardPromise = run();
      expect(dialogs.pendingUnsavedChanges()?.id).toBe('1');

      dialogs.resolveUnsavedChanges('cancel');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.items().map((i) => i.id)).toEqual(['1']); // untouched either way
    });

    it('Discard allows the navigation', async () => {
      const guardPromise = run();
      dialogs.resolveUnsavedChanges('discard');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
    });

    it('a successful Save allows the navigation', async () => {
      activeContext.registerSaveHandler('order', '1', () => of(true));

      const guardPromise = run();
      dialogs.resolveUnsavedChanges('save');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
    });

    it('a failed Save blocks the navigation', async () => {
      activeContext.registerSaveHandler('order', '1', () => of(false));

      const guardPromise = run();
      dialogs.resolveUnsavedChanges('save');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
    });
  });
});
