import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AirMethod, ArrivalState } from '../air/air.enums';
import {
  ShipmentStatus,
  StatusTrack,
} from '../status-tracks/status-tracks.enums';
import { StatusTracksService } from '../status-tracks/status-tracks.service';
import {
  assertDirectHasCustomer,
  assertFieldsMatchMode,
  statusFromLegs,
  syncShipmentStatusFromLegs,
} from './air-master';
import { HawbService } from './hawb.service';
import {
  arrivalStateOf,
  assertAirMasterAcceptsHouse,
  HblService,
  MasterRow,
} from './hbl.service';
import { MblShippingType } from './mbl.enums';

jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

/** A PoolClient stand-in answering each query from a list of handlers. */
function fakeClient(
  answer: (sql: string, params: unknown[]) => unknown[] | undefined,
): PoolClient & { query: jest.Mock } {
  const query = jest.fn((sql: string, params: unknown[] = []) =>
    Promise.resolve({ rows: answer(sql, params) ?? [] }),
  );
  return { query } as unknown as PoolClient & { query: jest.Mock };
}

const master = (overrides: Partial<MasterRow> = {}): MasterRow => ({
  id: 9,
  shipping_type: MblShippingType.AIR,
  sea_method: null,
  air_method: AirMethod.CONSOLIDATION,
  customer_id: null,
  mbl_number: '125-12345675',
  ...overrides,
});

describe('statusFromLegs', () => {
  it('departed once the first leg has an ATD, arrived once the last leg has an ATA', () => {
    expect(statusFromLegs([])).toBeNull();
    expect(statusFromLegs([{ atd: null, ata: null }])).toBeNull();
    expect(
      statusFromLegs([
        { atd: new Date(), ata: new Date() },
        { atd: null, ata: null },
      ]),
    ).toBe(ShipmentStatus.DEPARTED);
    expect(
      statusFromLegs([
        { atd: new Date(), ata: null },
        { atd: null, ata: new Date() },
      ]),
    ).toBe(ShipmentStatus.ARRIVED);
  });
});

describe('syncShipmentStatusFromLegs', () => {
  const tracks = () =>
    ({
      changeAutomaticallyIn: jest.fn().mockResolvedValue(undefined),
      lastManualValueIn: jest.fn().mockResolvedValue(null),
    }) as unknown as StatusTracksService & {
      changeAutomaticallyIn: jest.Mock;
      lastManualValueIn: jest.Mock;
    };

  it('moves a lower status forward to what the legs prove', async () => {
    const t = tracks();
    const client = fakeClient((sql) =>
      sql.includes('mbl_flight_leg')
        ? [{ atd: new Date(), ata: null }]
        : [
            {
              shipment_status: ShipmentStatus.BOOKING_CONFIRMED,
              shipment_status_source: 'manual',
            },
          ],
    );
    await syncShipmentStatusFromLegs(client, t, 9, 1);
    expect(t.changeAutomaticallyIn).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        track: StatusTrack.SHIPMENT,
        to: ShipmentStatus.DEPARTED,
      }),
    );
  });

  it('never lowers a status a user set by hand', async () => {
    const t = tracks();
    const client = fakeClient((sql) =>
      sql.includes('mbl_flight_leg')
        ? [{ atd: new Date(), ata: null }]
        : [
            {
              shipment_status: ShipmentStatus.IN_TRANSIT,
              shipment_status_source: 'manual',
            },
          ],
    );
    await syncShipmentStatusFromLegs(client, t, 9, 1);
    expect(t.changeAutomaticallyIn).not.toHaveBeenCalled();
  });

  it('steps an automatic "arrived" back when the final ATA is removed', async () => {
    const t = tracks();
    const client = fakeClient((sql) =>
      sql.includes('mbl_flight_leg')
        ? [{ atd: new Date(), ata: null }]
        : [
            {
              shipment_status: ShipmentStatus.ARRIVED,
              shipment_status_source: 'auto',
            },
          ],
    );
    await syncShipmentStatusFromLegs(client, t, 9, 1);
    expect(t.changeAutomaticallyIn).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ to: ShipmentStatus.DEPARTED, markAs: 'auto' }),
    );
  });

  it('restores the last manual value when the legs no longer prove anything', async () => {
    const t = tracks();
    t.lastManualValueIn.mockResolvedValue(ShipmentStatus.BOOKING_CONFIRMED);
    const client = fakeClient((sql) =>
      sql.includes('mbl_flight_leg')
        ? [{ atd: null, ata: null }]
        : [
            {
              shipment_status: ShipmentStatus.DEPARTED,
              shipment_status_source: 'auto',
            },
          ],
    );
    await syncShipmentStatusFromLegs(client, t, 9, 1);
    expect(t.changeAutomaticallyIn).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        to: ShipmentStatus.BOOKING_CONFIRMED,
        markAs: 'manual',
      }),
    );
  });
});

