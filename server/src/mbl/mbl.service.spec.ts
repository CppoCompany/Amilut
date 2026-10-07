import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { PaymentTerms } from '../orders/orders.enums';
import { MblShippingType, MblStatus, SeaMethod } from './mbl.enums';
import { MblService } from './mbl.service';

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

const mblRow = {
  id: 5,
  shipping_type: MblShippingType.SEA,
  sea_method: SeaMethod.FCL_FCL,
  customer_id: null,
  customer_name: null,
  mbl_number: 'MBL-1',
  booking_number: null,
  vessel_name: null,
  voyage_number: null,
  port_of_loading: null,
  port_of_discharge: null,
  final_destination: null,
  shipper_name: null,
  shipper_address: null,
  consignee_name: null,
  consignee_address: null,
  notify_party_name: null,
  notify_party_address: null,
  container_number: null,
  container_seal_number: null,
  cargo_description: null,
  gross_weight_kg: null,
  volume_cbm: null,
  freight_terms: PaymentTerms.PREPAID,
  receipt_delivery_type: null,
  place_of_issue: null,
  date_of_issue: null,
  carrier_name: 'MAERSK',
  status: MblStatus.OPEN,
  handler_user_id: 7,
  handler_name: 'Dana',
  created_at: new Date('2026-09-01T08:00:00.000Z'),
  updated_at: new Date('2026-09-01T08:00:00.000Z'),
};

const summaryRow = {
  id: 5,
  shipping_type: MblShippingType.SEA,
  sea_method: SeaMethod.FCL_FCL,
  status: MblStatus.IN_RELEASE,
  mbl_number: 'MBL-1',
  carrier_name: 'MAERSK',
  handler_user_id: 7,
  handler_name: 'Dana',
  hbl_count: '2',
  order_count: '3',
  order_ids: [1000, 1001, 1002],
  customer_names: ['ACME'],
  created_at: new Date('2026-09-01T08:00:00.000Z'),
};

describe('MblService', () => {
  let service: MblService;
  let db: DbMock;

  beforeEach(async () => {
    db = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [MblService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = moduleRef.get(MblService);
  });

  describe('create', () => {
    it('stamps handler_user_id from the argument and writes the requested status', async () => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 5 }] }),
      };
      db.transaction.mockImplementation(
        (fn: (c: typeof client) => Promise<number>) => fn(client),
      );
      db.queryOne.mockResolvedValueOnce(mblRow); // findById

      const result = await service.create(
        {
          shippingType: MblShippingType.SEA,
          seaMethod: SeaMethod.FCL_FCL,
          mblNumber: 'MBL-1',
          status: MblStatus.IN_RELEASE,
        },
        7,
      );

      const [insertSql, insertParams] = client.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(insertSql).toMatch(/INSERT INTO mbl/);
      expect(insertSql).toMatch(
        /\(shipping_type, handler_user_id, sea_method, mbl_number, status\)/,
      );
      expect(insertParams).toEqual([
        MblShippingType.SEA,
        7,
        SeaMethod.FCL_FCL,
        'MBL-1',
        MblStatus.IN_RELEASE,
      ]);
      expect(result.id).toBe(5);
      expect(result.status).toBe(MblStatus.OPEN);
      expect(result.handlerUserId).toBe(7);
      expect(result.handlerName).toBe('Dana');
    });

    it('leaves status to the database default when not provided', async () => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 5 }] }),
      };
      db.transaction.mockImplementation(
        (fn: (c: typeof client) => Promise<number>) => fn(client),
      );
      db.queryOne.mockResolvedValueOnce(mblRow);

      await service.create({ shippingType: MblShippingType.AIR }, 7);

      const [insertSql, insertParams] = client.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(insertSql).toMatch(/\(shipping_type, handler_user_id\)/);
      expect(insertSql).not.toMatch(/status/);
      expect(insertParams).toEqual([MblShippingType.AIR, 7]);
    });
  });

  describe('findAllPaged', () => {
    it('applies mine/status/customer/search/date filters, a whitelisted sort, and returns the window total', async () => {
      db.query.mockResolvedValueOnce([{ ...summaryRow, total: '9' }]);

      const result = await service.findAllPaged(
        {
          mine: true,
          status: MblStatus.IN_RELEASE,
          customerId: 3,
          q: 'maersk',
          from: '2026-01-01',
          to: '2026-12-31',
          sort: 'mblNumber',
          dir: 'asc',
          page: 2,
          pageSize: 5,
        },
        7,
      );

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/count\(\*\) OVER\(\) AS total/);
      expect(sql).toMatch(/m\.handler_user_id = \$1/);
      expect(sql).toMatch(/m\.status = \$2/);
      expect(sql).toMatch(
        /\(m\.customer_id = \$3 OR EXISTS \(SELECT 1 FROM hbl h2 WHERE h2\.mbl_id = m\.id AND h2\.customer_id = \$3\)\)/,
      );
      expect(sql).toMatch(
        /m\.id::text ILIKE \$4 OR m\.mbl_number ILIKE \$4 OR m\.carrier_name ILIKE \$4/,
      );
      expect(sql).toMatch(/hc\.name ILIKE \$4/);
      expect(sql).toMatch(/m\.created_at::date >= \$5::date/);
      expect(sql).toMatch(/m\.created_at::date <= \$6::date/);
      expect(sql).toMatch(
        /GROUP BY m\.id, m\.shipping_type, m\.sea_method, m\.status/,
      );
      expect(sql).toMatch(/ORDER BY m\.mbl_number ASC NULLS LAST, m\.id DESC/);
      expect(sql).toMatch(/LIMIT \$7 OFFSET \$8/);
      expect(params).toEqual([
        7,
        MblStatus.IN_RELEASE,
        3,
        '%maersk%',
        '2026-01-01',
        '2026-12-31',
        5,
        5,
      ]);
      expect(result.total).toBe(9);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      expect(result.items).toEqual([
        {
          id: 5,
          shippingType: MblShippingType.SEA,
          seaMethod: SeaMethod.FCL_FCL,
          status: MblStatus.IN_RELEASE,
          mblNumber: 'MBL-1',
          carrierName: 'MAERSK',
          handlerUserId: 7,
          handlerName: 'Dana',
          hblCount: 2,
          orderCount: 3,
          orderIds: [1000, 1001, 1002],
          customerNames: ['ACME'],
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });

    it('is unscoped by default: no handler/status predicate, newest first, page 1 of 25', async () => {
      db.query.mockResolvedValueOnce([]);

      const result = await service.findAllPaged({}, 7);

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      // No top-level WHERE at all (the only WHERE left is array_agg's FILTER clause).
      expect(sql).not.toMatch(/WHERE m\./);
      expect(sql).not.toMatch(/handler_user_id = \$/);
      expect(sql).not.toMatch(/m\.status = \$/);
      expect(sql).toMatch(/ORDER BY m\.created_at DESC NULLS LAST, m\.id DESC/);
      expect(params).toEqual([25, 0]);
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
    });

    it('never interpolates a sort key outside the whitelist', async () => {
      db.query.mockResolvedValueOnce([]);

      await service.findAllPaged(
        { sort: 'm.id; DROP TABLE mbl' } as unknown as Parameters<
          MblService['findAllPaged']
        >[0],
        7,
      );

      const [sql] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toMatch(/DROP TABLE/);
      expect(sql).toMatch(/ORDER BY m\.created_at DESC NULLS LAST/);
    });
  });
});
