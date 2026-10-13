import { ApiProperty } from '@nestjs/swagger';

export class UnreadCountDto {
  @ApiProperty({ type: 'integer', example: 3 })
  count!: number;
}
