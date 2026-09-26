import { ApiProperty } from '@nestjs/swagger';

/**
 * One row of the goods table extracted from a supplier invoice.
 *
 * The extractor always produces numbers, but rows stored by older versions
 * (or hand-edited JSON) may lack a field; the numeric fields are therefore
 * `nullable` so the client can render an empty cell instead of failing.
 */
export class InvoiceLineItemDto {
  @ApiProperty({
    example: 'Y8022-140BK',
    description: 'Item / part / model code as printed (may contain spaces).',
  })
  item!: string;

  @ApiProperty({ example: 'Light Fixtures' })
  description!: string;

  @ApiProperty({ type: 'number', nullable: true, example: 15 })
  quantity!: number | null;

  @ApiProperty({
    type: 'number',
    nullable: true,
    example: 15.32,
    description: 'Unit price with the currency mark stripped.',
  })
  price!: number | null;

  @ApiProperty({
    type: 'number',
    nullable: true,
    example: 229.8,
    description: 'Line total with the currency mark stripped.',
  })
  total!: number | null;
}
