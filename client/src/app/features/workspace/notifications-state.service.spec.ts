import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NOTIFICATIONS_POLL_MS, NotificationsStateService } from './notifications-state.service';

const UNREAD_URL = '/api/notifications/unread-count';

describe('NotificationsStateService', () => {
  let state: NotificationsStateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    state = TestBed.inject(NotificationsStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  /** A DestroyRef the test can fire by hand. */
  function manualDestroyRef(): { ref: DestroyRef; destroy: () => void } {
    const callbacks: (() => void)[] = [];
    const ref = { onDestroy: (cb: () => void) => (callbacks.push(cb), () => undefined), destroyed: false };
    return { ref: ref as unknown as DestroyRef, destroy: () => callbacks.forEach((cb) => cb()) };
  }

  it('fetches the count right away, then every poll interval until destroyed', () => {
    vi.useFakeTimers();
    const { ref, destroy } = manualDestroyRef();

    state.startPolling(ref);
    httpMock.expectOne(UNREAD_URL).flush({ count: 2 });
    expect(state.unreadCount()).toBe(2);

    vi.advanceTimersByTime(NOTIFICATIONS_POLL_MS);
    httpMock.expectOne(UNREAD_URL).flush({ count: 5 });
    expect(state.unreadCount()).toBe(5);

    destroy();
    vi.advanceTimersByTime(NOTIFICATIONS_POLL_MS);
    httpMock.expectNone(UNREAD_URL);
  });

  it('keeps the last known count when a check fails', () => {
    state.unreadCount.set(4);
    state.refresh();
    httpMock.expectOne(UNREAD_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(state.unreadCount()).toBe(4);
  });

  it('markAllRead sends upToId and takes the server\'s remaining count', () => {
    state.unreadCount.set(3);
    state.markAllRead(12).subscribe();

    const req = httpMock.expectOne('/api/notifications/read-all');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ upToId: 12 });
    req.flush({ count: 1 });
    expect(state.unreadCount()).toBe(1);
  });

  it('markedOneRead never goes below zero', () => {
    state.unreadCount.set(1);
    state.markedOneRead();
    state.markedOneRead();
    expect(state.unreadCount()).toBe(0);
  });
});
