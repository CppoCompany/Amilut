import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { CcfStatus } from './ccf.enums';
import { CcfService } from './ccf.service';

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

const ccfRow = {
  id: 100,
  file_number: 'CCF1000',
  shipment_file_id: null,
  shipment_file_mbl_number: null,
  status: CcfStatus.OPEN,
  created_by: 7,
  created_by_name: 'Dana',
  created_at: new Date('2026-09-01T08:00:00.000Z'),
  updated_at: new Date('2026-09-01T08:00:00.000Z'),
};

describe('CcfService', () => {
  let service: CcfService;
  let db: DbMock;

  beforeEach(async () => {
    db = { query: jest.fn(), queryOne: jest.fn(), transaction: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [CcfService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = moduleRef.get(CcfService);
  });

  describe('create', () => {
    it('creates a standalone CCF (no shipmentFileId) and notifies the creator', async () => {
      const client = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // CCF insert
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }), // notification insert
      };
      db.transaction.mockImplementation(
        (fn: (c: typeof client) => Promise<number>) => fn(client),
      );
      db.queryOne.mockResolvedValueOnce(ccfRow); // findById after create

      const result = await service.create({}, 7);

      const [insertSql, insertParams] = client.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(insertSql).toMatch(/INSERT INTO customs_clearance_files/);
      expect(insertParams).toEqual([null, CcfStatus.OPEN, 7]);

      const [notifSql, notifParams] = client.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      expect(notifSql).toMatch(/INSERT INTO notifications/);
      expect(notifParams).toEqual([7, 'נפתח תיק סליקת מכס עצמאי חדש', 100]);

      expect(result.id).toBe(100);
      expect(result.fileNumber).toBe('CCF1000');
    });

    it('creates a linked CCF and notifies the shipment file handler, not the creator', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 42, handler_user_id: 9 }); // mbl lookup
      const client = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 101 }] })
          .mockResolvedValueOnce({ rows: [{ id: 2 }] }),
      };
      db.transaction.mockImplementation(
        (fn: (c: typeof client) => Promise<number>) => fn(client),
      );
      db.queryOne.mockResolvedValueOnce({
        ...ccfRow,
        id: 101,
        shipment_file_id: 42,
      }); // findById

      await service.create({ shipmentFileId: 42 }, 7);

      const [insertSql, insertParams] = client.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(insertSql).toMatch(/INSERT INTO customs_clearance_files/);
      expect(insertParams).toEqual([42, CcfStatus.OPEN, 7]);

      const [, notifParams] = client.query.mock.calls[1] as [string, unknown[]];
      expect(notifParams[0]).toBe(9); // the MBL's handler, not the creator (7)
    });

    it('falls back to notifying the creator when the linked shipment file has no handler on record', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 42, handler_user_id: null });
      const client = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 102 }] })
          .mockResolvedValueOnce({ rows: [{ id: 3 }] }),
      };
      db.transaction.mockImplementation(
        (fn: (c: typeof client) => Promise<number>) => fn(client),
      );
      db.queryOne.mockResolvedValueOnce({
        ...ccfRow,
        id: 102,
        shipment_file_id: 42,
      });

      await service.create({ shipmentFileId: 42 }, 7);

      const [, notifParams] = client.query.mock.calls[1] as [string, unknown[]];
      expect(notifParams[0]).toBe(7);
    });

    it('throws NotFoundException for a nonexistent shipment file, without starting a transaction', async () => {
      db.queryOne.mockResolvedValueOnce(null);

      await expect(service.create({ shipmentFileId: 999 }, 7)).rejects.toThrow(
        NotFoundException,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('translates a unique-violation on shipment_file_id into a clear duplicate-link error', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 42, handler_user_id: 9 });
      const client = {
        query: jest.fn().mockRejectedValueOnce({
          code: '23505',
          constraint: 'customs_clearance_files_shipment_file_id_key',
        }),
      };
      db.transaction.mockImplementation(
        (fn: (c: typeof client) => Promise<number>) => fn(client),
      );

      await expect(service.create({ shipmentFileId: 42 }, 7)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('peekNextFileNumber', () => {
    it('returns last_value + 1 once the sequence has been used', async () => {
      db.queryOne.mockResolvedValueOnce({ next_value: '1005' });

      const result = await service.peekNextFileNumber();

      const [sql] = db.queryOne.mock.calls[0] as [string];
      expect(sql).toMatch(/FROM customs_clearance_files_file_number_seq/);
      expect(sql).not.toMatch(/nextval/);
      expect(result).toEqual({ fileNumber: 'CCF1005' });
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when no row matches', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('lists with no filters, defaulting the limit to 200', async () => {
      db.query.mockResolvedValueOnce([ccfRow]);

      const result = await service.findAll({});

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toMatch(/WHERE/);
      expect(sql).toMatch(/ORDER BY c\.id DESC LIMIT \$1/);
      expect(params).toEqual([200]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(100);
    });

    it('filters by status and shipmentFileId, and respects a custom limit', async () => {
      db.query.mockResolvedValueOnce([]);

      await service.findAll({
        status: CcfStatus.OPEN,
        shipmentFileId: 42,
        limit: 10,
      });

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(
        /WHERE c\.status = \$1 AND c\.shipment_file_id = \$2/,
      );
      expect(params).toEqual([CcfStatus.OPEN, 42, 10]);
    });
  });
});
