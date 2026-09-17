import { ApiProperty } from '@nestjs/swagger';

/** Public shape of a `customers` row. */
export class CustomerDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ example: 'Acme Imports Ltd.' })
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '1 Herzl St, Tel Aviv',
  })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+972-3-1234567' })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'office@acme.co.il' })
  email!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
