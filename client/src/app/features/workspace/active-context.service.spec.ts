import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { OrderDto, ShipmentDto } from '../../api/models';
import { CONTEXT_MODE } from './active-context.model';
import { ActiveContextService, STORAGE_KEY } from './active-context.service';

const ORDER: Pick<OrderDto, 'id'> = { id: 5678 };
const FILE: Pick<ShipmentDto, 'id'> = { id: 999 };

function configure(mode: 'single-per-type' | 'multi-tab' = 'single-per-type') {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CONTEXT_MODE, useValue: mode },
    ],
  });
}

describe('ActiveContextService', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  describe('open', () => {
    it('adds a new item and makes it current', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });

      expect(service.items()).toEqual([
        expect.objectContaining({ type: 'order', id: '5678', label: 'הזמנה #5678', dirty: false }),
      ]);
      expect(service.current()?.id).toBe('5678');
      expect(service.currentId()).toBe('order:5678');
    });

    it('exposes hasActive(type) and byType(type) as stable, correct signals', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      const hasOrder = service.hasActive('order');
      const hasFile = service.hasActive('file');
      expect(service.hasActive('order')).toBe(hasOrder); // same Signal instance on re-call

      expect(hasOrder()).toBe(false);
      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      expect(hasOrder()).toBe(true);
      expect(hasFile()).toBe(false);
      expect(service.byType('order')().map((i) => i.id)).toEqual(['5678']);
    });
  });

  describe('dedupe by (type, id)', () => {
    it('re-opening the same (type, id) updates in place instead of duplicating', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      service.markDirty('order', '5678', true);
      const firstCreatedAt = service.current()!.createdAt;

      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678 (עודכן)' });

      expect(service.items().length).toBe(1);
      expect(service.current()).toEqual(
        expect.objectContaining({
          id: '5678',
          label: 'הזמנה #5678 (עודכן)',
          dirty: true, // preserved across the re-open
          createdAt: firstCreatedAt, // preserved, not reset
        }),
      );
    });

    it('does not confuse an order and a file that happen to share a numeric id', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });
      service.open({ type: 'file', id: '1000', label: 'תיק #1000' });

      expect(service.items().length).toBe(2);
      expect(service.hasActive('order')()).toBe(true);
      expect(service.hasActive('file')()).toBe(true);
    });
  });

  describe('close', () => {
    it('removes the item and clears currentId only if it was current', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      service.open({ type: 'file', id: '1000', label: 'תיק #1000' }); // now current

      service.close('order', '5678');

      expect(service.items().map((i) => i.id)).toEqual(['1000']);
      expect(service.currentId()).toBe('file:1000'); // untouched — order wasn't current

      service.close('file', '1000');
      expect(service.items()).toEqual([]);
      expect(service.currentId()).toBeNull();
    });

    it('is a no-op for an id that is not open', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      expect(() => service.close('order', 'does-not-exist')).not.toThrow();
      expect(service.items()).toEqual([]);
    });
  });

  describe('mode behavior', () => {
    it('single-per-type evicts the previous item of the same type', async () => {
      configure('single-per-type');
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });
      service.open({ type: 'order', id: '2000', label: 'הזמנה #2000' });

      expect(service.items().map((i) => i.id)).toEqual(['2000']);
      expect(service.current()?.id).toBe('2000');
    });

    it('single-per-type does not evict a different type', async () => {
      configure('single-per-type');
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });
      service.open({ type: 'file', id: '1', label: 'תיק #1' });

      expect(service.items().map((i) => i.id).sort()).toEqual(['1', '1000']);
    });

    it('multi-tab keeps multiple items of the same type open', async () => {
      configure('multi-tab');
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '1000', label: 'הזמנה #1000' });
      service.open({ type: 'order', id: '2000', label: 'הזמנה #2000' });

      expect(service.items().map((i) => i.id).sort()).toEqual(['1000', '2000']);
      expect(service.current()?.id).toBe('2000');
    });
  });

  describe('persistence', () => {
    it('writes open/markDirty/close to sessionStorage under the versioned key', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      let stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
      expect(stored.version).toBe(1);
      expect(stored.items).toEqual([expect.objectContaining({ id: '5678' })]);
      expect(stored.currentId).toBe('order:5678');

      service.markDirty('order', '5678', true);
      stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
      expect(stored.items[0].dirty).toBe(true);

      service.close('order', '5678');
      stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
      expect(stored.items).toEqual([]);
      expect(stored.currentId).toBeNull();
    });

    it('clear() removes the persisted state entirely', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      service.open({ type: 'order', id: '5678', label: 'הזמנה #5678' });
      expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

      service.clear();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(service.items()).toEqual([]);
    });

    it('ignores malformed sessionStorage content instead of throwing', async () => {
      sessionStorage.setItem(STORAGE_KEY, '{not-json');
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify(); // no requests: nothing to validate
      await service.ready;

      expect(service.items()).toEqual([]);
    });
  });

  describe('rehydration + backend validation', () => {
    it('keeps items the backend confirms still exist', async () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          items: [
            { type: 'order', id: String(ORDER.id), label: 'הזמנה #5678', dirty: false, createdAt: 1 },
          ],
          currentId: `order:${ORDER.id}`,
        }),
      );
      configure();
      const service = TestBed.inject(ActiveContextService);
      const http = TestBed.inject(HttpTestingController);

      http.expectOne(`/api/orders/${ORDER.id}`).flush({ id: ORDER.id } as OrderDto);
      await service.ready;

      expect(service.items().map((i) => i.id)).toEqual([String(ORDER.id)]);
      expect(service.currentId()).toBe(`order:${ORDER.id}`);
      http.verify();
    });

    it('drops items the backend 404s, and clears currentId if it pointed there', async () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          items: [
            { type: 'file', id: String(FILE.id), label: 'תיק #999', dirty: false, createdAt: 1 },
          ],
          currentId: `file:${FILE.id}`,
        }),
      );
      configure();
      const service = TestBed.inject(ActiveContextService);
      const http = TestBed.inject(HttpTestingController);

      http
        .expectOne(`/api/shipments/${FILE.id}`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
      await service.ready;

      expect(service.items()).toEqual([]);
      expect(service.currentId()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull(); // re-persisted, now empty
      http.verify();
    });

    it('drops unsaved drafts (non-numeric id) without calling the backend at all', async () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          items: [{ type: 'order', id: 'draft-1', label: 'הזמנה חדשה', dirty: true, createdAt: 1 }],
          currentId: 'order:draft-1',
        }),
      );
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify(); // no HTTP calls at all for the draft

      await service.ready;

      expect(service.items()).toEqual([]);
      expect(service.currentId()).toBeNull();
    });

    it('validates order and file items independently in the same rehydration pass', async () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          items: [
            { type: 'order', id: String(ORDER.id), label: 'הזמנה #5678', dirty: false, createdAt: 1 },
            { type: 'file', id: String(FILE.id), label: 'תיק #999', dirty: false, createdAt: 2 },
          ],
          currentId: `order:${ORDER.id}`,
        }),
      );
      configure();
      const service = TestBed.inject(ActiveContextService);
      const http = TestBed.inject(HttpTestingController);

      http.expectOne(`/api/orders/${ORDER.id}`).flush({ id: ORDER.id } as OrderDto);
      http
        .expectOne(`/api/shipments/${FILE.id}`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
      await service.ready;

      expect(service.items().map((i) => i.id)).toEqual([String(ORDER.id)]);
      expect(service.currentId()).toBe(`order:${ORDER.id}`);
      http.verify();
    });
  });

  describe('anyDirty / beforeunload', () => {
    it('anyDirty reflects whether any open item is dirty', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;

      expect(service.anyDirty()).toBe(false);
      service.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      expect(service.anyDirty()).toBe(false);
      service.markDirty('order', '1', true);
      expect(service.anyDirty()).toBe(true);
      service.close('order', '1');
      expect(service.anyDirty()).toBe(false);
    });

    it('prevents the tab from closing when something is dirty', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;
      service.open({ type: 'order', id: '1', label: 'הזמנה #1' });
      service.markDirty('order', '1', true);

      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not prevent closing the tab when nothing is dirty', async () => {
      configure();
      const service = TestBed.inject(ActiveContextService);
      TestBed.inject(HttpTestingController).verify();
      await service.ready;
      service.open({ type: 'order', id: '1', label: 'הזמנה #1' });

      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
