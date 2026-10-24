import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { WeightRoundingMode } from '../air.enums';

/** One row of the `airport` lookup (migration 025). */
export class AirportDto {
  @ApiProperty({ example: 'TLV' })
  code!: string;

  @ApiProperty({ example: 'נמל התעופה בן גוריון' })
  nameHe!: string;

  @ApiProperty({ example: 'Ben Gurion Airport' })
  nameEn!: string;

  /** Only these may be a MAWB's destination. */
  @ApiProperty({ example: true })
  isImportDestination!: boolean;
}

export class ListAirportsQuery {
  @ApiPropertyOptional({ description: 'Only airports a MAWB may arrive at.' })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1' || value === 1,
  )
  @IsBoolean()
  importDestination?: boolean;
}

/** One active row of the `cargo_terminal` lookup (migration 025). */
export class CargoTerminalDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ example: 'TLV' })
  airportCode!: string;

  /** `null` until the official terminal code has been verified. */
  @ApiProperty({ type: 'string', nullable: true, example: null })
  code!: string | null;

  @ApiProperty({ example: 'ממ"ן' })
  nameHe!: string;

  @ApiProperty({ example: 'Maman' })
  nameEn!: string;
}

/** The chargeable-weight rule that applies to an airline (or the default). */
export class WeightRuleDto {
  @ApiProperty({ type: 'integer', example: 6000 })
  volumetricDivisor!: number;

  @ApiProperty({ example: 0.5 })
  roundingStepKg!: number;

  @ApiProperty({ enum: WeightRoundingMode, enumName: 'WeightRoundingMode' })
  roundingMode!: WeightRoundingMode;

  /** The airline prefix the rule is specific to; `null` = the default rule. */
  @ApiProperty({ type: 'string', nullable: true, example: null })
  airlinePrefix!: string | null;
}

export class WeightRuleQuery {
  @ApiPropertyOptional({
    example: '114',
    description: '3-digit IATA airline prefix',
  })
  @IsOptional()
  @Matches(/^\d{3}$/)
  airlinePrefix?: string;
}
