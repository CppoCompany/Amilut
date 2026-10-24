import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** One leg of a MAWB's routing, in travel order — `legNo` is assigned by the
 *  server from the array position (1-based). An ATD on the first leg sets
 *  the shipment status to `departed`; an ATA on the last leg to `arrived`. */
export class CreateFlightLegDto {
  @ApiPropertyOptional({ example: 'LY 008' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  flightNumber?: string;

  @ApiPropertyOptional({ example: 'HKG' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  fromAirport?: string;

  @ApiPropertyOptional({ example: 'TLV' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  toAirport?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  etd?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  eta?: string;

  /** Actual time of departure. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  atd?: string;

  /** Actual time of arrival. */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  ata?: string;
}

export class FlightLegDto {
  @ApiProperty({ type: 'integer', example: 1 })
  legNo!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'LY 008' })
  flightNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'HKG' })
  fromAirport!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'TLV' })
  toAirport!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  etd!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  eta!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  atd!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  ata!: string | null;
}
