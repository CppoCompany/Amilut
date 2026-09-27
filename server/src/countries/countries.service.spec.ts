import type { DatabaseService } from '../database/database.service';

// The real DatabaseService pulls in @nestjs/config (ESM-only), which ts-jest
// does not transform. CountriesService only needs the class as a DI token, so
// stub the module and hand the service a hand-rolled mock.
jest.mock('../database/database.service', () => ({
  DatabaseService: class {},
}));

import { CountriesService, CountryRow } from './countries.service';
import { CountryDto } from './dto/country.dto';

describe('CountriesService', () => {
  let service: CountriesService;
  let db: { query: jest.Mock };

  const rows: CountryRow[] = [
    { id: 106, name: 'ישראל', key: 'IL' },
    { id: 162, name: 'נורווגיה', key: 'NO' },
  ];

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new CountriesService(db as unknown as DatabaseService);
  });

  it('findAll selects every country ordered by name and maps rows to DTOs', async () => {
    db.query.mockResolvedValue(rows);

    const result = await service.findAll();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM countries ORDER BY name/) as string,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(CountryDto);
    expect(result).toEqual([
      { id: 106, name: 'ישראל', key: 'IL' },
      { id: 162, name: 'נורווגיה', key: 'NO' },
    ]);
  });

  it('findAll returns an empty list when the table is empty', async () => {
    db.query.mockResolvedValue([]);
    await expect(service.findAll()).resolves.toEqual([]);
  });
});
