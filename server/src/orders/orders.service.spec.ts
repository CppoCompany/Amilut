import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  Destination,
  Incoterm,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from './orders.enums';
import { OrdersService } from './orders.service';

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

const baseRow = {
  id: 1000,
  customer_id: 1,
  customer_name: 'ACME',
  handler_user_id: 7,
  handler_name: 'Dana',
  created_at: new Date('2026-09-01T08:00:00.000Z'),
  updated_at: new Date('2026-09-01T08:00:00.000Z'),
  status: OrderStatus.PREPARING,
  shipment_type: ShipmentType.SEA,
  payment_terms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  factory_ready_date: '2026-09-01',
  factory_pickup_date: null,
  departure_date: null,
  eta_date: null,
  shipping_line: 'ZIM',
  voyage_number: null,
  airline: null,
  flight_number: null,
  is_active: true,
};

const validCreate: CreateOrderDto = {
  customerId: 1,
  status: OrderStatus.PREPARING,
  shipmentType: ShipmentType.SEA,
  paymentTerms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  shippingLine: 'ZIM',
};

describe('OrdersService', () => {
  let service: OrdersService;
  let db: DbMock;

  beforeEach(async () => {
    db = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  describe('create', () => {
    it('writes handler_user_id from the argument, never from the body', async () => {
      db.queryOne
        .mockResolvedValueOnce({ id: 1, isActive: true }) // customer lookup
        .mockResolvedValueOnce({ id: 1000 }) // INSERT ... RETURNING id
        .mockResolvedValueOnce(baseRow); // findById

      const result = await service.create(validCreate, 7);

      const [insertSql, insertParams] = db.queryOne.mock.calls[1] as [
        string,
        unknown[],
      ];
      expect(insertSql).toMatch(/INSERT INTO orders/);
      expect(insertSql).toMatch(/handler_user_id/);
      expect(insertParams).toContain(7);
      // handler is the last column/param
      expect(insertParams[insertParams.length - 1]).toBe(7);
      expect(insertSql).not.toMatch(/\(id,/); // id is never inserted
      expect(result.id).toBe(1000);
      expect(result.handlerUserId).toBe(7);
      expect(result.createdAt).toBe('2026-09-01T08:00:00.000Z');
      expect(result.factoryReadyDate).toBe('2026-09-01');
    });

    it('rejects an incoterm that does not belong to the payment terms', async () => {
      await expect(
        service.create(
          {
            ...validCreate,
            paymentTerms: PaymentTerms.PREPAID,
            incoterm: Incoterm.FOB,
          },
          7,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.queryOne).not.toHaveBeenCalled();
    });

    it('rejects a missing customer with NotFound', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(service.create(validCreate, 7)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an inactive customer with BadRequest', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 1, isActive: false });
      await expect(service.create(validCreate, 7)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('translates a pg foreign-key violation into BadRequest', async () => {
      db.queryOne
        .mockResolvedValueOnce({ id: 1, isActive: true })
        .mockRejectedValueOnce(
          Object.assign(new Error('fk'), { code: '23503' }),
        );
      await expect(service.create(validCreate, 7)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('findById', () => {
    it('throws NotFound when the row is missing', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(service.findById(42)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('filters active rows by default and applies limit/offset', async () => {
      db.query.mockResolvedValueOnce([baseRow]);
      const result = await service.findAll({
        status: OrderStatus.PREPARING,
        limit: 10,
        offset: 20,
      });
      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/o\."isActive"/);
      expect(sql).toMatch(/o\.status = \$1/);
      expect(sql).toMatch(/ORDER BY o\.id DESC/);
      expect(params).toEqual([OrderStatus.PREPARING, 10, 20]);
      expect(result).toHaveLength(1);
      expect(result[0].customerName).toBe('ACME');
    });
  });

  describe('update', () => {
    it('only SETs provided fields and ignores unknown/immutable ones', async () => {
      db.queryOne
        .mockResolvedValueOnce(baseRow) // findById (existing)
        .mockResolvedValueOnce({ id: 1000 }) // UPDATE ... RETURNING id
        .mockResolvedValueOnce({ ...baseRow, airline: 'EL AL' }); // findById

      const patch = {
        airline: 'EL AL',
        id: 5,
        createdAt: '2000-01-01',
        handlerUserId: 99,
        bogus: 'x',
      } as unknown as UpdateOrderDto;

      const result = await service.update(1000, patch);

      const [sql, params] = db.queryOne.mock.calls[1] as [string, unknown[]];
      expect(sql).toBe(
        'UPDATE orders SET airline = $1, updated_at = now() WHERE id = $2 RETURNING id',
      );
      expect(params).toEqual(['EL AL', 1000]);
      expect(result.airline).toBe('EL AL');
    });

    it('re-validates incoterm against the merged payment terms', async () => {
      db.queryOne.mockResolvedValueOnce(baseRow); // existing is PREPAID / CFR
      await expect(
        service.update(1000, { incoterm: Incoterm.EXW }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.queryOne).toHaveBeenCalledTimes(1);
    });

    it('throws NotFound when the order does not exist', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(
        service.update(1, { airline: 'EL AL' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes and throws NotFound when nothing was updated', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
      const [sql, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/"isActive" = false/);
      expect(sql).toMatch(/AND "isActive"/);
      expect(params).toEqual([1]);
    });

    it('resolves when a row was soft-deleted', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 1000 });
      await expect(service.remove(1000)).resolves.toBeUndefined();
    });
  });
});
