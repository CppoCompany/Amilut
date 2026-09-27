import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ActiveContextService } from '../../features/workspace/active-context.service';
import { ContextDialogService } from '../../features/workspace/context-dialog.service';
import { createNewGuard } from './create-new.guard';

describe('createNewGuard', () => {
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

  function run(type: 'order' | 'file', draft = { id: 'draft', label: 'הזמנה חדשה' }) {
    return runInInjectionContext(injector, () => createNewGuard(type, draft));
  }

  describe('no active item path', () => {
    it('opens the draft directly and allows, with no dialog', async () => {
      const allowed = await run('order');

      expect(allowed).toBe(true);
      expect(activeContext.items()).toEqual([
        expect.objectContaining({ type: 'order', id: 'draft', label: 'הזמנה חדשה' }),
      ]);
      expect(dialogs.pendingCreateNew()).toBeNull();
    });
  });

  describe('an active item of that type exists — all three dialog outcomes', () => {
    beforeEach(() => {
      activeContext.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
    });

    it('Cancel blocks navigation and leaves the existing item untouched', async () => {
      const guardPromise = run('order');

      const pending = dialogs.pendingCreateNew();
      expect(pending?.type).toBe('order');
      expect(pending?.existing.id).toBe('5678');

      dialogs.resolveCreateNew('cancel');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.items()).toEqual([expect.objectContaining({ id: '5678' })]);
    });

    it('"Continue with existing" focuses it and blocks the create action', async () => {
      activeContext.setCurrent('order', '5678');
      const guardPromise = run('order');
      dialogs.resolveCreateNew('continueExisting');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.currentId()).toBe('order:5678');
      expect(activeContext.items().map((i) => i.id)).toEqual(['5678']); // no draft opened
    });

    it('"Create new" on a clean existing item allows and evicts it (single-per-type)', async () => {
      const guardPromise = run('order');
      dialogs.resolveCreateNew('createNew');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
      expect(activeContext.items().map((i) => i.id)).toEqual(['draft']);
    });

    it('"Create new" on a dirty existing item runs the unsaved-changes flow first — Discard', async () => {
      activeContext.markDirty('order', '5678', true);
      const guardPromise = run('order');
      dialogs.resolveCreateNew('createNew');

      // the create-new dialog resolves, then the unsaved-changes one opens
      await Promise.resolve();
      expect(dialogs.pendingUnsavedChanges()?.id).toBe('5678');
      dialogs.resolveUnsavedChanges('discard');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
      expect(activeContext.items().map((i) => i.id)).toEqual(['draft']);
    });

    it('"Create new" on a dirty existing item — unsaved-changes Cancel blocks everything', async () => {
      activeContext.markDirty('order', '5678', true);
      const guardPromise = run('order');
      dialogs.resolveCreateNew('createNew');
      await Promise.resolve();
      dialogs.resolveUnsavedChanges('cancel');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.items().map((i) => i.id)).toEqual(['5678']); // still open, no draft
    });

    it('"Create new" on a dirty existing item — Save succeeds then opens the draft', async () => {
      activeContext.markDirty('order', '5678', true);
      activeContext.registerSaveHandler('order', '5678', () => of(true));

      const guardPromise = run('order');
      dialogs.resolveCreateNew('createNew');
      await Promise.resolve();
      dialogs.resolveUnsavedChanges('save');
      const allowed = await guardPromise;

      expect(allowed).toBe(true);
      expect(activeContext.items().map((i) => i.id)).toEqual(['draft']);
    });

    it('"Create new" on a dirty existing item — a failed Save blocks the create', async () => {
      activeContext.markDirty('order', '5678', true);
      activeContext.registerSaveHandler('order', '5678', () => of(false));

      const guardPromise = run('order');
      dialogs.resolveCreateNew('createNew');
      await Promise.resolve();
      dialogs.resolveUnsavedChanges('save');
      const allowed = await guardPromise;

      expect(allowed).toBe(false);
      expect(activeContext.items().map((i) => i.id)).toEqual(['5678']);
    });
  });

  it('an existing File does not block creating a new Order', async () => {
    activeContext.open({ type: 'file', id: '1', label: 'תיק #1' });

    const allowed = await run('order');

    expect(allowed).toBe(true);
    expect(activeContext.items().map((i) => i.id).sort()).toEqual(['1', 'draft']);
    expect(dialogs.pendingCreateNew()).toBeNull();
  });
});
