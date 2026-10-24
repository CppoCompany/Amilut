import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WeightRoundingMode } from './air.enums';
import { WeightRule } from './chargeable-weight';
import {
  AirportDto,
  CargoTerminalDto,
  WeightRuleDto,
} from './dto/air-reference.dto';

interface WeightRuleRow {
  airline_prefix: string | null;
  volumetric_divisor: number;
  rounding_step_kg: string;
  rounding_mode: WeightRoundingMode;
}

/** Read access to the air lookups (`airport`, `cargo_terminal`, `air_weight_rule`).
 *  Nothing here is hard-coded: TLV, the terminals and the 6000 / 0.5 kg
 *  default all come from the database (migration 025). */
@Injectable()
export class AirReferenceService {
  constructor(private readonly db: DatabaseService) {}

  async listAirports(importDestinationOnly = false): Promise<AirportDto[]> {
    const rows = await this.db.query<{
      code: string;
      name_he: string;
      name_en: string;
      is_import_destination: boolean;
    }>(
      `SELECT code, name_he, name_en, is_import_destination
         FROM airport
        WHERE is_active ${importDestinationOnly ? 'AND is_import_destination' : ''}
        ORDER BY code`,
    );
    return rows.map((row) => ({
      code: row.code,
      nameHe: row.name_he,
      nameEn: row.name_en,
      isImportDestination: row.is_import_destination,
    }));
  }

  async listCargoTerminals(): Promise<CargoTerminalDto[]> {
    const rows = await this.db.query<{
      id: number;
      airport_code: string;
      code: string | null;
      name_he: string;
      name_en: string;
    }>(
      `SELECT id, airport_code, code, name_he, name_en
         FROM cargo_terminal
        WHERE is_active
        ORDER BY airport_code, sort_order, id`,
    );
    return rows.map((row) => ({
      id: row.id,
      airportCode: row.airport_code,
      code: row.code,
      nameHe: row.name_he,
      nameEn: row.name_en,
    }));
  }

  /** The airline's own verified rule when one exists, else the default row. */
  async resolveWeightRule(
    airlinePrefix: string | null,
  ): Promise<WeightRuleDto> {
    const row = await this.db.queryOne<WeightRuleRow>(
      `SELECT airline_prefix, volumetric_divisor, rounding_step_kg, rounding_mode
         FROM air_weight_rule
        WHERE airline_prefix = $1 OR airline_prefix IS NULL
        ORDER BY airline_prefix NULLS LAST
        LIMIT 1`,
      [airlinePrefix],
    );
    if (!row) {
      throw new BadRequestException(
        'לא הוגדר כלל ברירת מחדל לחישוב משקל לחיוב (air_weight_rule)',
      );
    }
    return {
      airlinePrefix: row.airline_prefix,
      volumetricDivisor: row.volumetric_divisor,
      roundingStepKg: Number(row.rounding_step_kg),
      roundingMode: row.rounding_mode,
    };
  }

  async assertImportDestination(code: string): Promise<void> {
    const row = await this.db.queryOne<{ code: string }>(
      'SELECT code FROM airport WHERE code = $1 AND is_active AND is_import_destination',
      [code],
    );
    if (!row) {
      throw new BadRequestException(`שדה התעופה ${code} אינו מוגדר כיעד יבוא`);
    }
  }

  async assertCargoTerminal(id: number): Promise<void> {
    const row = await this.db.queryOne<{ id: number }>(
      'SELECT id FROM cargo_terminal WHERE id = $1 AND is_active',
      [id],
    );
    if (!row) {
      throw new BadRequestException(`מסוף המטען ${id} לא נמצא`);
    }
  }

  /** True when `destination` (an `orders.destination` code) is an airport a shipment may arrive at. */
  async isAirImportDestination(destination: string): Promise<boolean> {
    const row = await this.db.queryOne<{ code: string }>(
      `SELECT code FROM airport
        WHERE order_destination = $1 AND is_active AND is_import_destination`,
      [destination],
    );
    return row !== null;
  }
}

export function toWeightRule(dto: WeightRuleDto): WeightRule {
  return {
    volumetricDivisor: dto.volumetricDivisor,
    roundingStepKg: dto.roundingStepKg,
    roundingMode: dto.roundingMode,
  };
}
