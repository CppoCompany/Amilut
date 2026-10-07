import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

/** One row of an MBL's container table — only ever populated (and only ever
 *  more than one row) for `sea_method = 'groupage_fcl'`. */
export class CreateMblContainerDto {
  @ApiPropertyOptional({ example: 'MSKU1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  containerNumber?: string;

  @ApiPropertyOptional({ example: 'TCLU1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  containerSealNumber?: string;

  @ApiPropertyOptional({ example: 'CONSOLIDATED CARGO (3 PARTIES / 3 INTERNAL B/Ls)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cargoDescription?: string;

  @ApiPropertyOptional({ example: 5400 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeightKg?: number;

  @ApiPropertyOptional({ example: 25.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCbm?: number;
}

export class MblContainerDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'MSKU1234567' })
  containerNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'TCLU1234567' })
  containerSealNumber!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'CONSOLIDATED CARGO' })
  cargoDescription!: string | null;

  @ApiProperty({ type: 'number', nullable: true, example: 5400 })
  grossWeightKg!: number | null;

  @ApiProperty({ type: 'number', nullable: true, example: 25.5 })
  volumeCbm!: number | null;
}
