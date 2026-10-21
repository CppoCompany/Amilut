import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

/** One note written against a supplier-invoice line on the classification screen. */
export class LineItemNoteDto {
  @ApiProperty({ type: 'integer', example: 3 })
  id!: number;

  @ApiProperty({
    type: 'integer',
    example: 42,
    description: 'The `import_account_files` row the line belongs to.',
  })
  fileId!: number;

  @ApiProperty({
    type: 'integer',
    example: 0,
    description: "Position of the line inside that file's `lineItems`.",
  })
  lineIndex!: number;

  @ApiProperty({ example: 'לבדוק מול הספק את חומר הגלם' })
  body!: string;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  createdByName!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T08:30:00.000Z' })
  createdAt!: string;
}

/** Payload of `POST /import-files/line-items/notes`. */
export class CreateLineItemNoteDto {
  @ApiProperty({ type: 'integer', example: 42 })
  @IsInt()
  @Min(1)
  fileId!: number;

  @ApiProperty({ type: 'integer', example: 0 })
  @IsInt()
  @Min(0)
  lineIndex!: number;

  @ApiProperty({ example: 'לבדוק מול הספק את חומר הגלם', maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
