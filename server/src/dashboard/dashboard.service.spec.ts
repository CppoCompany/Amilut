import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { CcfStatus } from '../ccf/ccf.enums';
import { ImportDocumentType } from '../import-files/import-files.enums';
import { MblShippingType } from '../mbl/mbl.enums';
import { OrderStatus } from '../orders/orders.enums';
import {
  CASES_IN_RELEASE_SQL,
  CCFS_PENDING_CLASSIFICATION_SQL,
  CCFS_SQL,
  DASHBOARD_ROW_LIMIT,
  DashboardService,
  IMPORT_PROCESSES_SQL,
  MBL_STATUS_IN_RELEASE,
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

const ccfRow = {
  id: 7,
  file_number: 'CCF1007',
  shipment_file_id: 5,
  shipment_file_mbl_number: 'MBL-5',
  customer_names: ['ACME'],
  status: CcfStatus.OPEN,
  line_count: '4',
  classified_line_count: '1',
  created_at: CREATED,
};

const ccfDto = {
  id: 7,
  fileNumber: 'CCF1007',
  shipmentFileId: 5,
  shipmentFileMblNumber: 'MBL-5',
  customerNames: ['ACME'],
  status: CcfStatus.OPEN,
  lineCount: 4,
  classifiedLineCount: 1,
  createdAt: '2026-09-01T08:00:00.000Z',
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

  describe('findCcfsPendingClassification', () => {
    it('keeps CCFs with no invoice lines or an uncoded line, newest first', async () => {
      db.query.mockResolvedValueOnce([ccfRow]);

      const result = await service.findCcfsPendingClassification();

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(CCFS_PENDING_CLASSIFICATION_SQL);
      expect(sql).toMatch(/inv_lines\.line_count = 0/);
      expect(sql).toMatch(
        /inv_lines\.classified_line_count < inv_lines\.line_count/,
      );
      // Only the newest upload per file name counts, like the classification screen.
      expect(sql).toMatch(/DISTINCT ON \(f\.data->>'name'\)/);
      expect(sql).toMatch(/ORDER BY c\.id DESC/);
      expect(params).toEqual([
        ImportDocumentType.SUPPLIER_INVOICE,
        DASHBOARD_ROW_LIMIT,
      ]);
      expect(result).toEqual([ccfDto]);
    });

    it('maps a standalone CCF with no customers', async () => {
      db.query.mockResolvedValueOnce([
        {
          ...ccfRow,
          shipment_file_id: null,
          shipment_file_mbl_number: null,
          customer_names: null,
          line_count: 0,
          classified_line_count: 0,
        },
      ]);

      const [result] = await service.findCcfsPendingClassification();

      expect(result.shipmentFileId).toBeNull();
      expect(result.shipmentFileMblNumber).toBeNull();
      expect(result.customerNames).toEqual([]);
      expect(result.lineCount).toBe(0);
      expect(result.classifiedLineCount).toBe(0);
    });
  });

  describe('findCcfs', () => {
    it('lists every CCF regardless of classification, newest first', async () => {
      db.query.mockResolvedValueOnce([ccfRow]);

      const result = await service.findCcfs();

      const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe(CCFS_SQL);
      expect(sql).not.toMatch(/WHERE inv_lines\./);
      expect(sql).toMatch(/ORDER BY c\.id DESC/);
      expect(params).toEqual([
        ImportDocumentType.SUPPLIER_INVOICE,
        DASHBOARD_ROW_LIMIT,
      ]);
      expect(result).toEqual([ccfDto]);
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
          CCFS_PENDING_CLASSIFICATION_SQL,
          CCFS_SQL,
          IMPORT_PROCESSES_SQL,
        ]),
      );
      expect(result).toEqual({
        myOrders: [],
        casesInRelease: [],
        ccfsPendingClassification: [],
        ccfs: [],
        importProcesses: [],
      });
    });
  });
});
