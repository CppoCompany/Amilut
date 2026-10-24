import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  DocumentStatus,
  StatusChangeSource,
  StatusTrack,
} from './status-tracks.enums';
import { StatusTracksService } from './status-tracks.service';

jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

function clientWith(current: string | null, inScope = true) {
  const query = jest.fn((sql: string) =>
    Promise.resolve({
      rows: sql.includes('FOR UPDATE')
        ? [{ value: current, in_scope: inScope }]
        : [],
    }),
  );
  return { query } as unknown as PoolClient & { query: jest.Mock };
}

describe('StatusTracksService', () => {
  const service = new StatusTracksService({} as never);

  it('moves forward without a reason and records a manual history row', async () => {
    const client = clientWith(DocumentStatus.PENDING);
    await service.changeManuallyIn(client, {
      track: StatusTrack.DOCUMENT,
      entityId: 4,
      to: DocumentStatus.UNDER_REVIEW,
      userId: 1,
    });
    const insert = (client.query.mock.calls as [string, unknown[]][]).find(
      ([sql]) => sql.includes('INSERT INTO status_history'),
    );
    expect(insert?.[1]).toEqual([
      'hbl',
      4,
      StatusTrack.DOCUMENT,
      DocumentStatus.PENDING,
      DocumentStatus.UNDER_REVIEW,
      StatusChangeSource.MANUAL,
      null,
      1,
    ]);
  });

  it('treats a backwards move as a correction that needs a reason', async () => {
    const client = clientWith(DocumentStatus.APPROVED);
    await expect(
      service.changeManuallyIn(client, {
        track: StatusTrack.DOCUMENT,
        entityId: 4,
        to: DocumentStatus.PENDING,
        userId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.changeManuallyIn(client, {
      track: StatusTrack.DOCUMENT,
      entityId: 4,
      to: DocumentStatus.PENDING,
      reason: 'Invoice was replaced',
      userId: 1,
    });
    const insert = (client.query.mock.calls as [string, unknown[]][]).find(
      ([sql]) => sql.includes('INSERT INTO status_history'),
    );
    expect(insert?.[1][5]).toBe(StatusChangeSource.CORRECTION);
    expect(insert?.[1][6]).toBe('Invoice was replaced');
  });

  it('refuses tracks on rows outside the air scope (sea rows are untouched)', async () => {
    const client = clientWith(null, false);
    await expect(
      service.changeManuallyIn(client, {
        track: StatusTrack.DOCUMENT,
        entityId: 4,
        to: DocumentStatus.PENDING,
        userId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      (client.query.mock.calls as [string][]).some(([sql]) =>
        sql.startsWith('UPDATE'),
      ),
    ).toBe(false);
  });
});
