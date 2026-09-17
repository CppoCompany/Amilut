import { NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';

// The real DatabaseService pulls in @nestjs/config (ESM-only), which ts-jest
// does not transform. CustomersService only needs the class as a DI token, so
// stub the module and hand the service a hand-rolled mock.
jest.mock('../database/database.service', () => ({
  DatabaseService: class {},
}));

import {
  CustomerRow,
  CustomersService,
  escapeLikePattern,
} from './customers.service';
import { CustomerDto } from './dto/customer.dto';

describe('CustomersService', () => {
  let service: CustomersService;
  let db: { query: jest.Mock; queryOne: jest.Mock };

  const row: CustomerRow = {
    id: 7,
    name: 'Acme Imports',
    address: null,
    phone: '+972-3-1234567',
    email: 'office@acme.co.il',
    isActive: true,
  };

  beforeEach(() => {
    db = { query: jest.fn(), queryOne: jest.fn() };
    service = new CustomersService(db as unknown as DatabaseService);
  });

  describe('escapeLikePattern', () => {
    it('escapes %, _ and backslash', () => {
      expect(escapeLikePattern('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    });
  });

  describe('search', () => {
    it('builds an escaped ILIKE pattern, passes the limit and maps rows', async () => {
      db.query.mockResolvedValue([row]);

      const result = await service.search('  ac_me% ', 5);

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/"isActive"\s+AND\s+name ILIKE \$1/);
      expect(sql).toMatch(/ORDER BY name/);
      expect(sql).toMatch(/LIMIT \$2/);
      expect(params).toEqual(['%ac\\_me\\%%', 5]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(CustomerDto);
      expect(result[0]).toEqual({
        id: 7,
        name: 'Acme Imports',
        address: null,
        phone: '+972-3-1234567',
        email: 'office@acme.co.il',
        isActive: true,
      });
    });

    it('returns an empty array when nothing matches', async () => {
      db.query.mockResolvedValue([]);
      await expect(service.search('zzz', 20)).resolves.toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the mapped row', async () => {
      db.queryOne.mockResolvedValue(row);
      const result = await service.findById(7);
      const [, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([7]);
      expect(result).toMatchObject({ id: 7, name: 'Acme Imports' });
    });

    it('throws NotFoundException when the row is null', async () => {
      db.queryOne.mockResolvedValue(null);
      await expect(service.findById(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('inserts with nulls for missing optionals and returns the mapped row', async () => {
      db.queryOne.mockResolvedValue({
        ...row,
        id: 42,
        phone: null,
        email: null,
      });

      const result = await service.create({ name: 'Acme Imports' });

      const [sql, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO customers/);
      expect(sql).toMatch(/RETURNING/);
      expect(params).toEqual(['Acme Imports', null, null, null]);
      expect(result).toBeInstanceOf(CustomerDto);
      expect(result).toEqual({
        id: 42,
        name: 'Acme Imports',
        address: null,
        phone: null,
        email: null,
        isActive: true,
      });
    });
  });

  describe('update', () => {
    it('sets only the provided fields', async () => {
      db.queryOne.mockResolvedValue({ ...row, isActive: false });

      await service.update(7, { isActive: false, phone: null });

      const [sql, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/SET phone = \$1, "isActive" = \$2/);
      expect(sql).toMatch(/WHERE id = \$3/);
      expect(params).toEqual([null, false, 7]);
    });

    it('falls back to a lookup when no fields are provided', async () => {
      db.queryOne.mockResolvedValue(row);
      await service.update(7, {});
      const [sql] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/^SELECT/);
    });

    it('throws NotFoundException when no row is updated', async () => {
      db.queryOne.mockResolvedValue(null);
      await expect(
        service.update(999, { name: 'Nobody' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
