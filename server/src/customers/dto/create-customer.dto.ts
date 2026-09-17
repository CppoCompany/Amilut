import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Trims string input; leaves non-strings untouched so validators can reject them. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Trims string input and turns an empty/whitespace-only string into `null`,
 * so a blank form field clears an optional column instead of storing ''.
 */
const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CreateCustomerDto {
  @ApiProperty({ example: 'Acme Imports Ltd.', minLength: 1, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '1 Herzl St, Tel Aviv',
    maxLength: 500,
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+972-3-1234567',
    maxLength: 50,
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'email',
    example: 'office@acme.co.il',
    maxLength: 255,
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;
}
