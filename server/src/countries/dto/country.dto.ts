import { ApiProperty } from '@nestjs/swagger';

/** Public shape of a `countries` row (lookup table seeded by migration 014). */
export class CountryDto {
  @ApiProperty({ type: 'integer', example: 106 })
  id!: number;

  /** Hebrew display name. */
  @ApiProperty({ example: 'ישראל' })
  name!: string;

  /** ISO 3166-1 alpha-2 code, used for CSR / customs declarations. */
  @ApiProperty({ example: 'IL', minLength: 2, maxLength: 2 })
  key!: string;
}
