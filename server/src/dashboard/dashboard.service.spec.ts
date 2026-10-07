import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { MblShippingType } from '../mbl/mbl.enums';
import { OrderStatus } from '../orders/orders.enums';
import {
  CASES_IN_RELEASE_SQL,
  DASHBOARD_ROW_LIMIT,
  DashboardService,
  IMPORT_PROCESSES_SQL,
  MBL_STATUS_IN_RELEASE,
  MY_CASES_SQL,
  MY_CLASSIFICATIONS_SQL,
  MY_ORDERS_SQL,
} from './dashboard.service';

// The real DatabaseService pulls in @nestjs/config (ESM-only), which the
// project's jest transform does not handle. The service is fully mocked here,
// so replace the module with a stand-in class that carries the same token.
jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

type DbMock = { query: jest.Mock };

const CREATED = new Date('2026-09-01T08:00:00.000Z');

const mblRow = {
  id: 5,
  mbl_number: 'MBL-5',
  shipping_type: MblShippingType.SEA,
  carrier_name: 'MAERSK',
  status: 'open',
  hbl_count: '2',
  customer_names: ['ACME'],
  created_at: CREATED,
};

describe('DashboardService', () => {
  let service: DashboardService;
  let db: DbMock;

  beforeEach(async () => {
    db = { query: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [DashboardService, { provide: DatabaseService, useValue: db }],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  describe('findMyOrders', () => {
    it('scopes to the handler user id, keeps only active orders and maps rows', async () => {
      db.query.mockResolvedValueOnce([
        {
          id: 1000,
          customer_name: 'ACME',
          handler_name: 'Dana',
          status: OrderStatus.PREPARING,
          created_at: CREATED,
        },
      ]);

      const result = await service.findMyOrders(7);

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(MY_ORDERS_SQL);
      expect(sql).toMatch(/o\.handler_user_id = \$1/);
      expect(sql).toMatch(/o\."isActive"/);
      expect(sql).toMatch(/ORDER BY o\.id DESC/);
      expect(params).toEqual([7, DASHBOARD_ROW_LIMIT]);
      expect(result).toEqual([
        {
          id: 1000,
          customerName: 'ACME',
          handlerName: 'Dana',
          status: OrderStatus.PREPARING,
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });
  });

  describe('findCasesInRelease', () => {
    it('filters MBLs by status = in_release and defaults customer names to []', async () => {
      db.query.mockResolvedValueOnce([
        { ...mblRow, status: 'in_release', customer_names: null },
      ]);

      const result = await service.findCasesInRelease();

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(CASES_IN_RELEASE_SQL);
      expect(sql).toMatch(/WHERE m\.status = \$1/);
      expect(sql).toMatch(/ORDER BY m\.id DESC/);
      expect(params).toEqual([MBL_STATUS_IN_RELEASE, DASHBOARD_ROW_LIMIT]);
      expect(result).toEqual([
        {
          id: 5,
          mblNumber: 'MBL-5',
          customerNames: [],
          carrierName: 'MAERSK',
          status: 'in_release',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });
  });

  describe('findMyClassifications', () => {
    it('reads classified line items out of the JSONB and normalises missing text to ""', async () => {
      db.query.mockResolvedValueOnce([
        {
          file_id: 42,
          mbl_id: 1000,
          line_index: '2',
          item: null,
          description: 'Light Fixtures',
          classification_code: '9405.10.00',
          country_name: 'סין',
          created_at: '2026-09-01T08:00:00.000Z',
        },
      ]);

      const result = await service.findMyClassifications();

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(MY_CLASSIFICATIONS_SQL);
      expect(sql).toMatch(/jsonb_array_elements/);
      expect(sql).toMatch(/li\.item \? 'classification'/);
      expect(params).toEqual([DASHBOARD_ROW_LIMIT]);
      expect(result).toEqual([
        {
          fileId: 42,
          mblId: 1000,
          lineIndex: 2,
          item: '',
          description: 'Light Fixtures',
          classificationCode: '9405.10.00',
          countryName: 'סין',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });
  });

  describe('findMyCases', () => {
    it('scopes MBLs to the handler user id, newest first', async () => {
      db.query.mockResolvedValueOnce([mblRow]);

      const result = await service.findMyCases(7);

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(MY_CASES_SQL);
      expect(sql).toMatch(/WHERE m\.handler_user_id = \$1/);
      expect(sql).toMatch(/ORDER BY m\.id DESC/);
      expect(params).toEqual([7, DASHBOARD_ROW_LIMIT]);
      expect(result).toEqual([
        {
          id: 5,
          mblNumber: 'MBL-5',
          shippingType: MblShippingType.SEA,
          customerNames: ['ACME'],
          carrierName: 'MAERSK',
          status: 'open',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });
  });

  describe('findImportProcesses', () => {
    it('lists every MBL case unscoped, newest first, with its HBL count', async () => {
      db.query.mockResolvedValueOnce([mblRow]);

      const result = await service.findImportProcesses();

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(IMPORT_PROCESSES_SQL);
      // No row filter — only the aggregate's `FILTER (WHERE ...)` may appear.
      expect(sql).not.toMatch(/WHERE m\./);
      expect(sql).toMatch(/ORDER BY m\.id DESC/);
      expect(params).toEqual([DASHBOARD_ROW_LIMIT]);
      expect(result).toEqual([
        {
          id: 5,
          mblNumber: 'MBL-5',
          shippingType: MblShippingType.SEA,
          customerNames: ['ACME'],
          carrierName: 'MAERSK',
          hblCount: 2,
          status: 'open',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ]);
    });
  });

  describe('getDashboard', () => {
    it('runs all five queries and assembles the response', async () => {
      db.query.mockResolvedValue([]);

      const result = await service.getDashboard(7);

      expect(db.query).toHaveBeenCalledTimes(5);
      const sqls = db.query.mock.calls.map((call) => (call as [string])[0]);
      expect(sqls).toEqual(
        expect.arrayContaining([
          MY_ORDERS_SQL,
          CASES_IN_RELEASE_SQL,
          MY_CLASSIFICATIONS_SQL,
          MY_CASES_SQL,
          IMPORT_PROCESSES_SQL,
        ]),
      );
      expect(result).toEqual({
        myOrders: [],
        casesInRelease: [],
        myClassifications: [],
        myCases: [],
        importProcesses: [],
      });
    });
  });
});
