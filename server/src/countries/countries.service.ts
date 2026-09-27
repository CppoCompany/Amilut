import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CountryDto } from './dto/country.dto';

/** Raw `countries` row as returned by `pg`. */
export interface CountryRow {
  id: number;
  name: string;
  key: string;
}

@Injectable()
export class CountriesService {
  constructor(private readonly db: DatabaseService) {}

  /** Every country, ordered by Hebrew name — the list is small (~250) and static. */
  async findAll(): Promise<CountryDto[]> {
    const rows = await this.db.query<CountryRow>(
      'SELECT id, name, key FROM countries ORDER BY name, key',
    );
    return rows.map(toDto);
  }
}

export function toDto(row: CountryRow): CountryDto {
  const dto = new CountryDto();
  dto.id = row.id;
  dto.name = row.name;
  dto.key = row.key;
  return dto;
}