describe('mode guards', () => {
  it('rejects sea-document fields on a MAWB and air fields on a sea MBL', () => {
    expect(() =>
      assertFieldsMatchMode(MblShippingType.AIR, { vesselName: 'EVER' }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertFieldsMatchMode(MblShippingType.SEA, { flightLegs: [] }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertFieldsMatchMode(MblShippingType.SEA, { vesselName: 'EVER' }),
    ).not.toThrow();
  });

  it('requires a customer on a Direct MAWB only', () => {
    expect(() => assertDirectHasCustomer(AirMethod.DIRECT, null)).toThrow(
      BadRequestException,
    );
    expect(() => assertDirectHasCustomer(AirMethod.DIRECT, 3)).not.toThrow();
    expect(() =>
      assertDirectHasCustomer(AirMethod.CONSOLIDATION, null),
    ).not.toThrow();
  });
});

describe('assertAirMasterAcceptsHouse', () => {
  const noOthers = jest.fn().mockResolvedValue([]);
  const hasOther = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

  it('accepts any number of houses under a consolidation', async () => {
    await expect(
      assertAirMasterAcceptsHouse(hasOther, master(), null),
    ).resolves.toBeUndefined();
  });

  it('refuses houses under Direct and a second house under Back-to-back', async () => {
    await expect(
      assertAirMasterAcceptsHouse(
        noOthers,
        master({ air_method: AirMethod.DIRECT }),
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      assertAirMasterAcceptsHouse(
        hasOther,
        master({ air_method: AirMethod.BACK_TO_BACK }),
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      assertAirMasterAcceptsHouse(
        noOthers,
        master({ air_method: AirMethod.BACK_TO_BACK }),
        null,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses a sea master', async () => {
    await expect(
      assertAirMasterAcceptsHouse(
        noOthers,
        master({ shipping_type: MblShippingType.SEA }),
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('arrivalStateOf', () => {
  it('derives the state from expected vs received pieces', () => {
    expect(arrivalStateOf(MblShippingType.SEA, null, 0)).toBeNull();
    expect(arrivalStateOf(MblShippingType.AIR, 10, 0)).toBe(
      ArrivalState.NOT_ARRIVED,
    );
    expect(arrivalStateOf(MblShippingType.AIR, 10, 4)).toBe(
      ArrivalState.PARTIAL,
    );
    expect(arrivalStateOf(MblShippingType.AIR, 10, 10)).toBe(
      ArrivalState.COMPLETE,
    );
    expect(arrivalStateOf(MblShippingType.AIR, 10, 11)).toBe(
      ArrivalState.OVER_RECEIVED,
    );
  });
});

describe('HawbService', () => {
  const house = (overrides: Record<string, unknown> = {}) => ({
    id: 4,
    mbl_id: 9,
    shipping_type: MblShippingType.AIR,
    is_master_mirror: false,
    pieces: 10,
    received: '8',
    ...overrides,
  });

  function build(client: PoolClient) {
    const db = {
      transaction: jest.fn((fn: (c: PoolClient) => Promise<unknown>) =>
        fn(client),
      ),
    };
    const writeHouseWeight = jest.fn().mockResolvedValue(undefined);
    const hbl = {
      findById: jest.fn().mockResolvedValue({ id: 4 }),
      writeHouseWeight,
    } as unknown as HblService;
    const service = new HawbService(
      db as never,
      hbl,
      {} as StatusTracksService,
    );
    return { service, writeHouseWeight };
  }

  it('refuses receiving more pieces than expected without an explicit, reasoned override', async () => {
    const client = fakeClient((sql) =>
      sql.includes('FROM hbl h WHERE h.id') ? [house()] : [{ id: 1 }],
    );
    const { service } = build(client);
    await expect(
      service.addArrival(
        4,
        { flightNumber: 'LY8', arrivalDate: '2026-10-21', piecesReceived: 3 },
        1,
      ),
    ).rejects.toThrow(/עולה על המספר הצפוי/);
    await expect(
      service.addArrival(
        4,
        {
          flightNumber: 'LY8',
          arrivalDate: '2026-10-21',
          piecesReceived: 3,
          override: true,
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records an over-receipt override with its reason in the audit log', async () => {
    const client = fakeClient((sql) =>
      sql.includes('FROM hbl h WHERE h.id') ? [house()] : [{ id: 77 }],
    );
    const { service } = build(client);
    await service.addArrival(
      4,
      {
        flightNumber: 'LY8',
        arrivalDate: '2026-10-21',
        piecesReceived: 3,
        override: true,
        overrideReason: 'Agent shipped one extra carton',
      },
      1,
    );
    const sqls = client.query.mock.calls.map(([sql]) => sql as string);
    expect(sqls.some((sql) => sql.includes('INSERT INTO hbl_arrival'))).toBe(
      true,
    );
    expect(sqls.some((sql) => sql.includes('INSERT INTO audit_log'))).toBe(
      true,
    );
  });

  it('requires a reason to relink after arrival and records the link history', async () => {
    const answer = (sql: string) => {
      if (sql.includes('FROM hbl h WHERE h.id')) return [house()];
      if (sql.includes('FROM mbl WHERE id = $1') && sql.includes('air_method'))
        return [master({ id: 12 })];
      if (sql.includes('MAX(sequence_number)')) return [{ next: 2 }];
      return [];
    };
    const client = fakeClient(answer);
    const { service, writeHouseWeight } = build(client);

    await expect(service.linkToMaster(4, 12, undefined, 1)).rejects.toThrow(
      /מחייב סיבה/,
    );
    await service.linkToMaster(4, 12, 'Offloaded, rebooked', 1);
    const history = (client.query.mock.calls as [string, unknown[]][]).find(
      ([sql]) => sql.includes('INSERT INTO hbl_master_link_history'),
    );
    expect(history?.[1]).toEqual([4, 9, 12, true, 'Offloaded, rebooked', 1]);
    expect(writeHouseWeight).toHaveBeenCalledWith(
      client,
      4,
      '125-12345675',
      expect.objectContaining({ implicit: true }),
    );
  });

  it('allows relinking freely before any arrival', async () => {
    const client = fakeClient((sql) => {
      if (sql.includes('FROM hbl h WHERE h.id'))
        return [house({ received: '0', mbl_id: null })];
      if (sql.includes('air_method')) return [master({ id: 12 })];
      if (sql.includes('MAX(sequence_number)')) return [{ next: 1 }];
      return [];
    });
    const { service } = build(client);
    await service.linkToMaster(4, 12, undefined, 1);
    const history = (client.query.mock.calls as [string, unknown[]][]).find(
      ([sql]) => sql.includes('INSERT INTO hbl_master_link_history'),
    );
    expect(history?.[1]).toEqual([4, null, 12, false, null, 1]);
  });
});
