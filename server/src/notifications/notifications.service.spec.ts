import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from './notifications.service';

// The real DatabaseService pulls in @nestjs/config (ESM-only), which the
// project's jest transform does not handle. The service is fully mocked here,
// so replace the module with a stand-in class that carries the same token.
jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

type DbMock = {
  query: jest.Mock;
  queryOne: jest.Mock;
  transaction: jest.Mock;
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let db: DbMock;

  beforeEach(async () => {
    db = { query: jest.fn(), queryOne: jest.fn(), transaction: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  describe('create', () => {
    it('inserts a notification row standalone (no transaction)', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 1 });

      const result = await service.create({
        recipientUserId: 7,
        message: 'hi',
        relatedCcfId: 3,
        actorUserId: 9,
      });

      const [sql, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO notifications/);
      expect(sql).toMatch(/actor_user_id/);
      expect(params).toEqual([7, 'hi', 3, 9]);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('listForUser', () => {
    it("returns the user's notifications mapped to the DTO shape", async () => {
      db.query.mockResolvedValueOnce([
        {
          id: 1,
          message: 'hi',
          related_ccf_id: 3,
          actor_user_id: 9,
          actor_name: 'Dana',
          is_read: false,
          created_at: new Date('2026-09-01T08:00:00.000Z'),
        },
      ]);

      const result = await service.listForUser(7);

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/LEFT JOIN users u ON u\.id = n\.actor_user_id/);
      expect(sql).toMatch(/WHERE n\.recipient_user_id = \$1/);
      expect(params).toEqual([7]);
      expect(result).toEqual([
        {
          id: 1,
          message: 'hi',
          relatedCcfId: 3,
          actorUserId: 9,
          actorName: 'Dana',
          isRead: false,
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });
  });

  describe('unreadCount', () => {
    it('returns the count as a number', async () => {
      db.queryOne.mockResolvedValueOnce({ count: '4' });
      expect(await service.unreadCount(7)).toBe(4);
    });

    it('returns 0 when no row comes back', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      expect(await service.unreadCount(7)).toBe(0);
    });
  });

  describe('markRead', () => {
    it('updates the row when it belongs to the user', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 1 });
      await service.markRead(1, 7);

      const [sql, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/UPDATE notifications SET is_read = true/);
      expect(params).toEqual([1, 7]);
    });

    it('throws NotFoundException when the notification does not belong to the user (or does not exist)', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(service.markRead(1, 7)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it("marks only the user's notifications up to the given id and returns what is still unread", async () => {
      db.query.mockResolvedValueOnce([]);
      db.queryOne.mockResolvedValueOnce({ count: '1' });

      expect(await service.markAllRead(7, 42)).toBe(1);

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/UPDATE notifications SET is_read = true/);
      expect(sql).toMatch(/recipient_user_id = \$1 AND id <= \$2/);
      expect(params).toEqual([7, 42]);
    });
  });
});
